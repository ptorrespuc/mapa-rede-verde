import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointEventTypeRecord } from "@/types/domain";

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

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nenhum campo valido foi informado." }, { status: 400 });
  }

  const { error: updateError } = await supabase.from("point_event_types").update(patch).eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data: rows, error: listError } = await supabase.rpc("list_point_event_types", {
    p_point_classification_id: null,
  });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const pointEventType = ((rows ?? []) as PointEventTypeRecord[]).find((item) => item.id === id);

  if (!pointEventType) {
    return NextResponse.json({ error: "Tipo de evento nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(pointEventType);
}
