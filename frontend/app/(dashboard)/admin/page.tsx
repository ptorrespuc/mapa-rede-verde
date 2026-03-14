import { AdminPanel } from "@/components/admin/admin-panel";
import { requireUserContext } from "@/lib/auth";
import { withGroupLogo } from "@/lib/group-logos";
import { loadPointClassifications } from "@/lib/point-classifications";
import { loadPointTags } from "@/lib/point-tags";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AdminUserGroupMembership,
  AdminUserRecord,
  GroupRecord,
  PointClassificationRecord,
  PointEventTypeRecord,
  PointTagRecord,
  SpeciesRecord,
  UserRole,
} from "@/types/domain";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string; commonName?: string }>;
}) {
  const context = await requireUserContext();

  if (!context.is_super_admin && !context.has_group_admin) {
    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Administracao</p>
            <h1>Acesso restrito</h1>
          </div>
        </div>
        <div className="panel">
          <p className="subtitle">
            Esta area e reservada para superusuarios e administradores de grupo.
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const adminSupabase = createAdminSupabaseClient();
  const manageableGroupIds = context.manageable_groups.map((group) => group.id);
  const visibleGroupIds = context.groups.map((group) => group.id);
  const canManageGlobalCatalogs = context.is_super_admin;

  const [
    groupRows,
    classificationsResponse,
    pointTagsResponse,
    eventTypesResponse,
    speciesCatalogResponse,
    initialUsers,
  ] =
    await Promise.all([
      context.is_super_admin
        ? supabase.rpc("list_groups")
        : Promise.resolve({ data: context.groups, error: null }),
      canManageGlobalCatalogs
        ? loadPointClassifications(supabase, true)
        : Promise.resolve({ data: [] as PointClassificationRecord[], error: null }),
      canManageGlobalCatalogs
        ? loadPointTags(supabase, {
            pointClassificationId: null,
            onlyActive: false,
          })
        : Promise.resolve({ data: [] as PointTagRecord[], error: null }),
      canManageGlobalCatalogs
        ? supabase.rpc("list_point_event_types", {
            p_point_classification_id: null,
          })
        : Promise.resolve({ data: [] as PointEventTypeRecord[], error: null }),
      canManageGlobalCatalogs
        ? supabase.rpc("list_species", {
            p_only_active: false,
          })
        : Promise.resolve({ data: [] as SpeciesRecord[], error: null }),
      loadAdminUsers(adminSupabase, {
        isSuperAdmin: context.is_super_admin,
        visibleGroupIds,
        manageableGroupIds,
      }),
    ]);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedSection =
    resolvedSearchParams?.section === "tags"
      ? "classifications"
      : resolvedSearchParams?.section;
  const availableSections = context.is_super_admin
    ? ["groups", "users", "classifications", "event-types", "species"]
    : ["groups", "users"];
  const initialSection =
    requestedSection && availableSections.includes(requestedSection)
      ? (requestedSection as
          | "groups"
          | "users"
          | "classifications"
          | "event-types"
          | "species")
      : "groups";

  return (
    <AdminPanel
      canCreateGroups={context.is_super_admin}
      canEditUserIdentity={context.is_super_admin}
      canInviteUsers={context.is_super_admin}
      canManageGlobalCatalogs={canManageGlobalCatalogs}
      manageableGroupIds={manageableGroupIds}
      initialGroups={(((groupRows.data ?? []) as GroupRecord[]) ?? []).map(withGroupLogo)}
      initialClassifications={
        (classificationsResponse.data ?? []) as PointClassificationRecord[]
      }
      initialEventTypes={(eventTypesResponse.data ?? []) as PointEventTypeRecord[]}
      initialSpeciesCatalog={(speciesCatalogResponse.data ?? []) as SpeciesRecord[]}
      initialUsers={initialUsers}
      initialSection={initialSection}
      initialPointTags={(pointTagsResponse.data ?? []) as PointTagRecord[]}
      initialSpeciesCommonName={resolvedSearchParams?.commonName ?? ""}
    />
  );
}

async function loadAdminUsers(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  options: { isSuperAdmin: boolean; visibleGroupIds: string[]; manageableGroupIds: string[] },
): Promise<AdminUserRecord[]> {
  if (options.isSuperAdmin) {
    const [{ data: usersData, error: usersError }, { data: membershipsData, error: membershipsError }] =
      await Promise.all([
        adminSupabase
          .from("users")
          .select("id, auth_user_id, name, email, preferred_group_id, created_at")
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

    const membershipsByUserId = buildMembershipMap(
      (membershipsData ?? []) as MembershipQueryRow[],
    );

    return ((usersData ?? []) as UserQueryRow[]).map<AdminUserRecord>((user) => ({
      ...user,
      ...resolvePreferredGroup(membershipsByUserId.get(user.id) ?? [], user.preferred_group_id),
      memberships: membershipsByUserId.get(user.id) ?? [],
      hidden_membership_count: 0,
    }));
  }

  if (!options.visibleGroupIds.length) {
    return [];
  }

  const { data: visibleMembershipsData, error: visibleMembershipsError } = await adminSupabase
    .from("user_groups")
    .select("user_id, group_id, role, groups!inner(name, code)")
    .in("group_id", options.visibleGroupIds)
    .order("group_id", { ascending: true });

  if (visibleMembershipsError) {
    throw new Error(visibleMembershipsError.message);
  }

  const visibleMemberships = (visibleMembershipsData ?? []) as MembershipQueryRow[];
  const userIds = Array.from(new Set(visibleMemberships.map((membership) => membership.user_id)));

  if (!userIds.length) {
    return [];
  }

  const [{ data: usersData, error: usersError }, { data: allMembershipsData, error: allMembershipsError }] =
    await Promise.all([
      adminSupabase
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .in("id", userIds)
        .order("name", { ascending: true }),
      adminSupabase
        .from("user_groups")
        .select("user_id, role")
        .in("user_id", userIds),
    ]);

  if (usersError) {
    throw new Error(usersError.message);
  }

  if (allMembershipsError) {
    throw new Error(allMembershipsError.message);
  }

  const visibleMembershipsByUserId = buildMembershipMap(visibleMemberships);
  const totalMembershipCountByUserId = new Map<string, number>();
  const superAdminUserIds = new Set<string>();

  for (const membership of (allMembershipsData ?? []) as Array<{ user_id: string; role: UserRole }>) {
    totalMembershipCountByUserId.set(
      membership.user_id,
      (totalMembershipCountByUserId.get(membership.user_id) ?? 0) + 1,
    );

    if (membership.role === "super_admin") {
      superAdminUserIds.add(membership.user_id);
    }
  }

  return ((usersData ?? []) as UserQueryRow[])
    .filter((user) => !superAdminUserIds.has(user.id))
    .map<AdminUserRecord>((user) => {
      const memberships = visibleMembershipsByUserId.get(user.id) ?? [];
      const totalMemberships = totalMembershipCountByUserId.get(user.id) ?? memberships.length;

      return {
        ...user,
        ...resolvePreferredGroup(memberships, user.preferred_group_id),
        memberships,
        hidden_membership_count: Math.max(totalMemberships - memberships.length, 0),
      };
    });
}

function buildMembershipMap(memberships: MembershipQueryRow[]) {
  const membershipsByUserId = new Map<string, AdminUserGroupMembership[]>();

  for (const membership of memberships) {
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

  return membershipsByUserId;
}

function resolvePreferredGroup(
  memberships: AdminUserGroupMembership[],
  preferredGroupId: string | null,
) {
  const preferredMembership = memberships.find((membership) => membership.group_id === preferredGroupId);

  return {
    preferred_group_id: preferredGroupId,
    preferred_group_name: preferredMembership?.group_name ?? null,
    preferred_group_code: preferredMembership?.group_code ?? null,
    preferred_group_hidden: Boolean(preferredGroupId) && !preferredMembership,
  };
}

type UserQueryRow = {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  preferred_group_id: string | null;
  created_at: string;
};

type MembershipQueryRow = {
  user_id: string;
  group_id: string;
  role: UserRole;
  groups: { name: string; code: string } | Array<{ name: string; code: string }>;
};
