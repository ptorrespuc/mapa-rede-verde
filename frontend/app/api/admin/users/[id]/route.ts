import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AdminUserRecord, UserRole } from "@/types/domain";

const validRoles = new Set<UserRole>([
  "super_admin",
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

  if (!currentUser.is_super_admin) {
    return NextResponse.json(
      { error: "Apenas superusuarios podem editar usuarios." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload de atualizacao invalido." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: existingUser, error: existingUserError } = await admin
    .from("users")
    .select("id, auth_user_id, name, email, created_at")
    .eq("id", id)
    .maybeSingle();

  if (existingUserError) {
    return NextResponse.json({ error: existingUserError.message }, { status: 400 });
  }

  if (!existingUser) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const nextName =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : existingUser.name;
  const nextEmail =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase()
      : existingUser.email;

  let memberships;

  try {
    memberships = parseMemberships(body.memberships);
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

  if (!nextName || !nextEmail) {
    return NextResponse.json(
      { error: "Nome e e-mail validos sao obrigatorios para editar o usuario." },
      { status: 400 },
    );
  }

  if (memberships) {
    const membershipGroupIds = memberships.map((membership) => membership.groupId);

    if (membershipGroupIds.length) {
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

  const { error: publicUserError } = await admin
    .from("users")
    .update({
      name: nextName,
      email: nextEmail,
    })
    .eq("id", id);

  if (publicUserError) {
    return NextResponse.json({ error: publicUserError.message }, { status: 400 });
  }

  if (memberships) {
    const { error: deleteMembershipsError } = await admin
      .from("user_groups")
      .delete()
      .eq("user_id", id);

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

  let updatedUser: AdminUserRecord | null;

  try {
    updatedUser = await loadAdminUser(admin, id);
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
): Promise<AdminUserRecord | null> {
  const [{ data: user, error: userError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, auth_user_id, name, email, created_at")
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

  return {
    ...user,
    memberships: ((memberships ?? []) as Array<{
      group_id: string;
      role: UserRole;
      groups: { name: string; code: string } | Array<{ name: string; code: string }>;
    }>)
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
      .filter((membership): membership is NonNullable<typeof membership> => membership !== null),
  };
}

function parseMemberships(rawMemberships: unknown) {
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

    if (!groupId || !role || !validRoles.has(role as UserRole)) {
      throw new Error("Foi encontrado um vinculo de grupo invalido.");
    }

    normalized.set(groupId, role as UserRole);
  }

  return Array.from(normalized.entries()).map(([groupId, role]) => ({
    groupId,
    role,
  }));
}
