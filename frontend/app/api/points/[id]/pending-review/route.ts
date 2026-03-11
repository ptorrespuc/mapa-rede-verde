import { NextResponse } from "next/server";

import { loadPendingPointReviewSummary } from "@/lib/pending-point-review";
import { canViewerSeePoint } from "@/lib/point-visibility";
import { loadViewerProfileId } from "@/lib/server/point-service-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointDetailRecord } from "@/types/domain";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const point = (data as PointDetailRecord[] | null)?.[0];

  if (!point) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  const viewerProfileId = await loadViewerProfileId(supabase, user?.id ?? null);

  if (!canViewerSeePoint(point, viewerProfileId)) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  if (!point.has_pending_update) {
    return NextResponse.json(
      { error: "Este ponto nao possui alteracao pendente para revisao." },
      { status: 400 },
    );
  }

  const summary = await loadPendingPointReviewSummary(supabase, point);

  if (!summary) {
    return NextResponse.json(
      { error: "Nao foi possivel montar a visualizacao da alteracao pendente." },
      { status: 400 },
    );
  }

  return NextResponse.json(summary);
}
