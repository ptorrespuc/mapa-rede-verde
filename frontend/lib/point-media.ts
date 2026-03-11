import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureTimelineMediaBucketExists, listPointMediaRows, TIMELINE_MEDIA_BUCKET } from "@/lib/point-timeline";
import type { PointMediaRecord } from "@/types/domain";

export interface PointMediaUploadInput {
  file: File;
  caption?: string | null;
}

export interface StoredPointMediaDescriptor {
  file_url: string;
  caption: string | null;
}

type PointMediaRow = Omit<PointMediaRecord, "signed_url">;

export const MAX_POINT_FILES = 3;
export const MAX_POINT_FILE_SIZE = 10 * 1024 * 1024;

export async function getCurrentPointMediaRows(pointId: string) {
  const adminSupabase = createAdminSupabaseClient();
  const mediaRows = await listPointMediaRows(adminSupabase, pointId);
  return mediaRows.filter((media) => !media.point_event_id) as PointMediaRow[];
}

export function validatePointMediaFiles(files: File[]) {
  if (files.length > MAX_POINT_FILES) {
    throw new Error(`Envie no maximo ${MAX_POINT_FILES} fotos por ponto.`);
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Somente imagens sao permitidas para o ponto.");
    }

    if (file.size > MAX_POINT_FILE_SIZE) {
      throw new Error("Cada foto pode ter no maximo 10 MB.");
    }
  }
}

export async function uploadPointMediaFiles(
  pointId: string,
  mediaInputs: PointMediaUploadInput[],
  scope: "point" | "pending" | "event" = "point",
) {
  if (!mediaInputs.length) {
    return [] as StoredPointMediaDescriptor[];
  }

  const adminSupabase = createAdminSupabaseClient();
  await ensureTimelineMediaBucketExists();

  const uploaded: StoredPointMediaDescriptor[] = [];

  try {
    for (const mediaInput of mediaInputs) {
      const storagePath = buildPointStoragePath(pointId, scope, mediaInput.file.name);
      const arrayBuffer = await mediaInput.file.arrayBuffer();

      const { error } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .upload(storagePath, Buffer.from(arrayBuffer), {
          contentType: mediaInput.file.type || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        throw error;
      }

      uploaded.push({
        file_url: storagePath,
        caption: mediaInput.caption?.trim() ? mediaInput.caption.trim() : null,
      });
    }

    return uploaded;
  } catch (error) {
    await removeStoredPointMedia(uploaded);
    throw error;
  }
}

export async function replaceCurrentPointMedia(
  pointId: string,
  nextMedia: StoredPointMediaDescriptor[],
) {
  const adminSupabase = createAdminSupabaseClient();
  const existingRows = await getCurrentPointMediaRows(pointId);
  let insertedRows: Array<{ id: string; file_url: string }> = [];

  if (nextMedia.length) {
    const { data, error: insertError } = await adminSupabase
      .from("point_media")
      .insert(
        nextMedia.map((media) => ({
          point_id: pointId,
          point_event_id: null,
          file_url: media.file_url,
          caption: media.caption,
        })),
      )
      .select("id, file_url");

    if (insertError) {
      throw insertError;
    }

    insertedRows = (data ?? []) as Array<{ id: string; file_url: string }>;
  }

  if (!existingRows.length) {
    return;
  }

  try {
    const { error: deleteRowsError } = await adminSupabase
      .from("point_media")
      .delete()
      .in(
        "id",
        existingRows.map((media) => media.id),
      );

    if (deleteRowsError) {
      throw deleteRowsError;
    }

    await removeStoredPointMedia(
      existingRows.map((media) => ({
        file_url: media.file_url,
        caption: media.caption,
      })),
    );
  } catch (error) {
    if (insertedRows.length) {
      await adminSupabase
        .from("point_media")
        .delete()
        .in(
          "id",
          insertedRows.map((media) => media.id),
        );
      await removeStoredPointMedia(
        insertedRows.map((media) => ({
          file_url: media.file_url,
          caption: null,
        })),
      ).catch(() => undefined);
    }

    throw error;
  }
}

export async function appendCurrentPointMedia(
  pointId: string,
  nextMedia: StoredPointMediaDescriptor[],
) {
  if (!nextMedia.length) {
    return [];
  }

  const existingRows = await getCurrentPointMediaRows(pointId);

  if (existingRows.length + nextMedia.length > MAX_POINT_FILES) {
    throw new Error(`O ponto pode ter no maximo ${MAX_POINT_FILES} fotos.`);
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data, error } = await adminSupabase
    .from("point_media")
    .insert(
      nextMedia.map((media) => ({
        point_id: pointId,
        point_event_id: null,
        file_url: media.file_url,
        caption: media.caption,
      })),
    )
    .select("id, file_url");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; file_url: string }>;
}

