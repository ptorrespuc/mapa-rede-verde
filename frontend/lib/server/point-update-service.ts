import "server-only";

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
  hasPendingTagIds,
  getPendingPointMediaDescriptors,
  getPendingPointMediaMode,
  getPendingTagIds,
  mergePendingUpdateMetadata,
} from "@/lib/pending-point-updates";
import {
  buildReclassificationEventDescription,
  updatePointEventDescription,
} from "@/lib/point-reclassification";
import { ApiRouteError } from "@/lib/server/api-route";
import {
  fromPostgrestError,
  loadActorProfileIdOrThrow,
  loadPointDetailOrThrow,
  type ServerSupabaseClient,
} from "@/lib/server/point-service-shared";
import {
  replacePointTagAssignments,
  validatePointTagSelection,
} from "@/lib/server/point-tag-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PointDetailRecord, PointPhotoUpdateMode, PointRecord } from "@/types/domain";

export interface ParsedPointPatch {
  groupId?: string | null;
  classificationId?: string | null;
  tagIds: string[];
  tagIdsProvided: boolean;
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

export async function parsePointPatchRequest(request: Request): Promise<ParsedPointPatch> {
  try {
    return request.headers.get("content-type")?.includes("multipart/form-data")
      ? await parseMultipartPointPatch(request)
      : await parseJsonPointPatch(request);
  } catch (error) {
    throw new ApiRouteError(
      error instanceof Error ? error.message : "Payload de atualizacao invalido.",
      {
        status: 400,
        code: "INVALID_POINT_UPDATE_PAYLOAD",
      },
    );
  }
}

export async function updatePointWithPendingMedia(options: {
  pointId: string;
  parsed: ParsedPointPatch;
  actorAuthUserId: string;
  supabase: ServerSupabaseClient;
}) {
  const { pointId, parsed, actorAuthUserId, supabase } = options;
  const existingPoint = await loadPointDetailOrThrow(supabase, pointId);
  const requestedClassificationId =
    parsed.classificationId && parsed.classificationId.trim()
      ? parsed.classificationId
      : existingPoint.classification_id;
  const requestedGroupId =
    parsed.groupId && parsed.groupId.trim() ? parsed.groupId : existingPoint.group_id;
  const isGroupChange = requestedGroupId !== existingPoint.group_id;
  const isReclassificationChange = requestedClassificationId !== existingPoint.classification_id;
  const requestedTagIds = parsed.tagIdsProvided
    ? await validatePointTagSelection({
        supabase,
        classificationId: requestedClassificationId,
        tagIds: parsed.tagIds,
      })
    : isReclassificationChange
      ? []
      : (existingPoint.tags ?? []).map((tag) => tag.id);
  const shouldSyncTagAssignments = parsed.tagIdsProvided || isReclassificationChange;
  const shouldPreservePreviousState =
    isReclassificationChange && parsed.preservePreviousStateOnReclassification === true;
  const existingPendingPointMedia = getPendingPointMediaDescriptors(existingPoint.pending_update_data);
  const existingPendingPointMediaMode = getPendingPointMediaMode(existingPoint.pending_update_data);
  const currentPointMedia = await getCurrentPointMediaRows(pointId);
  const nextPointMediaMode = parsed.photoUpdateMode;

  if (
    parsed.photos.length &&
    nextPointMediaMode === "append" &&
    currentPointMedia.length + parsed.photos.length > 3
  ) {
    throw new ApiRouteError(
      "O ponto pode ter no maximo 3 fotos. Remova alguma foto atual ou substitua o conjunto.",
      {
        status: 400,
        code: "POINT_MEDIA_LIMIT_EXCEEDED",
      },
    );
  }

  const rpcPayload: Record<string, boolean | number | string | null> = {
    p_point_id: pointId,
    p_point_classification_id: parsed.classificationId ?? null,
    p_title: parsed.title ?? null,
    p_description: parsed.description ?? null,
    p_status: null,
    p_longitude: parsed.longitude ?? null,
    p_latitude: parsed.latitude ?? null,
    p_is_public: parsed.isPublic ?? null,
    p_species_id: parsed.speciesId ?? null,
    p_species_id_provided: parsed.speciesIdProvided,
  };

  if (isGroupChange) {
    rpcPayload.p_group_id = requestedGroupId;
  }

  const { data, error } = await supabase.rpc("update_point", rpcPayload);

  if (error) {
    if (isGroupChange && isMissingGroupUpdateSupport(error.message)) {
      throw new ApiRouteError(
        "A troca de grupo ainda nao esta habilitada no banco. Aplique a migration 202603130001_point_group_reassignment.sql e tente novamente.",
        {
          status: 400,
          code: "POINT_GROUP_REASSIGNMENT_SCHEMA_OUTDATED",
        },
      );
    }

    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "POINT_UPDATE_FAILED",
    });
  }

  const updatedPoint = (data as PointRecord[] | null)?.[0];

  if (!updatedPoint) {
    throw new ApiRouteError("Ponto nao encontrado.", {
      status: 404,
      code: "POINT_NOT_FOUND",
    });
  }

  try {
    return await finalizePointUpdate({
      pointId,
      parsed,
      existingPoint,
      updatedPoint,
      currentPointMedia,
      existingPendingPointMedia,
      existingPendingPointMediaMode,
      nextPointMediaMode,
      requestedTagIds,
      shouldSyncTagAssignments,
      shouldPreservePreviousState,
      actorAuthUserId,
      supabase,
    });
  } catch (error) {
    throw new ApiRouteError(
      error instanceof Error
        ? error.message
        : "O ponto foi atualizado, mas o processamento das fotos falhou.",
      {
        status: 400,
        code: "POINT_UPDATE_POST_PROCESSING_FAILED",
      },
    );
  }
}

