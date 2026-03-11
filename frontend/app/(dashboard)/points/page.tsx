import { PointsWorkspace } from "@/components/points/points-workspace";
import { requireUserContext } from "@/lib/auth";
import { withPointGroupLogo } from "@/lib/group-logos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointClassificationRecord, PointRecord } from "@/types/domain";

export default async function PointsPage({
  searchParams,
}: {
  searchParams?: Promise<{ grupo?: string; group?: string }>;
}) {
  const context = await requireUserContext();
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedGroupCode =
    resolvedSearchParams?.grupo?.trim() || resolvedSearchParams?.group?.trim() || null;
  const requestedGroup =
    (requestedGroupCode
      ? context.groups.find((group) => group.code === requestedGroupCode)
      : null) ?? null;
  const defaultMineOnly =
    context.submission_groups.length > 0 &&
    context.submission_groups.every(
      (group) => !group.viewer_can_manage && !group.viewer_can_approve_points,
    );

  const [{ data: points }, { data: classifications }] = await Promise.all([
    supabase.rpc("list_workspace_points", {
      p_point_classification_id: null,
      p_group_id: requestedGroup?.id ?? null,
      p_pending_only: false,
      p_only_mine: defaultMineOnly,
    }),
    supabase.rpc("list_point_classifications"),
  ]);

  return (
    <PointsWorkspace
      approvableGroups={context.approvable_groups}
      classifications={(classifications ?? []) as PointClassificationRecord[]}
      initialGroupCode={requestedGroup?.code ?? null}
      initialPoints={((((points ?? []) as PointRecord[]) ?? [])).filter((point) => point.status !== "archived").map(withPointGroupLogo)}
      submissionGroups={context.submission_groups}
      visibleGroups={context.groups}
    />
  );
}
