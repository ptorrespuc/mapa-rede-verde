import { NextResponse } from "next/server";

import { loadPointTags, normalizePointTag } from "@/lib/point-tags";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function loadTagOrNull(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, id: string) {
  const { data, error } = await loadPointTags(supabase, { onlyActive: false });

  if (error) {
    return { data: null, error };
  }

  return {
    data: (data ?? []).find((item) => item.id === id) ?? null,
    error: null,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload de atualizacao invalido." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.pointClassificationId === "string" && body.pointClassificationId.trim()) {
    patch.point_classification_id = body.pointClassificationId.trim();
  }

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    patch.slug = body.slug.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    patch.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nenhum campo valido foi informado." }, { status: 400 });
  }

  const { error: updateError } = await supabase.from("point_tags").update(patch).eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const loaded = await loadTagOrNull(supabase, id);

  if (loaded.error) {
    return NextResponse.json({ error: loaded.error.message }, { status: 400 });
  }

  if (!loaded.data) {
    return NextResponse.json({ error: "Tag nao encontrada." }, { status: 404 });
  }

  return NextResponse.json(normalizePointTag(loaded.data));
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { count, error: assignmentsError } = await adminSupabase
    .from("point_tag_assignments")
    .select("point_id", { count: "exact", head: true })
    .eq("point_tag_id", id);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
  }

  if (count) {
    const { error: logicalDeleteError } = await supabase
      .from("point_tags")
      .update({ is_active: false })
      .eq("id", id);

    if (logicalDeleteError) {
      return NextResponse.json({ error: logicalDeleteError.message }, { status: 400 });
    }

    const loaded = await loadTagOrNull(supabase, id);

    if (loaded.error) {
      return NextResponse.json({ error: loaded.error.message }, { status: 400 });
    }

    if (!loaded.data) {
      return NextResponse.json({ error: "Tag nao encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      mode: "logical" as const,
      tag: normalizePointTag(loaded.data),
    });
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("point_tags")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (!deletedRows?.length) {
    return NextResponse.json({ error: "Tag nao encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    mode: "physical" as const,
    tag: null,
  });
}
