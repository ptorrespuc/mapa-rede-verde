import { NextResponse } from "next/server";

import { getPointMedia } from "@/lib/point-timeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  try {
    const media = await getPointMedia(supabase, id);
    return NextResponse.json(media);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar as fotos do ponto." },
      { status: 400 },
    );
  }
}
