import { NextResponse } from "next/server";

import {
  loadPointClassifications,
  normalizePointClassification,
} from "@/lib/point-classifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointClassificationRecord } from "@/types/domain";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await loadPointClassifications(supabase, false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json((data ?? []) as PointClassificationRecord[]);
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

  if (!body?.name) {
    return NextResponse.json({ error: "Nome da classificacao e obrigatorio." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_point_classification", {
    p_name: body.name,
    p_slug: body.slug ?? null,
    p_requires_species: Boolean(body.requiresSpecies),
    p_marker_color: body.markerColor ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const classification = (data as PointClassificationRecord[] | null)?.[0];

  if (!classification) {
    return NextResponse.json({ error: "A classificacao nao foi criada." }, { status: 500 });
  }

  return NextResponse.json(normalizePointClassification(classification), { status: 201 });
}