export async function replaceCurrentPointMediaWithUploads(
  pointId: string,
  mediaInputs: PointMediaUploadInput[],
) {
  const uploaded = await uploadPointMediaFiles(pointId, mediaInputs, "point");

  try {
    await replaceCurrentPointMedia(pointId, uploaded);
    return uploaded;
  } catch (error) {
    await removeStoredPointMedia(uploaded).catch(() => undefined);
    throw error;
  }
}

export async function appendCurrentPointMediaWithUploads(
  pointId: string,
  mediaInputs: PointMediaUploadInput[],
) {
  const uploaded = await uploadPointMediaFiles(pointId, mediaInputs, "point");

  try {
    await appendCurrentPointMedia(pointId, uploaded);
    return uploaded;
  } catch (error) {
    await removeStoredPointMedia(uploaded).catch(() => undefined);
    throw error;
  }
}

export async function removeStoredPointMedia(media: StoredPointMediaDescriptor[]) {
  const uniquePaths = [...new Set(media.map((item) => item.file_url).filter(Boolean))];

  if (!uniquePaths.length) {
    return;
  }

  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.storage.from(TIMELINE_MEDIA_BUCKET).remove(uniquePaths);

  if (error) {
    throw error;
  }
}

export async function findLatestReclassificationEventId(pointId: string) {
  const adminSupabase = createAdminSupabaseClient();
  const { data, error } = await adminSupabase
    .from("point_events")
    .select("id")
    .eq("point_id", pointId)
    .eq("event_type", "reclassificacao")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

export async function clonePointMediaToEvent(
  pointId: string,
  pointEventId: string,
  sourceMediaRows: PointMediaRow[],
) {
  if (!sourceMediaRows.length) {
    return [] as StoredPointMediaDescriptor[];
  }

  const adminSupabase = createAdminSupabaseClient();
  await ensureTimelineMediaBucketExists();

  const clonedMedia: StoredPointMediaDescriptor[] = [];

  try {
    for (const sourceMedia of sourceMediaRows) {
      const { data, error } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .download(sourceMedia.file_url);

      if (error) {
        throw error;
      }

      const clonePath = buildPointStoragePath(pointId, "event", sourceMedia.file_url.split("/").pop() ?? "imagem.jpg");
      const arrayBuffer = await data.arrayBuffer();

      const { error: uploadError } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .upload(clonePath, Buffer.from(arrayBuffer), {
          contentType: data.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      clonedMedia.push({
        file_url: clonePath,
        caption: sourceMedia.caption,
      });
    }

    const { error: insertError } = await adminSupabase.from("point_media").insert(
      clonedMedia.map((media) => ({
        point_id: pointId,
        point_event_id: pointEventId,
        file_url: media.file_url,
        caption: media.caption,
      })),
    );

    if (insertError) {
      throw insertError;
    }

    return clonedMedia;
  } catch (error) {
    await removeStoredPointMedia(clonedMedia);
    throw error;
  }
}

function buildPointStoragePath(pointId: string, scope: "point" | "pending" | "event", fileName: string) {
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${pointId}/${scope}/${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}
