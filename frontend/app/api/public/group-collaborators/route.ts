import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ error: "Dados de cadastro invalidos." }, { status: 400 });
  }

  if (String(body.password).trim().length < 8) {
    return NextResponse.json(
      { error: "A senha precisa ter pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: group, error: groupError } = await admin
    .from("groups")
    .select("id")
    .eq("is_public", true)
    .eq("accepts_point_collaboration", true)
    .limit(1)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }

  if (!group) {
    return NextResponse.json(
      { error: "Nao ha grupos publicos aceitando colaboracao no momento." },
      { status: 403 },
    );
  }

  const email = String(body.email).trim().toLowerCase();
  const name = String(body.name).trim();
  const password = String(body.password).trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Configuracao de autenticacao publica ausente." },
      { status: 500 },
    );
  }

  const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error: authError } = await publicSupabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
      },
      emailRedirectTo: new URL("/login", request.url).toString(),
    },
  });

  if (authError) {
    return NextResponse.json(
      { error: authError.message ?? "Nao foi possivel criar o usuario." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      email,
      requiresEmailConfirmation: !data.session,
    },
    { status: 201 },
  );
}
