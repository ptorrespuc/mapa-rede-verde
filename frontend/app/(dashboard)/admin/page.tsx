import { AdminPanel } from "@/components/admin/admin-panel";
import { requireUserContext } from "@/lib/auth";
import { withGroupLogo } from "@/lib/group-logos";
import { loadPointClassifications } from "@/lib/point-classifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GroupRecord,
  PointClassificationRecord,
  PointEventTypeRecord,
  SpeciesRecord,
} from "@/types/domain";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string; commonName?: string }>;
}) {
  const context = await requireUserContext();

  if (!context.is_super_admin) {
    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Administracao</p>
            <h1>Acesso restrito ao superusuario</h1>
          </div>
        </div>
        <div className="panel">
          <p className="subtitle">
            Esta area e reservada para gestao global de grupos e criacao de usuarios.
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: groups }, classificationsResponse, { data: eventTypes }, { data: speciesCatalog }] = await Promise.all([
    supabase.rpc("list_groups"),
    loadPointClassifications(supabase, true),
    supabase.rpc("list_point_event_types", {
      p_point_classification_id: null,
    }),
    supabase.rpc("list_species", {
      p_only_active: false,
    }),
  ]);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSection =
    resolvedSearchParams?.section === "users" ||
    resolvedSearchParams?.section === "classifications" ||
    resolvedSearchParams?.section === "event-types" ||
    resolvedSearchParams?.section === "species"
      ? resolvedSearchParams.section
      : "groups";

  return (
    <AdminPanel
      initialGroups={(((groups ?? []) as GroupRecord[]) ?? []).map(withGroupLogo)}
      initialClassifications={
        (classificationsResponse.data ?? []) as PointClassificationRecord[]
      }
      initialEventTypes={(eventTypes ?? []) as PointEventTypeRecord[]}
      initialSpeciesCatalog={(speciesCatalog ?? []) as SpeciesRecord[]}
      initialSection={initialSection}
      initialSpeciesCommonName={resolvedSearchParams?.commonName ?? ""}
    />
  );
}
