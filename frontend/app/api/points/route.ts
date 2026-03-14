import { NextResponse } from "next/server";

import { withPointGroupLogo } from "@/lib/group-logos";
import { attachPointTagsToPoint, attachPointTagsToPoints } from "@/lib/point-tags";
import { filterVisiblePoints } from "@/lib/point-visibility";
import {
  MAX_POINT_FILES,
  removeStoredPointMedia,
  replaceCurrentPointMedia,
  type StoredPointMediaDescriptor,
  uploadPointMediaFiles,
  validatePointMediaFiles,
  type PointMediaUploadInput,
} from "@/lib/point-media";
import {
  replacePointTagAssignments,
  validatePointTagSelection,
} from "@/lib/server/point-tag-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointRecord } from "@/types/domain";

interface PointInput {
  groupId: string;
  classificationId: string;
  title: string;
  longitude: number;
  latitude: number;
  description: string | null;
  isPublic: boolean;
  speciesId: string | null;
  tagIds: string[];
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const classificationIdParam = searchParams.get("classificationId");
  const groupIdParam = searchParams.get("groupId");
  const classificationId =
    classificationIdParam && classificationIdParam !== "all" ? classificationIdParam : null;
  const groupId = groupIdParam && groupIdParam !== "all" ? groupIdParam : null;

  const { data, error } = await supabase.rpc("list_points", {
    p_point_classification_id: classificationId,
    p_group_id: groupId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let viewerProfileId: string | null = null;

  if (user?.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    viewerProfileId = profile?.id ?? null;
  }

  const visiblePoints = filterVisiblePoints((((data ?? []) as PointRecord[]) ?? []), viewerProfileId);
  const pointsWithTags = await attachPointTagsToPoints(supabase, visiblePoints);

  return NextResponse.json(pointsWithTags.map(withPointGroupLogo));
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartPointRequest(request, supabase);
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePointInput(body);

  if (!parsed) {
    return NextResponse.json({ error: "Payload de ponto invalido." }, { status: 400 });
  }

  const point = await createPointRecord(supabase, parsed);

  if ("error" in point) {
    return NextResponse.json({ error: point.error }, { status: point.status });
  }

  try {
    const validatedTagIds = await validatePointTagSelection({
      supabase,
      classificationId: parsed.classificationId,
      tagIds: parsed.tagIds,
    });
    const adminSupabase = createAdminSupabaseClient();

    await replacePointTagAssignments({
      adminSupabase,
      pointId: point.data.id,
      tagIds: validatedTagIds,
      createdBy: point.data.created_by,
    });
  } catch (error) {
    const adminSupabase = createAdminSupabaseClient();
    await rollbackPointCreate(adminSupabase, point.data.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel salvar as tags do ponto." },
      { status: 400 },
    );
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, point.data);

  return NextResponse.json(withPointGroupLogo(pointWithTags), { status: 201 });
}

function parsePointInput(body: unknown): PointInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const longitude =
    typeof payload.longitude === "number" ? payload.longitude : Number(payload.longitude);
  const latitude =
    typeof payload.latitude === "number" ? payload.latitude : Number(payload.latitude);

  if (
    typeof payload.groupId !== "string" ||
    typeof payload.classificationId !== "string" ||
    typeof payload.title !== "string" ||
    !payload.title.trim() ||
    Number.isNaN(longitude) ||
    Number.isNaN(latitude)
  ) {
    return null;
  }

  return {
    groupId: payload.groupId,
    classificationId: payload.classificationId,
    tagIds: Array.isArray(payload.tagIds)
      ? payload.tagIds.filter((tagId): tagId is string => typeof tagId === "string")
      : [],
    title: payload.title.trim(),
    longitude,
    latitude,
    description:
      typeof payload.description === "string" && payload.description.trim()
        ? payload.description.trim()
        : null,
    isPublic: Boolean(payload.isPublic),
    speciesId:
      typeof payload.speciesId === "string" && payload.speciesId.trim()
        ? payload.speciesId.trim()
        : null,
  };
}

async function createPointRecord(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: PointInput,
) {
  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: input.groupId,
    p_point_classification_id: input.classificationId,
    p_title: input.title,
    p_longitude: input.longitude,
    p_latitude: input.latitude,
    p_description: input.description,
    p_status: null,
    p_is_public: input.isPublic,
    p_species_id: input.speciesId,
  });

  if (error) {
    return { error: error.message, status: 400 as const };
  }

  const point = (data as PointRecord[] | null)?.[0];

  if (!point) {
    return { error: "O ponto nao foi criado.", status: 500 as const };
  }

  return { data: point };
}

