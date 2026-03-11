import { NextResponse } from "next/server";

import { withPointGroupLogo } from "@/lib/group-logos";
import {
  appendCurrentPointMediaWithUploads,
  clonePointMediaToEvent,
  findLatestReclassificationEventId,
  getCurrentPointMediaRows,
  removeStoredPointMedia,
  replaceCurrentPointMediaWithUploads,
  uploadPointMediaFiles,
  validatePointMediaFiles,
  type PointMediaUploadInput,
} from "@/lib/point-media";
import {
  getPendingPointMediaDescriptors,
  getPendingPointMediaMode,
  mergePendingUpdateMetadata,
} from "@/lib/pending-point-updates";
import {
  buildReclassificationEventDescription,
  updatePointEventDescription,
} from "@/lib/point-reclassification";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointDetailRecord, PointPhotoUpdateMode, PointRecord } from "@/types/domain";

interface ParsedPointPatch {
  classificationId?: string | null;
  title?: string | null;
  description?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  isPublic?: boolean | null;
  speciesId?: string | null;
  speciesIdProvided: boolean;
  photos: PointMediaUploadInput[];
  photoUpdateMode: PointPhotoUpdateMode;
  preservePreviousStateOnReclassification?: boolean;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const point = (data as PointDetailRecord[] | null)?.[0];

