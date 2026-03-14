import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AdminUserGroupMembership, AdminUserRecord, UserRole } from "@/types/domain";

const validRoles = new Set<UserRole>([
  "super_admin",
  "group_admin",
  "group_approver",
  "group_collaborator",
]);
const manageableRoles = new Set<UserRole>([
  "group_admin",
  "group_approver",
  "group_collaborator",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const currentUser = await getCurrentUserContext();

  if (!currentUser) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (!currentUser.is_super_admin && !currentUser.has_group_admin) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para editar usuarios." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload de atualizacao invalido." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const manageableGroupIds = new Set(currentUser.manageable_groups.map((group) => group.id));
  const [{ data: existingUser, error: existingUserError }, { data: existingMembershipsData, error: existingMembershipsError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("user_groups")
        .select("group_id, role, groups!inner(name, code)")
        .eq("user_id", id)
        .order("group_id", { ascending: true }),
    ]);

  if (existingUserError) {
    return NextResponse.json({ error: existingUserError.message }, { status: 400 });
  }

  if (existingMembershipsError) {
    return NextResponse.json({ error: existingMembershipsError.message }, { status: 400 });
  }

  if (!existingUser) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const existingMemberships = normalizeMembershipRows(
    (existingMembershipsData ?? []) as MembershipRow[],
  );
  const targetIsSuperAdmin = existingMemberships.some(
    (membership) => membership.role === "super_admin",
  );
  const visibleExistingMemberships = currentUser.is_super_admin
    ? existingMemberships
    : existingMemberships.filter((membership) => manageableGroupIds.has(membership.group_id));

  if (!currentUser.is_super_admin && !visibleExistingMemberships.length) {
    return NextResponse.json({ error: "Usuario fora do seu escopo de administracao." }, { status: 404 });
  }

  if (!currentUser.is_super_admin && targetIsSuperAdmin) {
    return NextResponse.json(
      { error: "Administradores de grupo nao podem editar superusuarios." },
      { status: 403 },
    );
  }

  const nextName =
    currentUser.is_super_admin &&
    typeof body.name === "string" &&
    body.name.trim()
      ? body.name.trim()
      : existingUser.name;
  const nextEmail =
    currentUser.is_super_admin &&
    typeof body.email === "string" &&
    body.email.trim()
      ? body.email.trim().toLowerCase()
      : existingUser.email;
  let preferredGroupId: string | null | undefined;

  let memberships;

  try {
    preferredGroupId = parsePreferredGroupId(body.preferredGroupId);
    memberships = parseMemberships(
      body.memberships,
      currentUser.is_super_admin ? validRoles : manageableRoles,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Os vinculos do usuario nao puderam ser processados.",
      },
      { status: 400 },
    );
  }

  if (currentUser.is_super_admin && (!nextName || !nextEmail)) {
    return NextResponse.json(
      { error: "Nome e e-mail validos sao obrigatorios para editar o usuario." },
      { status: 400 },
    );
  }

  if (memberships) {
    const membershipGroupIds = memberships.map((membership) => membership.groupId);

    if (!currentUser.is_super_admin) {
      if (membershipGroupIds.some((groupId) => !manageableGroupIds.has(groupId))) {
        return NextResponse.json(
          { error: "Voce so pode alterar papeis nos grupos que administra." },
          { status: 403 },
        );
      }
    } else if (membershipGroupIds.length) {
      const { data: groups, error: groupsError } = await admin
        .from("groups")
        .select("id")
        .in("id", membershipGroupIds);

      if (groupsError) {
        return NextResponse.json({ error: groupsError.message }, { status: 400 });
      }

      if ((groups ?? []).length !== membershipGroupIds.length) {
        return NextResponse.json(
          { error: "Um ou mais grupos informados nao existem." },
          { status: 400 },
        );
      }
    }
  }

  const resultingMemberships = memberships
    ? mergeMemberships(existingMemberships, memberships, manageableGroupIds, currentUser.is_super_admin)
    : existingMemberships;
  const resultingMembershipGroupIds = new Set(
    resultingMemberships.map((membership) => membership.group_id),
  );

  if (
    preferredGroupId &&
    !currentUser.is_super_admin &&
    !manageableGroupIds.has(preferredGroupId)
  ) {
    return NextResponse.json(
      { error: "Voce so pode definir como preferencial um grupo que administra." },
      { status: 403 },
    );
  }

  if (preferredGroupId && !resultingMembershipGroupIds.has(preferredGroupId)) {
    return NextResponse.json(
      { error: "O grupo preferencial precisa estar entre os grupos vinculados ao usuario." },
      { status: 400 },
    );
  }

  const nextPreferredGroupId = resolveNextPreferredGroupId(
    preferredGroupId,
    existingUser.preferred_group_id,
    resultingMemberships,
    Boolean(memberships),
  );

  if (currentUser.is_super_admin) {
    const { error: authError } = await admin.auth.admin.updateUserById(existingUser.auth_user_id, {
      email: nextEmail,
      user_metadata: {
        name: nextName,
      },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message ?? "Nao foi possivel atualizar o usuario no Auth." },
        { status: 400 },
      );
    }
  }

  if (memberships) {
    let deleteMembershipsQuery = admin.from("user_groups").delete().eq("user_id", id);

    if (!currentUser.is_super_admin) {
      deleteMembershipsQuery = deleteMembershipsQuery.in(
        "group_id",
        Array.from(manageableGroupIds),
      );
    }

    const { error: deleteMembershipsError } = await deleteMembershipsQuery;

    if (deleteMembershipsError) {
      return NextResponse.json({ error: deleteMembershipsError.message }, { status: 400 });
    }

    if (memberships.length) {
      const { error: insertMembershipsError } = await admin.from("user_groups").insert(
        memberships.map((membership) => ({
          user_id: id,
          group_id: membership.groupId,
          role: membership.role,
        })),
      );

      if (insertMembershipsError) {
        return NextResponse.json({ error: insertMembershipsError.message }, { status: 400 });
      }
    }
  }

  const publicUserUpdatePayload: {
    name?: string;
    email?: string;
    preferred_group_id?: string | null;
  } = {};

  if (currentUser.is_super_admin) {
    publicUserUpdatePayload.name = nextName;
    publicUserUpdatePayload.email = nextEmail;
  }

  if (
    nextPreferredGroupId !== existingUser.preferred_group_id ||
    Boolean(memberships) ||
    currentUser.is_super_admin
  ) {
    publicUserUpdatePayload.preferred_group_id = nextPreferredGroupId;
  }

  if (Object.keys(publicUserUpdatePayload).length) {
    const { error: publicUserError } = await admin
      .from("users")
      .update(publicUserUpdatePayload)
      .eq("id", id);

    if (publicUserError) {
      return NextResponse.json({ error: publicUserError.message }, { status: 400 });
    }
  }

  let updatedUser: AdminUserRecord | null;

  try {
    updatedUser = await loadAdminUser(
      admin,
      id,
      currentUser.is_super_admin ? null : manageableGroupIds,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel recarregar o usuario atualizado.",
      },
      { status: 400 },
    );
  }

  if (!updatedUser) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(updatedUser);
}

