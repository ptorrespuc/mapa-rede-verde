import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/domain";

const validRoles = new Set<UserRole>([
  "super_admin",
  "group_admin",
  "group_approver",
  "group_collaborator",
]);

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!context.is_super_admin) {
    return NextResponse.json({ error: "Apenas superusuários podem criar usuários." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (
    !body?.name ||
    !body?.email ||
    !body?.groupId ||
    !body?.role ||
    !validRoles.has(body.role)
  ) {
    return NextResponse.json({ error: "Payload de criação de usuário inválido." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const email = String(body.email).trim().toLowerCase();
  const name = String(body.name).trim();
  const preferredGroupId =
    typeof body.preferredGroupId === "string" && body.preferredGroupId.trim()
      ? body.preferredGroupId.trim()
      : body.groupId;
  const redirectTo = new URL("/login", request.url).toString();

  if (preferredGroupId !== body.groupId) {
    return NextResponse.json(
      { error: "O grupo preferencial inicial precisa ser o mesmo grupo vinculado no cadastro." },
      { status: 400 },
    );
  }

  const { data: createdUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      name,
    },
    redirectTo,
  });

  if (authError || !createdUser.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Não foi possível criar o usuário no Auth." },
      { status: 400 },
    );
  }

  const authUser = createdUser.user;

  const { data: publicUser, error: userError } = await admin
    .from("users")
    .upsert(
      {
        auth_user_id: authUser.id,
        name,
        email,
        preferred_group_id: preferredGroupId,
      },
      {
        onConflict: "auth_user_id",
      },
    )
    .select("id")
    .single();

  if (userError || !publicUser) {
    return NextResponse.json(
      { error: userError?.message ?? "Não foi possível sincronizar o usuário público." },
      { status: 400 },
    );
  }

  const { error: membershipError } = await admin.from("user_groups").upsert(
    {
      user_id: publicUser.id,
      group_id: body.groupId,
      role: body.role,
    },
    {
      onConflict: "user_id,group_id",
    },
  );

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      authUserId: authUser.id,
      publicUserId: publicUser.id,
      email,
      inviteSent: true,
      groupId: body.groupId,
      preferredGroupId,
      role: body.role,
      redirectTo,
    },
    { status: 201 },
  );
}
