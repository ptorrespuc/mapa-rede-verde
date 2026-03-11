import { NewPointPage } from "@/components/points/new-point-page";
import { requireUserContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GroupRecord, PointClassificationRecord, SpeciesRecord } from "@/types/domain";

export default async function NewPointRoute({
  searchParams,
}: {
  searchParams?: Promise<{ grupo?: string; group?: string }>;
}) {
  const context = await requireUserContext();
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedGroupCode =
    resolvedSearchParams?.grupo?.trim() || resolvedSearchParams?.group?.trim() || null;
  const [{ data: classifications }, { data: speciesCatalog }] = await Promise.all([
    supabase.rpc("list_point_classifications"),
    supabase.rpc("list_species", { p_only_active: true }),
  ]);

  const requestedGroup =
    (requestedGroupCode
      ? context.submission_groups.find((group) => group.code === requestedGroupCode)
      : null) ?? null;

  return (
    <NewPointPage
      groups={context.submission_groups}
      initialGroup={requestedGroup as GroupRecord | null}
      classifications={(classifications ?? []) as PointClassificationRecord[]}
      speciesCatalog={(speciesCatalog ?? []) as SpeciesRecord[]}
      speciesAdminHref={context.is_super_admin ? "/admin?section=species" : undefined}
    />
  );
}
