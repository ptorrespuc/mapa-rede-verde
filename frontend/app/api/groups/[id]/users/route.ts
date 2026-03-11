import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

const validRoles = new Set<UserRole>([
  "super_admin",
  "group_admin",
  "group_approver",
  "group_collaborator",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.userId || !body?.role || !validRoles.has(body.role)) {
    return NextResponse.json({ error: "Payload de associação inválido." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("add_user_to_group", {
    p_group_id: id,
    p_user_id: body.userId,
    p_role: body.role,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const membership = (data as Array<{ user_id: string; group_id: string; role: string }> | null)?.[0];

  if (!membership) {
    return NextResponse.json({ error: "O usuário não foi associado ao grupo." }, { status: 500 });
  }

  return NextResponse.json(membership, { status: 201 });
}