async function finalizePointUpdate(options: {
  pointId: string;
  parsed: ParsedPointPatch;
  existingPoint: PointDetailRecord;
  updatedPoint: PointRecord;
  currentPointMedia: Awaited<ReturnType<typeof getCurrentPointMediaRows>>;
  existingPendingPointMedia: Awaited<ReturnType<typeof getPendingPointMediaDescriptors>>;
  existingPendingPointMediaMode: ReturnType<typeof getPendingPointMediaMode>;
  nextPointMediaMode: PointPhotoUpdateMode;
  requestedTagIds: string[];
  shouldSyncTagAssignments: boolean;
  shouldPreservePreviousState: boolean;
  actorAuthUserId: string;
  supabase: ServerSupabaseClient;
}) {
  const {
    pointId,
    parsed,
    existingPoint,
    updatedPoint,
    currentPointMedia,
    existingPendingPointMedia,
    existingPendingPointMediaMode,
    nextPointMediaMode,
    requestedTagIds,
    shouldSyncTagAssignments,
    shouldPreservePreviousState,
    actorAuthUserId,
    supabase,
  } = options;
  const hasPendingChangeRequest =
    updatedPoint.has_pending_update &&
    existingPoint.approval_status === "approved" &&
    !updatedPoint.viewer_can_manage;

  if (hasPendingChangeRequest) {
    return persistPendingPointUpdate({
      pointId,
      parsed,
      updatedPoint,
      existingPendingPointMedia,
      existingPendingPointMediaMode,
      nextPointMediaMode,
      requestedTagIds,
      shouldSyncTagAssignments,
      shouldPreservePreviousState,
      supabase,
    });
  }

  if (!updatedPoint.has_pending_update && existingPendingPointMedia.length) {
    await removeStoredPointMedia(existingPendingPointMedia);
  }

  if (shouldPreservePreviousState) {
    const reclassificationEventId = await findLatestReclassificationEventId(pointId);

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
        await clonePointMediaToEvent(pointId, reclassificationEventId, currentPointMedia);
      }
    }
  }

  if (parsed.photos.length) {
    if (nextPointMediaMode === "append") {
      await appendCurrentPointMediaWithUploads(pointId, parsed.photos);
    } else {
      await replaceCurrentPointMediaWithUploads(pointId, parsed.photos);
    }
  }

  if (shouldSyncTagAssignments) {
    const adminSupabase = createAdminSupabaseClient();
    const actorProfileId = await loadActorProfileIdOrThrow(adminSupabase, actorAuthUserId);
    await replacePointTagAssignments({
      adminSupabase,
      pointId,
      tagIds: requestedTagIds,
      createdBy: actorProfileId,
    });
  }

  return loadPointDetailOrThrow(supabase, pointId);
}

