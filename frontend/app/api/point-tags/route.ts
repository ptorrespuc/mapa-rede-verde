import { NextResponse } from "next/server";

import { loadPointTags, normalizePointTag } from "@/lib/point-tags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointTagRecord } from "@/types/domain";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const searchParams = new URL(request.url).searchParams;
  const pointClassificationId = searchParams.get("pointClassificationId");
  const onlyActive = searchParams.get("onlyActive");
  const { data, error } = await loadPointTags(supabase, {
    pointClassificationId: pointClassificationId || null,
    onlyActive: onlyActive === null ? true : onlyActive !== "false",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json((data ?? []) as PointTagRecord[]);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.pointClassificationId || !body?.name) {
    return NextResponse.json(
      { error: "Classificacao e nome da tag sao obrigatorios." },
      { status: 400 },
    );
  }

  const payload = {
    point_classification_id: String(body.pointClassificationId).trim(),
    name: String(body.name).trim(),
    slug: typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null,
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    is_active: typeof body.isActive === "boolean" ? body.isActive : true,
  };

  const { error: insertError } = await supabase.from("point_tags").insert(payload);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const { data, error } = await loadPointTags(supabase, {
    pointClassificationId: payload.point_classification_id,
    onlyActive: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const tag = (data ?? []).find(
    (item) =>
      item.point_classification_id === payload.point_classification_id &&
      item.name.localeCompare(payload.name, "pt-BR", { sensitivity: "base" }) === 0,
  );

  if (!tag) {
    return NextResponse.json({ error: "A tag nao foi criada." }, { status: 500 });
  }

  return NextResponse.json(normalizePointTag(tag), { status: 201 });
}
