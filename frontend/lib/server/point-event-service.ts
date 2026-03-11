import "server-only";

import {
  attachMediaToEvents,
  ensureTimelineMediaBucketExists,
  getPointTimeline,
  TIMELINE_MEDIA_BUCKET,
} from "@/lib/point-timeline";
import { ApiRouteError } from "@/lib/server/api-route";
import {
  fromPostgrestError,
  loadPointDetailOrThrow,
  type AdminSupabaseClient,
  type ServerSupabaseClient,
} from "@/lib/server/point-service-shared";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PointEventRecord, PointMediaRecord } from "@/types/domain";

const MAX_TIMELINE_FILES = 6;
const MAX_TIMELINE_FILE_SIZE = 10 * 1024 * 1024;

type PointMediaRow = Omit<PointMediaRecord, "signed_url">;

export async function listPointEvents(
  supabase: ServerSupabaseClient,
  pointId: string,
) {
  try {
    return await getPointTimeline(supabase, pointId);
  } catch (error) {
    throw new ApiRouteError(
      error instanceof Error ? error.message : "Nao foi possivel carregar a timeline.",
      {
        status: 400,
        code: "POINT_TIMELINE_LOAD_FAILED",
      },
    );
  }
}

export async function createPointEvent(options: {
  request: Request;
  pointId: string;
  supabase: ServerSupabaseClient;
}) {
  const { request, pointId, supabase } = options;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartEventRequest(request, pointId, supabase);
  }

  const body = await request.json().catch(() => null);
  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id:
      typeof body?.pointEventTypeId === "string" ? body.pointEventTypeId || null : null,
    p_event_type: typeof body?.eventType === "string" ? body.eventType || null : null,
    p_description: body?.description ?? null,
    p_event_date: body?.eventDate ?? null,
  });

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "POINT_EVENT_CREATE_FAILED",
    });
  }

  const event = (data as PointEventRecord[] | null)?.[0];

  if (!event) {
    throw new ApiRouteError("O evento nao foi criado.", {
      status: 500,
      code: "POINT_EVENT_NOT_CREATED",
    });
  }

  return {
    event: { ...event, media: [] },
    status: 201,
  };
}

export async function deletePointEvent(options: {
  pointId: string;
  eventId: string;
  supabase: ServerSupabaseClient;
}) {
  const { pointId, eventId, supabase } = options;
  const point = await loadPointDetailOrThrow(supabase, pointId);

  if (!point.viewer_can_manage) {
    throw new ApiRouteError("Voce nao tem permissao para excluir este evento.", {
      status: 403,
      code: "POINT_EVENT_DELETE_FORBIDDEN",
    });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: eventRecord, error: eventError } = await adminSupabase
    .from("point_events")
    .select("id")
    .eq("id", eventId)
    .eq("point_id", pointId)
    .maybeSingle();

  if (eventError) {
    throw fromPostgrestError(eventError, {
      message: eventError.message,
      status: 400,
      code: "POINT_EVENT_LOOKUP_FAILED",
    });
  }

  if (!eventRecord) {
    throw new ApiRouteError("Evento nao encontrado.", {
      status: 404,
      code: "POINT_EVENT_NOT_FOUND",
    });
  }

  const { data: mediaRows, error: mediaError } = await adminSupabase
    .from("point_media")
    .select("file_url")
    .eq("point_id", pointId)
    .eq("point_event_id", eventId);

  if (mediaError) {
    throw fromPostgrestError(mediaError, {
      message: mediaError.message,
      status: 400,
      code: "POINT_EVENT_MEDIA_LOOKUP_FAILED",
    });
  }

  const { error: deleteError } = await adminSupabase
    .from("point_events")
    .delete()
    .eq("id", eventId)
    .eq("point_id", pointId);

  if (deleteError) {
    throw fromPostgrestError(deleteError, {
      message: deleteError.message,
      status: 400,
      code: "POINT_EVENT_DELETE_FAILED",
    });
  }

  const uploadedPaths = (mediaRows ?? [])
    .map((row) => row.file_url)
    .filter((path): path is string => Boolean(path));

  if (uploadedPaths.length) {
    const { error: storageError } = await adminSupabase.storage
      .from(TIMELINE_MEDIA_BUCKET)
      .remove(uploadedPaths);

    if (storageError) {
      console.error("[point-event-storage-cleanup]", {
        pointId,
        eventId,
        errorMessage: storageError.message,
      });
    }
  }
}

