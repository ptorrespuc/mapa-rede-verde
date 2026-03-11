import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PointEventRecord, PointMediaRecord } from "@/types/domain";

export const TIMELINE_MEDIA_BUCKET = "point-timeline-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12;

type PointMediaRow = Omit<PointMediaRecord, "signed_url">;

export async function ensureTimelineMediaBucketExists() {
  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.storage.createBucket(TIMELINE_MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });

  if (
    error &&
    !error.message.toLowerCase().includes("already exists") &&
    !error.message.toLowerCase().includes("duplicate")
  ) {
    throw error;
  }
}

export async function listPointMediaRows(
  supabase: SupabaseClient,
  pointId: string,
): Promise<PointMediaRow[]> {
  const { data, error } = await supabase
    .from("point_media")
    .select("id, point_id, point_event_id, file_url, caption, created_at")
    .eq("point_id", pointId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PointMediaRow[];
}

export async function hydratePointMediaRows(
  mediaRows: PointMediaRow[],
): Promise<PointMediaRecord[]> {
  const signedUrls = await createSignedUrlMap(mediaRows.map((media) => media.file_url));

  return mediaRows.map((media) => ({
    ...media,
    signed_url: signedUrls.get(media.file_url) ?? null,
  }));
}

export async function getPointMedia(
  supabase: SupabaseClient,
  pointId: string,
): Promise<PointMediaRecord[]> {
  const mediaRows = await listPointMediaRows(supabase, pointId);
  return hydratePointMediaRows(mediaRows.filter((media) => !media.point_event_id));
}

export async function attachMediaToEvents(
  events: PointEventRecord[],
  mediaRows: PointMediaRow[],
): Promise<PointEventRecord[]> {
  if (!events.length) {
    return events;
  }

  const hydratedMedia = await hydratePointMediaRows(mediaRows);
  const mediaByEvent = new Map<string, PointMediaRecord[]>();

  for (const media of hydratedMedia) {
    if (!media.point_event_id) {
      continue;
    }
    const currentMedia = mediaByEvent.get(media.point_event_id) ?? [];
    currentMedia.push(media);
    mediaByEvent.set(media.point_event_id, currentMedia);
  }

  return events.map((event) => ({
    ...event,
    media: mediaByEvent.get(event.id) ?? [],
  }));
}

export async function getPointTimeline(
  supabase: SupabaseClient,
  pointId: string,
): Promise<PointEventRecord[]> {
  const [{ data: eventData, error: eventError }, mediaRows] = await Promise.all([
    supabase.rpc("list_point_events", {
      p_point_id: pointId,
    }),
    listPointMediaRows(supabase, pointId),
  ]);

  if (eventError) {
    throw eventError;
  }

  const events = ((eventData ?? []) as PointEventRecord[]).map((event) => ({
    ...event,
    media: [],
  }));

  return attachMediaToEvents(events, mediaRows);
}

async function createSignedUrlMap(storagePaths: string[]) {
  const uniquePaths = [...new Set(storagePaths.filter(Boolean))];
  const signedUrlMap = new Map<string, string | null>();

  if (!uniquePaths.length) {
    return signedUrlMap;
  }

  const adminSupabase = createAdminSupabaseClient();

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      signedUrlMap.set(path, error ? null : data.signedUrl);
    }),
  );

  return signedUrlMap;
}
