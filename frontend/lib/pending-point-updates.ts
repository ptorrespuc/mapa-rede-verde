export interface PendingPointMediaDescriptor {
  file_url: string;
  caption: string | null;
}

export type PendingPointMediaMode = "append" | "replace";

const PRESERVE_PREVIOUS_STATE_KEY = "preserve_previous_state";
const PENDING_POINT_MEDIA_KEY = "pending_point_media";
const PENDING_POINT_MEDIA_MODE_KEY = "pending_point_media_mode";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getPendingPointMediaDescriptors(
  pendingUpdateData: Record<string, unknown> | null | undefined,
) {
  const rawValue = pendingUpdateData?.[PENDING_POINT_MEDIA_KEY];

  if (!Array.isArray(rawValue)) {
    return [] as PendingPointMediaDescriptor[];
  }

  return rawValue
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      file_url: typeof item.file_url === "string" ? item.file_url : "",
      caption: typeof item.caption === "string" && item.caption.trim() ? item.caption.trim() : null,
    }))
    .filter((item) => item.file_url);
}

export function shouldPreservePreviousState(
  pendingUpdateData: Record<string, unknown> | null | undefined,
) {
  return pendingUpdateData?.[PRESERVE_PREVIOUS_STATE_KEY] === true;
}

export function getPendingPointMediaMode(
  pendingUpdateData: Record<string, unknown> | null | undefined,
): PendingPointMediaMode {
  return pendingUpdateData?.[PENDING_POINT_MEDIA_MODE_KEY] === "append" ? "append" : "replace";
}

export function mergePendingUpdateMetadata(
  pendingUpdateData: Record<string, unknown> | null | undefined,
  options: {
    preservePreviousState?: boolean;
    pendingPointMedia?: PendingPointMediaDescriptor[];
    pendingPointMediaMode?: PendingPointMediaMode;
  },
) {
  const nextData = isRecord(pendingUpdateData) ? { ...pendingUpdateData } : {};

  if (typeof options.preservePreviousState === "boolean") {
    if (options.preservePreviousState) {
      nextData[PRESERVE_PREVIOUS_STATE_KEY] = true;
    } else {
      delete nextData[PRESERVE_PREVIOUS_STATE_KEY];
    }
  }

  if (options.pendingPointMedia) {
    if (options.pendingPointMedia.length) {
      nextData[PENDING_POINT_MEDIA_KEY] = options.pendingPointMedia;
      nextData[PENDING_POINT_MEDIA_MODE_KEY] = options.pendingPointMediaMode ?? "replace";
    } else {
      delete nextData[PENDING_POINT_MEDIA_KEY];
      delete nextData[PENDING_POINT_MEDIA_MODE_KEY];
    }
  }

  return nextData;
}