async function persistPendingPointUpdate(options: {
  pointId: string;
  parsed: ParsedPointPatch;
  updatedPoint: PointRecord;
  existingPendingPointMedia: Awaited<ReturnType<typeof getPendingPointMediaDescriptors>>;
  existingPendingPointMediaMode: ReturnType<typeof getPendingPointMediaMode>;
  nextPointMediaMode: PointPhotoUpdateMode;
  requestedTagIds: string[];
  shouldSyncTagAssignments: boolean;
  shouldPreservePreviousState: boolean;
  supabase: ServerSupabaseClient;
}) {
  const {
    pointId,
    parsed,
    updatedPoint,
    existingPendingPointMedia,
    existingPendingPointMediaMode,
    nextPointMediaMode,
    requestedTagIds,
    shouldSyncTagAssignments,
    shouldPreservePreviousState,
    supabase,
  } = options;
  const adminSupabase = createAdminSupabaseClient();
  let nextPendingPointMedia = existingPendingPointMedia;

  if (parsed.photos.length) {
    nextPendingPointMedia = await uploadPointMediaFiles(pointId, parsed.photos, "pending");
  }

  const mergedPendingData = mergePendingUpdateMetadata(updatedPoint.pending_update_data, {
    preservePreviousState: shouldPreservePreviousState,
    pendingPointMedia: parsed.photos.length ? nextPendingPointMedia : existingPendingPointMedia,
    pendingPointMediaMode: parsed.photos.length
      ? nextPointMediaMode
      : existingPendingPointMediaMode,
    pendingTagIds: shouldSyncTagAssignments
      ? requestedTagIds
      : hasPendingTagIds(updatedPoint.pending_update_data)
        ? getPendingTagIds(updatedPoint.pending_update_data)
        : undefined,
  });

  const { error: pendingUpdateError } = await adminSupabase
    .from("points")
    .update({ pending_update_data: mergedPendingData })
    .eq("id", pointId);

  if (pendingUpdateError) {
    if (parsed.photos.length && nextPendingPointMedia.length) {
      await removeStoredPointMedia(nextPendingPointMedia);
    }

    throw fromPostgrestError(pendingUpdateError, {
      message: pendingUpdateError.message,
      status: 400,
      code: "PENDING_UPDATE_METADATA_FAILED",
    });
  }

  if (parsed.photos.length && existingPendingPointMedia.length) {
    await removeStoredPointMedia(existingPendingPointMedia);
  }

  return loadPointDetailOrThrow(supabase, pointId);
}

async function parseJsonPointPatch(request: Request): Promise<ParsedPointPatch> {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error("Payload de atualizacao invalido.");
  }

  const payload = body as Record<string, unknown>;

  return {
    groupId: typeof payload.groupId === "string" ? payload.groupId || null : null,
    classificationId:
      typeof payload.classificationId === "string" ? payload.classificationId || null : null,
    tagIds: Array.isArray(payload.tagIds)
      ? payload.tagIds.filter((tagId): tagId is string => typeof tagId === "string")
      : [],
    tagIdsProvided: Object.prototype.hasOwnProperty.call(payload, "tagIds"),
    title: typeof payload.title === "string" ? payload.title : null,
    description: typeof payload.description === "string" ? payload.description : null,
    longitude: typeof payload.longitude === "number" ? payload.longitude : null,
    latitude: typeof payload.latitude === "number" ? payload.latitude : null,
    isPublic: typeof payload.isPublic === "boolean" ? payload.isPublic : null,
    speciesId: typeof payload.speciesId === "string" ? payload.speciesId || null : null,
    speciesIdProvided: Object.prototype.hasOwnProperty.call(payload, "speciesId"),
    photos: [],
    photoUpdateMode: payload.photoUpdateMode === "append" ? "append" : "replace",
    preservePreviousStateOnReclassification:
      typeof payload.preservePreviousStateOnReclassification === "boolean"
        ? payload.preservePreviousStateOnReclassification
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
    groupId: normalizeNullableString(formData.get("groupId")),
    classificationId: normalizeNullableString(formData.get("classificationId")),
    tagIds: formData
      .getAll("tagIds")
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean),
    tagIdsProvided:
      formData.get("tagIdsProvided") === "true" || formData.getAll("tagIds").length > 0,
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

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function isMissingGroupUpdateSupport(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("update_point") &&
    (normalized.includes("could not find the function") ||
      normalized.includes("function public.update_point"))
  );
}
