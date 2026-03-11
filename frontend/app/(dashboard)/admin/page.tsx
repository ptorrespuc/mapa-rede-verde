import { AdminPanel } from "@/components/admin/admin-panel";
import { requireUserContext } from "@/lib/auth";
import { withGroupLogo } from "@/lib/group-logos";
import { loadPointClassifications } from "@/lib/point-classifications";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AdminUserRecord,
  GroupRecord,
  PointClassificationRecord,
  PointEventTypeRecord,
  SpeciesRecord,
  UserRole,
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
  const adminSupabase = createAdminSupabaseClient();
  const [
    { data: groups },
    classificationsResponse,
    { data: eventTypes },
    { data: speciesCatalog },
    { data: usersData, error: usersError },
    { data: membershipsData, error: membershipsError },
  ] = await Promise.all([
    supabase.rpc("list_groups"),
    loadPointClassifications(supabase, true),
    supabase.rpc("list_point_event_types", {
      p_point_classification_id: null,
    }),
    supabase.rpc("list_species", {
      p_only_active: false,
    }),
    adminSupabase
      .from("users")
      .select("id, auth_user_id, name, email, created_at")
      .order("name", { ascending: true }),
    adminSupabase
      .from("user_groups")
      .select("user_id, group_id, role, groups!inner(name, code)")
      .order("group_id", { ascending: true }),
  ]);

  if (usersError) {
    throw new Error(usersError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const membershipsByUserId = new Map<
    string,
    Array<{ group_id: string; group_name: string; group_code: string; role: UserRole }>
  >();

  for (const membership of (membershipsData ?? []) as Array<{
    user_id: string;
    group_id: string;
    role: UserRole;
    groups: { name: string; code: string } | Array<{ name: string; code: string }>;
  }>) {
    const groupRecord = Array.isArray(membership.groups)
      ? membership.groups[0]
      : membership.groups;

    if (!groupRecord) {
      continue;
    }

    const current = membershipsByUserId.get(membership.user_id) ?? [];
    current.push({
      group_id: membership.group_id,
      group_name: groupRecord.name,
      group_code: groupRecord.code,
      role: membership.role,
    });
    membershipsByUserId.set(membership.user_id, current);
  }

  const initialUsers = ((usersData ?? []) as Array<{
    id: string;
    auth_user_id: string;
    name: string;
    email: string;
    created_at: string;
  }>).map<AdminUserRecord>((user) => ({
    ...user,
    memberships: membershipsByUserId.get(user.id) ?? [],
  }));

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
      initialUsers={initialUsers}
      initialSection={initialSection}
      initialSpeciesCommonName={resolvedSearchParams?.commonName ?? ""}
    />
  );
}