async function handleMultipartPointRequest(
  request: Request,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
) {
  const formData = await request.formData();
  const parsed = parsePointInput({
    groupId: `${formData.get("groupId") ?? ""}`.trim(),
    classificationId: `${formData.get("classificationId") ?? ""}`.trim(),
    tagIds: formData
      .getAll("tagIds")
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean),
    title: `${formData.get("title") ?? ""}`.trim(),
    longitude: `${formData.get("longitude") ?? ""}`.trim(),
    latitude: `${formData.get("latitude") ?? ""}`.trim(),
    description: `${formData.get("description") ?? ""}`.trim(),
    isPublic: `${formData.get("isPublic") ?? ""}`.trim() === "true",
    speciesId: `${formData.get("speciesId") ?? ""}`.trim(),
  });

  if (!parsed) {
    return NextResponse.json({ error: "Payload de ponto invalido." }, { status: 400 });
  }

  const files = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const photoCaptionEntries = formData.getAll("photoCaptions");

  if (files.length > MAX_POINT_FILES) {
    return NextResponse.json(
      { error: `Envie no maximo ${MAX_POINT_FILES} fotos no cadastro inicial.` },
      { status: 400 },
    );
  }

  try {
    validatePointMediaFiles(files);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fotos do ponto invalidas." },
      { status: 400 },
    );
  }

  const createdPoint = await createPointRecord(supabase, parsed);

  if ("error" in createdPoint) {
    return NextResponse.json({ error: createdPoint.error }, { status: createdPoint.status });
  }

  const adminSupabase = createAdminSupabaseClient();
  let uploadedMedia: StoredPointMediaDescriptor[] = [];

  try {
    const validatedTagIds = await validatePointTagSelection({
      supabase,
      classificationId: parsed.classificationId,
      tagIds: parsed.tagIds,
    });

    if (files.length) {
      uploadedMedia = await uploadPointMediaFiles(
        createdPoint.data.id,
        files.map<PointMediaUploadInput>((file, index) => {
          const captionEntry = photoCaptionEntries[index];
          return {
            file,
            caption: typeof captionEntry === "string" ? captionEntry : null,
          };
        }),
        "point",
      );
    }

    if (uploadedMedia.length) {
      await replaceCurrentPointMedia(createdPoint.data.id, uploadedMedia);
    }

    await replacePointTagAssignments({
      adminSupabase,
      pointId: createdPoint.data.id,
      tagIds: validatedTagIds,
      createdBy: createdPoint.data.created_by,
    });

    const pointWithTags = await attachPointTagsToPoint(supabase, createdPoint.data);

    return NextResponse.json(withPointGroupLogo(pointWithTags), { status: 201 });
  } catch (error) {
    if (uploadedMedia.length) {
      await removeStoredPointMedia(uploadedMedia).catch(() => undefined);
    }
    await rollbackPointCreate(adminSupabase, createdPoint.data.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel salvar a foto do ponto." },
      { status: 400 },
    );
  }
}

async function rollbackPointCreate(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  pointId: string,
) {
  await adminSupabase.from("point_media").delete().eq("point_id", pointId);
  await adminSupabase.from("points").delete().eq("id", pointId);
}
