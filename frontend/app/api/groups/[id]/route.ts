import { NextResponse } from "next/server";

import { withGroupLogo } from "@/lib/group-logos";
import { ensureGroupLogoBucketExists } from "@/lib/group-logo-storage";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GroupRecord } from "@/types/domain";

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

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

  const contentType = request.headers.get("content-type") ?? "";
  let parsed;

  try {
    parsed = contentType.includes("multipart/form-data")
      ? await parseMultipartGroupPatch(request)
      : await parseJsonGroupPatch(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payload de atualizacao invalido." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};

  if (parsed.name) {
    patch.name = parsed.name;
  }

  if (parsed.code) {
    patch.code = parsed.code;
  }

  if (typeof parsed.isPublic === "boolean") {
    patch.is_public = parsed.isPublic;
  }

  if (typeof parsed.acceptsPointCollaboration === "boolean") {
    patch.accepts_point_collaboration = parsed.acceptsPointCollaboration;
  }

  if (typeof parsed.maxPendingPointsPerCollaborator === "number") {
    patch.max_pending_points_per_collaborator = parsed.maxPendingPointsPerCollaborator;
  }

  if (!Object.keys(patch).length && !parsed.logoFile && !parsed.removeLogo) {
    return NextResponse.json({ error: "Nenhum campo valido foi informado." }, { status: 400 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: existingGroup, error: existingGroupError } = await adminSupabase
    .from("groups")
    .select("logo_path")
    .eq("id", id)
    .maybeSingle();

  if (existingGroupError) {
    return NextResponse.json({ error: existingGroupError.message }, { status: 400 });
  }

  const previousLogoPath =
    existingGroup && typeof existingGroup.logo_path === "string" ? existingGroup.logo_path : null;

  if (Object.keys(patch).length) {
    let { error: updateError } = await supabase.from("groups").update(patch).eq("id", id);

    if (
      updateError &&
      "max_pending_points_per_collaborator" in patch &&
      shouldRetryUpdateGroupWithoutPendingLimit(updateError.message)
    ) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.max_pending_points_per_collaborator;
      const fallbackResponse = await supabase.from("groups").update(fallbackPatch).eq("id", id);
      updateError = fallbackResponse.error;
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (patch.is_public === false) {
    const { error: pointsError } = await adminSupabase
      .from("points")
      .update({ is_public: false })
      .eq("group_id", id);

    if (pointsError) {
      return NextResponse.json({ error: pointsError.message }, { status: 400 });
    }
  }

  let nextLogoPath = previousLogoPath;

  if (parsed.removeLogo && previousLogoPath) {
    await adminSupabase.storage.from("group-logos").remove([previousLogoPath]);
    nextLogoPath = null;
  }

  if (parsed.logoFile) {
    try {
      await ensureGroupLogoBucketExists();
      const storagePath = buildGroupLogoPath(id, parsed.logoFile.name);
      const arrayBuffer = await parsed.logoFile.arrayBuffer();
      const { error: uploadError } = await adminSupabase.storage
        .from("group-logos")
        .upload(storagePath, Buffer.from(arrayBuffer), {
          contentType: parsed.logoFile.type || "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      if (previousLogoPath && previousLogoPath !== storagePath) {
        await adminSupabase.storage.from("group-logos").remove([previousLogoPath]);
      }

      nextLogoPath = storagePath;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nao foi possivel salvar a logo do grupo.",
        },
        { status: 400 },
      );
    }
  }

  if (nextLogoPath !== previousLogoPath || (parsed.removeLogo && previousLogoPath)) {
    const { error: logoError } = await adminSupabase
      .from("groups")
      .update({ logo_path: nextLogoPath })
      .eq("id", id);

    if (logoError) {
      return NextResponse.json({ error: logoError.message }, { status: 400 });
    }
  }

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const group = ((groups ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === id);

  if (!group) {
    return NextResponse.json({ error: "Grupo nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(group);
}

async function parseJsonGroupPatch(request: Request) {
  const body = await request.json().catch(() => null);
  return {
    name: typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined,
    code: typeof body?.code === "string" ? normalizeGroupCodeInput(body.code) || undefined : undefined,
    isPublic: typeof body?.isPublic === "boolean" ? body.isPublic : undefined,
    acceptsPointCollaboration:
      typeof body?.acceptsPointCollaboration === "boolean"
        ? body.acceptsPointCollaboration
        : undefined,
    maxPendingPointsPerCollaborator: normalizePendingLimit(
      body?.maxPendingPointsPerCollaborator,
    ),
    removeLogo: body?.removeLogo === true,
    logoFile: null as File | null,
  };
}

async function parseMultipartGroupPatch(request: Request) {
  const formData = await request.formData();
  const logoEntry = formData.get("logo");
  const logoFile = logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;

  if (logoFile) {
    validateLogoFile(logoFile);
  }

  return {
    name: `${formData.get("name") ?? ""}`.trim() || undefined,
    code: normalizeGroupCodeInput(`${formData.get("code") ?? ""}`) || undefined,
    isPublic: parseOptionalBoolean(formData.get("isPublic")),
    acceptsPointCollaboration: parseOptionalBoolean(formData.get("acceptsPointCollaboration")),
    maxPendingPointsPerCollaborator: normalizePendingLimit(
      formData.get("maxPendingPointsPerCollaborator"),
    ),
    removeLogo: `${formData.get("removeLogo") ?? ""}`.trim() === "true",
    logoFile,
  };
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  const normalized = `${value ?? ""}`.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function normalizePendingLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (Number.isNaN(parsed)) {
    throw new Error("O limite de pendencias por colaborador e invalido.");
  }

  return Math.max(1, Math.floor(parsed));
}

function shouldRetryUpdateGroupWithoutPendingLimit(message: string) {
  return message.toLowerCase().includes("max_pending_points_per_collaborator");
}

function validateLogoFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("A logo deve ser uma imagem.");
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    throw new Error("A logo pode ter no maximo 5 MB.");
  }
}

function buildGroupLogoPath(groupId: string, fileName: string) {
  return `${groupId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function normalizeGroupCodeInput(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}
