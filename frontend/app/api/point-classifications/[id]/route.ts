import { NextResponse } from "next/server";

import {
  loadPointClassifications,
  normalizePointClassification,
} from "@/lib/point-classifications";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    patch.slug = body.slug.trim();
  }

  if (typeof body.requiresSpecies === "boolean") {
    patch.requires_species = body.requiresSpecies;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (typeof body.markerColor === "string" && body.markerColor.trim()) {
    patch.marker_color = body.markerColor.trim();
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nenhum campo valido foi informado." }, { status: 400 });
  }

  let { error: updateError } = await supabase
    .from("point_classifications")
    .update(patch)
    .eq("id", id);

  if (
    updateError &&
    "is_active" in patch &&
    shouldRetryClassificationUpdateWithoutStatus(updateError.message)
  ) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.is_active;
    const fallbackResponse = await supabase
      .from("point_classifications")
      .update(fallbackPatch)
      .eq("id", id);
    updateError = fallbackResponse.error;
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data: rows, error: listError } = await loadPointClassifications(supabase, true);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const classification = (rows ?? []).find((item) => item.id === id);

  if (!classification) {
    return NextResponse.json({ error: "Classificacao nao encontrada." }, { status: 404 });
  }

  return NextResponse.json(classification);
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
  const [{ count: pointsCount, error: pointsError }, { count: eventTypesCount, error: eventTypesError }] =
    await Promise.all([
      adminSupabase
        .from("points")
        .select("id", { count: "exact", head: true })
        .eq("point_classification_id", id),
      adminSupabase
        .from("point_event_types")
        .select("id", { count: "exact", head: true })
        .eq("point_classification_id", id),
    ]);

  if (pointsError) {
    return NextResponse.json({ error: pointsError.message }, { status: 400 });
  }

  if (eventTypesError) {
    return NextResponse.json({ error: eventTypesError.message }, { status: 400 });
  }

  const hasRelationships = Boolean(pointsCount) || Boolean(eventTypesCount);

  if (hasRelationships) {
    const { error: logicalDeleteError } = await supabase
      .from("point_classifications")
      .update({ is_active: false })
      .eq("id", id);

    if (logicalDeleteError && shouldRetryClassificationDeleteWithoutStatus(logicalDeleteError.message)) {
      return NextResponse.json(
        {
          error:
            "A exclusao logica da classificacao depende da migration nova do banco. O codigo ja foi preparado, mas o schema remoto ainda precisa ser atualizado.",
        },
        { status: 409 },
      );
    }

    if (logicalDeleteError) {
      return NextResponse.json({ error: logicalDeleteError.message }, { status: 400 });
    }

    const { data: rows, error: listError } = await loadPointClassifications(supabase, true);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }

    const classification = (rows ?? []).find((item) => item.id === id);

    if (!classification) {
      return NextResponse.json({ error: "Classificacao nao encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      mode: "logical" as const,
      classification: normalizePointClassification(classification),
    });
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("point_classifications")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (!deletedRows?.length) {
    return NextResponse.json({ error: "Classificacao nao encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    mode: "physical" as const,
    classification: null,
  });
}

function shouldRetryClassificationUpdateWithoutStatus(message: string) {
  return message.toLowerCase().includes("is_active");
}

function shouldRetryClassificationDeleteWithoutStatus(message: string) {
  return message.toLowerCase().includes("is_active");
}
