import { cookies } from "next/headers";

import { MapDashboard } from "@/components/map/map-dashboard";
import { getCurrentUserContext } from "@/lib/auth";
import { withGroupLogo, withPointGroupLogo } from "@/lib/group-logos";
import { filterVisiblePoints } from "@/lib/point-visibility";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GroupRecord,
  PointClassificationRecord,
  PointRecord,
  SpeciesRecord,
} from "@/types/domain";

export default async function MapPage({
  searchParams,
}: {
  searchParams?: Promise<{ grupo?: string; group?: string }>;
}) {
  const context = await getCurrentUserContext();
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const savedMapScope = cookieStore.get("map_scope")?.value?.trim() || null;
  const requestedMapScope =
    resolvedSearchParams?.grupo?.trim() ||
    resolvedSearchParams?.group?.trim() ||
    savedMapScope ||
    null;

  const [{ data: groups }, { data: classifications }, { data: speciesCatalog }] = await Promise.all([
    supabase.rpc("list_groups"),
    supabase.rpc("list_point_classifications"),
    supabase.rpc("list_species", { p_only_active: true }),
  ]);

  const visibleGroups = ((((groups ?? []) as GroupRecord[]) ?? [])).map(withGroupLogo);
  const preferredGroup =
    visibleGroups.filter((group) => Boolean(group.my_role)).length === 1
      ? visibleGroups.find((group) => Boolean(group.my_role)) ?? null
      : null;
  const requestedAllGroups = requestedMapScope === "all";
  let requestedGroup: GroupRecord | null = null;

  if (!requestedAllGroups) {
    requestedGroup = requestedMapScope
      ? visibleGroups.find((group) => group.code === requestedMapScope) ?? preferredGroup
      : preferredGroup;
  }

  const { data: points } = await supabase.rpc("list_points", {
    p_point_classification_id: null,
    p_group_id: requestedGroup?.id ?? null,
  });

  return (
    <MapDashboard
      initialPoints={filterVisiblePoints(
        (((points ?? []) as PointRecord[]) ?? []),
        context?.profile.id ?? null,
      ).map(withPointGroupLogo)}
      initialGroupCode={requestedGroup?.code ?? null}
      initialGroupSelectionWasImplicit={!requestedMapScope && Boolean(preferredGroup)}
      visibleGroups={visibleGroups}
      submissionGroups={context?.submission_groups ?? []}
      approvableGroups={context?.approvable_groups ?? []}
      classifications={((classifications ?? []) as PointClassificationRecord[]) ?? []}
      speciesCatalog={((speciesCatalog ?? []) as SpeciesRecord[]) ?? []}
      speciesAdminHref={context?.is_super_admin ? "/admin?section=species" : undefined}
      isAuthenticated={Boolean(context)}
    />
  );
}