async function handleMultipartEventRequest(
  request: Request,
  pointId: string,
  supabase: ServerSupabaseClient,
) {
  const formData = await request.formData();
  const eventType = `${formData.get("eventType") ?? ""}`.trim();
  const pointEventTypeId = `${formData.get("pointEventTypeId") ?? ""}`.trim();
  const description = `${formData.get("description") ?? ""}`.trim();
  const eventDate = `${formData.get("eventDate") ?? ""}`.trim();
  const photoEntries = formData.getAll("photos");
  const photoCaptionEntries = formData.getAll("photoCaptions");
  const files = photoEntries.filter((entry): entry is File => entry instanceof File && entry.size > 0);

  validateTimelineFiles(files);

  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id: pointEventTypeId || null,
    p_event_type: eventType || null,
    p_description: description || null,
    p_event_date: eventDate || null,
  });

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "POINT_EVENT_CREATE_FAILED",
    });
  }

  const event = (data as PointEventRecord[] | null)?.[0];

  if (!event) {
    throw new ApiRouteError("O evento nao foi criado.", {
      status: 500,
      code: "POINT_EVENT_NOT_CREATED",
    });
  }

  if (!files.length) {
    return {
      event: { ...event, media: [] },
      status: 201,
    };
  }

  const adminSupabase = createAdminSupabaseClient();
  const uploadedPaths: string[] = [];

  try {
    await ensureTimelineMediaBucketExists();
    const insertedMediaRows: PointMediaRow[] = [];

    for (const [index, file] of files.entries()) {
      const storagePath = buildTimelineStoragePath(pointId, event.id, file.name);
      const arrayBuffer = await file.arrayBuffer();
      const captionEntry = photoCaptionEntries[index];
      const caption = typeof captionEntry === "string" ? captionEntry.trim() : "";

      const { error: uploadError } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .upload(storagePath, Buffer.from(arrayBuffer), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedPaths.push(storagePath);

      const { data: insertedMedia, error: insertError } = await supabase
        .from("point_media")
        .insert({
          point_id: pointId,
          point_event_id: event.id,
          file_url: storagePath,
          caption: caption || null,
        })
        .select("id, point_id, point_event_id, file_url, caption, created_at")
        .single();

      if (insertError) {
        throw insertError;
      }

      insertedMediaRows.push(insertedMedia as PointMediaRow);
    }

    const [hydratedEvent] = await attachMediaToEvents([{ ...event, media: [] }], insertedMediaRows);

    return {
      event: hydratedEvent,
      status: 201,
    };
  } catch (error) {
    await rollbackEventWithMedia(adminSupabase, event.id, uploadedPaths);

    throw new ApiRouteError(
      error instanceof Error ? error.message : "Nao foi possivel salvar as fotos do evento.",
      {
        status: 400,
        code: "POINT_EVENT_MEDIA_UPLOAD_FAILED",
      },
    );
  }
}

function validateTimelineFiles(files: File[]) {
  if (files.length > MAX_TIMELINE_FILES) {
    throw new ApiRouteError(`Envie no maximo ${MAX_TIMELINE_FILES} fotos por evento.`, {
      status: 400,
      code: "TIMELINE_MEDIA_LIMIT_EXCEEDED",
    });
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new ApiRouteError("Somente imagens sao permitidas na timeline.", {
        status: 400,
        code: "TIMELINE_MEDIA_INVALID_TYPE",
      });
    }

    if (file.size > MAX_TIMELINE_FILE_SIZE) {
      throw new ApiRouteError("Cada foto pode ter no maximo 10 MB.", {
        status: 400,
        code: "TIMELINE_MEDIA_FILE_TOO_LARGE",
      });
    }
  }
}

async function rollbackEventWithMedia(
  adminSupabase: AdminSupabaseClient,
  eventId: string,
  uploadedPaths: string[],
) {
  if (uploadedPaths.length) {
    await adminSupabase.storage.from(TIMELINE_MEDIA_BUCKET).remove(uploadedPaths);
  }

  await adminSupabase.from("point_media").delete().eq("point_event_id", eventId);
  await adminSupabase.from("point_events").delete().eq("id", eventId);
}

function buildTimelineStoragePath(pointId: string, eventId: string, fileName: string) {
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${pointId}/${eventId}/${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}
