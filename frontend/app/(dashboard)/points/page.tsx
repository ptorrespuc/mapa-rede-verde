import { cookies } from "next/headers";

import { PointsWorkspace } from "@/components/points/points-workspace";
import { requireUserContext } from "@/lib/auth";
import { withPointGroupLogo } from "@/lib/group-logos";
import { attachPointTagsToPoints, loadPointTags } from "@/lib/point-tags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GroupRecord,
  PointClassificationRecord,
  PointRecord,
  PointTagRecord,
} from "@/types/domain";

export default async function PointsPage({
  searchParams,
}: {
  searchParams?: Promise<{ grupo?: string; group?: string }>;
}) {
  const context = await requireUserContext();
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const savedMapScope = cookieStore.get("map_scope")?.value?.trim() || null;
  const requestedMapScope =
    resolvedSearchParams?.grupo?.trim() ||
    resolvedSearchParams?.group?.trim() ||
    savedMapScope ||
    null;
  const visibleGroups = context.groups;
  const preferredGroup =
    visibleGroups.find((group) => group.id === context.profile.preferred_group_id) ??
    (visibleGroups.filter((group) => Boolean(group.my_role)).length === 1
      ? visibleGroups.find((group) => Boolean(group.my_role)) ?? null
      : null);
  const requestedAllGroups = requestedMapScope === "all";
  let requestedGroup: GroupRecord | null = null;

  if (!requestedAllGroups) {
    requestedGroup = requestedMapScope
      ? visibleGroups.find((group) => group.code === requestedMapScope) ?? preferredGroup
      : preferredGroup;
  }
  const defaultMineOnly =
    context.submission_groups.length > 0 &&
    context.submission_groups.every(
      (group) => !group.viewer_can_manage && !group.viewer_can_approve_points,
    );

  const [{ data: points }, { data: classifications }, pointTagsResponse] = await Promise.all([
    supabase.rpc("list_workspace_points", {
      p_point_classification_id: null,
      p_group_id: requestedGroup?.id ?? null,
      p_pending_only: false,
      p_only_mine: defaultMineOnly,
    }),
    supabase.rpc("list_point_classifications"),
    loadPointTags(supabase, {
      pointClassificationId: null,
      onlyActive: true,
    }),
  ]);

  const initialPoints = ((((points ?? []) as PointRecord[]) ?? [])).filter(
    (point) => point.status !== "archived",
  );
  const initialPointsWithTags = await attachPointTagsToPoints(supabase, initialPoints);

  return (
    <PointsWorkspace
      approvableGroups={context.approvable_groups}
      classifications={(classifications ?? []) as PointClassificationRecord[]}
      initialGroupCode={requestedGroup?.code ?? null}
      initialGroupSelectionWasImplicit={!requestedMapScope && Boolean(preferredGroup)}
      initialPoints={initialPointsWithTags.map(withPointGroupLogo)}
      pointTags={(pointTagsResponse.data ?? []) as PointTagRecord[]}
      submissionGroups={context.submission_groups}
      visibleGroups={visibleGroups}
    />
  );
}
