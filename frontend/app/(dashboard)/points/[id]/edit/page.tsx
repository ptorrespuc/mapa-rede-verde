import { notFound } from "next/navigation";

import { EditPointPage } from "@/components/points/edit-point-page";
import { requireUserContext } from "@/lib/auth";
import { withGroupLogo, withPointGroupLogo } from "@/lib/group-logos";
import { getPointMedia } from "@/lib/point-timeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GroupRecord,
  PointClassificationRecord,
  PointDetailRecord,
  PointMediaRecord,
  SpeciesRecord,
} from "@/types/domain";

export default async function EditPointRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireUserContext();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: pointData }, { data: groups }, { data: classifications }, { data: speciesCatalog }, pointMedia] = await Promise.all([
    supabase.rpc("get_point", { p_point_id: id }),
    supabase.rpc("list_groups"),
    supabase.rpc("list_point_classifications"),
    supabase.rpc("list_species", { p_only_active: true }),
    getPointMedia(supabase, id),
  ]);

  const rawPoint = (pointData as PointDetailRecord[] | null)?.[0] ?? null;

  if (!rawPoint || (!rawPoint.viewer_can_manage && !rawPoint.viewer_can_request_update)) {
    notFound();
  }

  const point = withPointGroupLogo(rawPoint);

  const availableGroups = (((groups ?? []) as GroupRecord[]) ?? []).map(withGroupLogo);
  const editableGroups = availableGroups.filter((group) => group.id === point.group_id);

  return (
    <EditPointPage
      point={point}
      groups={editableGroups}
      classifications={(classifications ?? []) as PointClassificationRecord[]}
      pointMedia={pointMedia as PointMediaRecord[]}
      speciesCatalog={(speciesCatalog ?? []) as SpeciesRecord[]}
      speciesAdminHref={context.is_super_admin ? "/admin?section=species" : undefined}
    />
  );
}
