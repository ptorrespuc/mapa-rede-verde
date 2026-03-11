import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SpeciesRecord } from "@/types/domain";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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
      { error: "Apenas superadministradores podem alterar especies." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload de atualizacao invalido." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.commonName === "string" && body.commonName.trim()) {
    patch.common_name = body.commonName.trim();
  }

  if (typeof body.scientificName === "string" && body.scientificName.trim()) {
    patch.scientific_name = body.scientificName.trim();
  }

  if (body.origin === "native" || body.origin === "exotic") {
    patch.origin = body.origin;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nenhum campo valido foi informado." }, { status: 400 });
  }

  const { error: updateError } = await supabase.from("species").update(patch).eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data: rows, error: listError } = await supabase.rpc("list_species", {
    p_only_active: false,
  });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const species = ((rows ?? []) as SpeciesRecord[]).find((item) => item.id === id);

  if (!species) {
    return NextResponse.json({ error: "Especie nao encontrada." }, { status: 404 });
  }

  return NextResponse.json(species);
}
