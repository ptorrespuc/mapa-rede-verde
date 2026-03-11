import { NextResponse } from "next/server";

import { withPointGroupLogo } from "@/lib/group-logos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointRecord } from "@/types/domain";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const classificationIdParam = searchParams.get("classificationId");
  const groupIdParam = searchParams.get("groupId");
  const pendingOnly = searchParams.get("pendingOnly") === "true";
  const mineOnly = searchParams.get("mineOnly") === "true";
  const classificationId =
    classificationIdParam && classificationIdParam !== "all" ? classificationIdParam : null;
  const groupId = groupIdParam && groupIdParam !== "all" ? groupIdParam : null;

  const { data, error } = await supabase.rpc("list_workspace_points", {
    p_point_classification_id: classificationId,
    p_group_id: groupId,
    p_pending_only: pendingOnly,
    p_only_mine: mineOnly,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    (((data ?? []) as PointRecord[]) ?? [])
      .filter((point) => point.status !== "archived")
      .map(withPointGroupLogo),
  );
}
