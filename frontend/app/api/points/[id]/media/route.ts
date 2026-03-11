import { NextResponse } from "next/server";

import { canViewerSeePoint } from "@/lib/point-visibility";
import { getPointMedia } from "@/lib/point-timeline";
import { loadPointDetailOrThrow, loadViewerProfileId } from "@/lib/server/point-service-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const point = await loadPointDetailOrThrow(supabase, id);
    const viewerProfileId = await loadViewerProfileId(supabase, user?.id ?? null);

    if (!canViewerSeePoint(point, viewerProfileId)) {
      return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
    }

    const media = await getPointMedia(supabase, id);
    return NextResponse.json(media);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar as fotos do ponto." },
      { status: 400 },
    );
  }
}
