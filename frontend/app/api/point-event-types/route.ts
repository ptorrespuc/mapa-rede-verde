import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointEventTypeRecord } from "@/types/domain";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const pointClassificationId = new URL(request.url).searchParams.get("pointClassificationId");

  const { data, error } = await supabase.rpc("list_point_event_types", {
    p_point_classification_id: pointClassificationId || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json((data ?? []) as PointEventTypeRecord[]);
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
    return NextResponse.json({ error: "Classificacao e nome do tipo de evento sao obrigatorios." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_point_event_type", {
    p_point_classification_id: body.pointClassificationId,
    p_name: body.name,
    p_slug: body.slug ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const pointEventType = (data as PointEventTypeRecord[] | null)?.[0];

  if (!pointEventType) {
    return NextResponse.json({ error: "O tipo de evento nao foi criado." }, { status: 500 });
  }

  return NextResponse.json(pointEventType, { status: 201 });
}
