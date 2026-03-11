import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { withGroupLogo } from "@/lib/group-logos";
import { ensureGroupLogoBucketExists } from "@/lib/group-logo-storage";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GroupRecord } from "@/types/domain";

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_groups");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(((data ?? []) as GroupRecord[]).map(withGroupLogo));
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (!context.is_super_admin) {
    return NextResponse.json(
      { error: "Apenas superusuarios podem criar grupos." },
      { status: 403 },
    );
  }

  const supabase = await createServerSupabaseClient();

  const contentType = request.headers.get("content-type") ?? "";
  let parsed;

  try {
    parsed = contentType.includes("multipart/form-data")
      ? await parseMultipartGroupRequest(request)
      : await parseJsonGroupRequest(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payload de grupo invalido." },
      { status: 400 },
    );
  }

  if (!parsed.name) {
    return NextResponse.json({ error: "Nome do grupo e obrigatorio." }, { status: 400 });
  }

  let { data, error } = await supabase.rpc("create_group", {
    p_name: parsed.name,
    p_code: parsed.code,
    p_is_public: parsed.isPublic,
    p_accepts_point_collaboration: parsed.acceptsPointCollaboration,
    p_max_pending_points_per_collaborator: parsed.maxPendingPointsPerCollaborator,
  });

  if (error && shouldRetryCreateGroupWithoutPendingLimit(error.message)) {
    const fallbackResponse = await supabase.rpc("create_group", {
      p_name: parsed.name,
      p_code: parsed.code,
      p_is_public: parsed.isPublic,
      p_accepts_point_collaboration: parsed.acceptsPointCollaboration,
    });

    data = fallbackResponse.data;
    error = fallbackResponse.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const createdGroup = (data as GroupRecord[] | null)?.[0];

  if (!createdGroup) {
    return NextResponse.json({ error: "O grupo nao foi criado." }, { status: 500 });
  }

  if (parsed.logoFile) {
    const adminSupabase = createAdminSupabaseClient();

    try {
      await ensureGroupLogoBucketExists();

      const storagePath = buildGroupLogoPath(createdGroup.id, parsed.logoFile.name);
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

      const { error: updateError } = await adminSupabase
        .from("groups")
        .update({ logo_path: storagePath })
        .eq("id", createdGroup.id);

      if (updateError) {
        throw updateError;
      }
    } catch (uploadError) {
      await adminSupabase.from("groups").delete().eq("id", createdGroup.id);
      return NextResponse.json(
        {
          error:
            uploadError instanceof Error
              ? uploadError.message
              : "Nao foi possivel salvar a logo do grupo.",
        },
        { status: 400 },
      );
    }
  }

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const group = ((groups ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === createdGroup.id);

  if (!group) {
    return NextResponse.json({ error: "O grupo nao foi encontrado apos a criacao." }, { status: 404 });
  }

  return NextResponse.json(group, { status: 201 });
}

async function parseJsonGroupRequest(request: Request) {
  const body = await request.json().catch(() => null);
  return {
    name: typeof body?.name === "string" ? body.name.trim() : "",
    code: typeof body?.code === "string" ? normalizeGroupCodeInput(body.code) : "",
    isPublic: Boolean(body?.isPublic),
    acceptsPointCollaboration: Boolean(body?.acceptsPointCollaboration),
    maxPendingPointsPerCollaborator: normalizePendingLimit(body?.maxPendingPointsPerCollaborator),
    logoFile: null as File | null,
  };
}

async function parseMultipartGroupRequest(request: Request) {
  const formData = await request.formData();
  const logoEntry = formData.get("logo");
  const logoFile = logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;

  if (logoFile) {
    validateLogoFile(logoFile);
  }

  return {
    name: `${formData.get("name") ?? ""}`.trim(),
    code: normalizeGroupCodeInput(`${formData.get("code") ?? ""}`),
    isPublic: `${formData.get("isPublic") ?? ""}`.trim() === "true",
    acceptsPointCollaboration:
      `${formData.get("acceptsPointCollaboration") ?? ""}`.trim() === "true",
    maxPendingPointsPerCollaborator: normalizePendingLimit(
      `${formData.get("maxPendingPointsPerCollaborator") ?? ""}`.trim(),
    ),
    logoFile,
  };
}

function normalizeGroupCodeInput(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

function validateLogoFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("A logo deve ser uma imagem.");
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    throw new Error("A logo pode ter no maximo 5 MB.");
  }
}

function normalizePendingLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : undefined;

  if (parsed === undefined || Number.isNaN(parsed)) {
    return 5;
  }

  return Math.max(1, Math.floor(parsed));
}

function shouldRetryCreateGroupWithoutPendingLimit(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("create_group") &&
    (normalized.includes("does not exist") ||
      normalized.includes("function") ||
      normalized.includes("p_max_pending_points_per_collaborator"))
  );
}

function buildGroupLogoPath(groupId: string, fileName: string) {
  return `${groupId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}