  if (!point) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(withPointGroupLogo(point));
}

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

  let parsed: ParsedPointPatch;

  try {
    parsed = request.headers.get("content-type")?.includes("multipart/form-data")
      ? await parseMultipartPointPatch(request)
      : await parseJsonPointPatch(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payload de atualizacao invalido.",
      },
      { status: 400 },
    );
  }

  const { data: existingPointData, error: existingPointError } = await supabase.rpc("get_point", {
    p_point_id: id,
  });

  if (existingPointError) {
    return NextResponse.json({ error: existingPointError.message }, { status: 400 });
  }

  const existingPoint = (existingPointData as PointDetailRecord[] | null)?.[0];

  if (!existingPoint) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  const requestedClassificationId =
    parsed.classificationId && parsed.classificationId.trim()
      ? parsed.classificationId
      : existingPoint.classification_id;
  const isReclassificationChange = requestedClassificationId !== existingPoint.classification_id;
  const shouldPreservePreviousState =
    isReclassificationChange && parsed.preservePreviousStateOnReclassification === true;
  const existingPendingPointMedia = getPendingPointMediaDescriptors(existingPoint.pending_update_data);
  const existingPendingPointMediaMode = getPendingPointMediaMode(existingPoint.pending_update_data);
  const currentPointMedia = await getCurrentPointMediaRows(id);
  const nextPointMediaMode = parsed.photoUpdateMode;

  if (
    parsed.photos.length &&
    nextPointMediaMode === "append" &&
    currentPointMedia.length + parsed.photos.length > 3
  ) {
    return NextResponse.json(
      { error: "O ponto pode ter no maximo 3 fotos. Remova alguma foto atual ou substitua o conjunto." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("update_point", {
    p_point_id: id,
    p_point_classification_id: parsed.classificationId ?? null,
    p_title: parsed.title ?? null,
    p_description: parsed.description ?? null,
    p_status: null,
    p_longitude: parsed.longitude ?? null,
    p_latitude: parsed.latitude ?? null,
    p_is_public: parsed.isPublic ?? null,
    p_species_id: parsed.speciesId ?? null,
    p_species_id_provided: parsed.speciesIdProvided,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const updatedPoint = (data as PointRecord[] | null)?.[0];

  if (!updatedPoint) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  try {
    const hasPendingChangeRequest =
      updatedPoint.has_pending_update &&
      existingPoint.approval_status === "approved" &&
      !updatedPoint.viewer_can_manage;

    if (hasPendingChangeRequest) {
      const adminSupabase = createAdminSupabaseClient();
      let nextPendingPointMedia = existingPendingPointMedia;

      if (parsed.photos.length) {
        nextPendingPointMedia = await uploadPendingPointMedia(id, parsed.photos);
      }

      const mergedPendingData = mergePendingUpdateMetadata(updatedPoint.pending_update_data, {
        preservePreviousState: shouldPreservePreviousState,
        pendingPointMedia: parsed.photos.length ? nextPendingPointMedia : existingPendingPointMedia,
        pendingPointMediaMode: parsed.photos.length
          ? nextPointMediaMode
          : existingPendingPointMediaMode,
      });

      const { error: pendingUpdateError } = await adminSupabase
        .from("points")
        .update({ pending_update_data: mergedPendingData })
        .eq("id", id);

      if (pendingUpdateError) {
        if (parsed.photos.length && nextPendingPointMedia.length) {
          await removeStoredPointMedia(nextPendingPointMedia);
        }
        throw pendingUpdateError;
      }

      if (parsed.photos.length && existingPendingPointMedia.length) {
        await removeStoredPointMedia(existingPendingPointMedia);
      }

      const { data: refreshedPointData, error: refreshedPointError } = await supabase.rpc(
        "get_point",
        {
          p_point_id: id,
        },
      );

      if (refreshedPointError) {
        throw refreshedPointError;
      }

      const refreshedPoint = (refreshedPointData as PointDetailRecord[] | null)?.[0];

      if (!refreshedPoint) {
        throw new Error("Ponto nao encontrado apos a atualizacao pendente.");
      }

      return NextResponse.json(withPointGroupLogo(refreshedPoint));
    }

    if (!updatedPoint.has_pending_update && existingPendingPointMedia.length) {
      await removeStoredPointMedia(existingPendingPointMedia);
    }

    if (shouldPreservePreviousState) {
      const reclassificationEventId = await findLatestReclassificationEventId(id);

      if (reclassificationEventId) {
        await updatePointEventDescription(
          reclassificationEventId,
          buildReclassificationEventDescription(
            existingPoint,
            updatedPoint.classification_name,
            true,
          ),
        );
        if (currentPointMedia.length) {
          await clonePointMediaToEvent(id, reclassificationEventId, currentPointMedia);
        }
      }
    }

    if (parsed.photos.length) {
      if (nextPointMediaMode === "append") {
        await appendCurrentPointMediaWithUploads(id, parsed.photos);
      } else {
        await replaceCurrentPointMediaWithUploads(id, parsed.photos);
      }
    }
  } catch (postProcessingError) {
    return NextResponse.json(
      {
        error:
          postProcessingError instanceof Error
            ? postProcessingError.message
            : "O ponto foi atualizado, mas o processamento das fotos falhou.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(withPointGroupLogo(updatedPoint));
}

export async function DELETE(
  _request: Request,
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

  const { data: pointData, error: pointError } = await supabase.rpc("get_point", {
    p_point_id: id,
  });

  if (pointError) {
    return NextResponse.json({ error: pointError.message }, { status: 400 });
  }

  const point = (pointData as PointDetailRecord[] | null)?.[0];

  if (!point) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  if (!point.viewer_can_delete) {
    return NextResponse.json({ error: "Voce nao tem permissao para arquivar este ponto." }, { status: 403 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const pendingPointMedia = getPendingPointMediaDescriptors(point.pending_update_data);
  const { data: actorProfile, error: actorError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (actorError) {
    return NextResponse.json({ error: actorError.message }, { status: 400 });
  }

  const { error: archiveError } = await adminSupabase
    .from("points")
    .update({
      status: "archived",
      approval_status: "approved",
      approved_by: actorProfile?.id ?? point.approved_by ?? point.created_by,
      approved_at: new Date().toISOString(),
      pending_update_data: null,
      pending_update_requested_by: null,
      pending_update_requested_at: null,
    })
    .eq("id", id);

  if (archiveError) {
    return NextResponse.json({ error: archiveError.message }, { status: 400 });
  }

  if (pendingPointMedia.length) {
    await removeStoredPointMedia(pendingPointMedia).catch((storageError) => {
      console.error(
        "Nao foi possivel limpar as midias pendentes de um ponto arquivado.",
        storageError,
      );
    });
  }

  return NextResponse.json({ success: true });
}

async function parseJsonPointPatch(request: Request): Promise<ParsedPointPatch> {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error("Payload de atualizacao invalido.");
  }

  return {
    classificationId:
      typeof body.classificationId === "string" ? body.classificationId || null : null,
    title: typeof body.title === "string" ? body.title : null,
    description: typeof body.description === "string" ? body.description : null,
    longitude: typeof body.longitude === "number" ? body.longitude : null,
    latitude: typeof body.latitude === "number" ? body.latitude : null,
    isPublic: typeof body.isPublic === "boolean" ? body.isPublic : null,
    speciesId: typeof body.speciesId === "string" ? body.speciesId || null : null,
    speciesIdProvided: Object.prototype.hasOwnProperty.call(body, "speciesId"),
    photos: [],
    photoUpdateMode: body.photoUpdateMode === "append" ? "append" : "replace",
    preservePreviousStateOnReclassification:
      typeof body.preservePreviousStateOnReclassification === "boolean"
        ? body.preservePreviousStateOnReclassification
        : undefined,
  };
}

async function parseMultipartPointPatch(request: Request): Promise<ParsedPointPatch> {
  const formData = await request.formData();
  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const photoCaptions = formData.getAll("photoCaptions");

  validatePointMediaFiles(photos);

  return {
    classificationId: normalizeNullableString(formData.get("classificationId")),
    title: normalizeNullableString(formData.get("title")),
    description: normalizeNullableString(formData.get("description")),
    longitude: normalizeNullableNumber(formData.get("longitude")),
    latitude: normalizeNullableNumber(formData.get("latitude")),
    isPublic: normalizeNullableBoolean(formData.get("isPublic")),
    speciesId: normalizeNullableString(formData.get("speciesId")),
    speciesIdProvided: formData.has("speciesId"),
    photos: photos.map<PointMediaUploadInput>((photo, index) => ({
      file: photo,
      caption: typeof photoCaptions[index] === "string" ? photoCaptions[index] : null,
    })),
    photoUpdateMode: formData.get("photoUpdateMode") === "append" ? "append" : "replace",
    preservePreviousStateOnReclassification:
      normalizeNullableBoolean(formData.get("preservePreviousStateOnReclassification")) ??
      undefined,
  };
}

function normalizeNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNullableNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeNullableBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function uploadPendingPointMedia(pointId: string, photos: PointMediaUploadInput[]) {
  return uploadPointMediaFiles(pointId, photos, "pending");
}