async function loadAdminUser(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  visibleGroupIds: Set<string> | null,
): Promise<AdminUserRecord | null> {
  const [{ data: user, error: userError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("user_groups")
        .select("group_id, role, groups!inner(name, code)")
        .eq("user_id", userId)
        .order("group_id", { ascending: true }),
    ]);

  if (userError) {
    throw userError;
  }

  if (membershipsError) {
    throw membershipsError;
  }

  if (!user) {
    return null;
  }

  const normalizedMemberships = normalizeMembershipRows((memberships ?? []) as MembershipRow[]);
  const visibleMemberships = visibleGroupIds
    ? normalizedMemberships.filter((membership) => visibleGroupIds.has(membership.group_id))
    : normalizedMemberships;

  return {
    ...user,
    ...resolvePreferredGroup(visibleMemberships, user.preferred_group_id),
    memberships: visibleMemberships,
    hidden_membership_count: Math.max(
      normalizedMemberships.length - visibleMemberships.length,
      0,
    ),
  };
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

function normalizeMembershipRows(memberships: MembershipRow[]): AdminUserGroupMembership[] {
  return memberships
    .map((membership) => {
      const groupRecord = Array.isArray(membership.groups)
        ? membership.groups[0]
        : membership.groups;

      if (!groupRecord) {
        return null;
      }

      return {
        group_id: membership.group_id,
        group_name: groupRecord.name,
        group_code: groupRecord.code,
        role: membership.role,
      };
    })
    .filter((membership): membership is NonNullable<typeof membership> => membership !== null);
}

function parseMemberships(rawMemberships: unknown, allowedRoles: Set<UserRole>) {
  if (rawMemberships === undefined) {
    return null;
  }

  if (!Array.isArray(rawMemberships)) {
    throw new Error("Os vinculos do usuario precisam ser enviados em lista.");
  }

  const normalized = new Map<string, UserRole>();

  for (const membership of rawMemberships) {
    if (!membership || typeof membership !== "object") {
      throw new Error("Foi encontrado um vinculo de grupo invalido.");
    }

    const groupId =
      typeof (membership as { groupId?: unknown }).groupId === "string"
        ? (membership as { groupId: string }).groupId.trim()
        : "";
    const role = (membership as { role?: unknown }).role;

    if (!groupId || !role || !allowedRoles.has(role as UserRole)) {
      throw new Error("Foi encontrado um vinculo de grupo invalido.");
    }

    normalized.set(groupId, role as UserRole);
  }

  return Array.from(normalized.entries()).map(([groupId, role]) => ({
    groupId,
    role,
  }));
}

function parsePreferredGroupId(rawPreferredGroupId: unknown) {
  if (rawPreferredGroupId === undefined) {
    return undefined;
  }

  if (rawPreferredGroupId === null) {
    return null;
  }

  if (typeof rawPreferredGroupId !== "string") {
    throw new Error("O grupo preferencial informado e invalido.");
  }

  const normalized = rawPreferredGroupId.trim();
  return normalized || null;
}

function mergeMemberships(
  existingMemberships: AdminUserGroupMembership[],
  incomingMemberships: Array<{ groupId: string; role: UserRole }>,
  manageableGroupIds: Set<string>,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) {
    return incomingMemberships.map((membership) => ({
      group_id: membership.groupId,
      group_name: existingMemberships.find((item) => item.group_id === membership.groupId)?.group_name ?? "",
      group_code: existingMemberships.find((item) => item.group_id === membership.groupId)?.group_code ?? "",
      role: membership.role,
    }));
  }

  const preservedMemberships = existingMemberships.filter(
    (membership) => !manageableGroupIds.has(membership.group_id),
  );
  const editableMemberships = incomingMemberships.map((membership) => ({
    group_id: membership.groupId,
    group_name: existingMemberships.find((item) => item.group_id === membership.groupId)?.group_name ?? "",
    group_code: existingMemberships.find((item) => item.group_id === membership.groupId)?.group_code ?? "",
    role: membership.role,
  }));

  return [...preservedMemberships, ...editableMemberships];
}

function resolveNextPreferredGroupId(
  requestedPreferredGroupId: string | null | undefined,
  existingPreferredGroupId: string | null,
  resultingMemberships: AdminUserGroupMembership[],
  membershipsWereUpdated: boolean,
) {
  const resultingGroupIds = new Set(resultingMemberships.map((membership) => membership.group_id));

  if (requestedPreferredGroupId !== undefined) {
    return requestedPreferredGroupId;
  }

  if (existingPreferredGroupId && resultingGroupIds.has(existingPreferredGroupId)) {
    return existingPreferredGroupId;
  }

  if (membershipsWereUpdated) {
    return resultingMemberships[0]?.group_id ?? null;
  }

  return existingPreferredGroupId;
}

type MembershipRow = {
  group_id: string;
  role: UserRole;
  groups: { name: string; code: string } | Array<{ name: string; code: string }>;
};
