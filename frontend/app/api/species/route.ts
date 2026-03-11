import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SpeciesRecord } from "@/types/domain";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_species", {
    p_only_active: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json((data ?? []) as SpeciesRecord[]);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc(
    "current_user_is_super_admin",
  );

  if (superAdminError) {
    return NextResponse.json({ error: superAdminError.message }, { status: 400 });
  }

  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: "Apenas superadministradores podem cadastrar especies." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.commonName || !body?.scientificName) {
    return NextResponse.json(
      { error: "Nome popular e nome cientifico sao obrigatorios." },
      { status: 400 },
    );
  }

  const origin = body.origin === "exotic" ? "exotic" : "native";
  const { data, error } = await supabase.rpc("create_species", {
    p_common_name: body.commonName,
    p_scientific_name: body.scientificName,
    p_origin: origin,
    p_is_active: typeof body.isActive === "boolean" ? body.isActive : true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const species = (data as SpeciesRecord[] | null)?.[0];

  if (!species) {
    return NextResponse.json({ error: "A especie nao foi criada." }, { status: 500 });
  }

  return NextResponse.json(species, { status: 201 });
}
