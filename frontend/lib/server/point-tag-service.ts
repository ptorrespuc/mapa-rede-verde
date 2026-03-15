import "server-only";

import { ApiRouteError } from "@/lib/server/api-route";
import {
  fromPostgrestError,
  type AdminSupabaseClient,
  type ServerSupabaseClient,
} from "@/lib/server/point-service-shared";
import { loadPointTags } from "@/lib/point-tags";

function normalizeTagIds(tagIds: string[] | null | undefined) {
  return Array.from(
    new Set(
      (tagIds ?? [])
        .map((tagId) => tagId.trim())
        .filter((tagId) => tagId.length > 0),
    ),
  );
}

export async function validatePointTagSelection(options: {
  supabase: ServerSupabaseClient;
  classificationId: string;
  tagIds: string[];
}) {
  const normalizedTagIds = normalizeTagIds(options.tagIds);

  if (!normalizedTagIds.length) {
    return [];
  }

  const { data, error } = await loadPointTags(options.supabase, {
    pointClassificationId: options.classificationId,
    onlyActive: true,
  });

  if (error) {
    throw new ApiRouteError(error.message, {
      status: 400,
      code: "POINT_TAG_LOOKUP_FAILED",
    });
  }

  const availableTagIds = new Set((data ?? []).map((tag) => tag.id));
  const invalidTagIds = normalizedTagIds.filter((tagId) => !availableTagIds.has(tagId));

  if (invalidTagIds.length) {
    throw new ApiRouteError("As tags selecionadas nao pertencem a esta classificacao.", {
      status: 400,
      code: "INVALID_POINT_TAG_SELECTION",
    });
  }

  return normalizedTagIds;
}

export async function replacePointTagAssignments(options: {
  adminSupabase: AdminSupabaseClient;
  pointId: string;
  tagIds: string[];
  createdBy?: string | null;
}) {
  const normalizedTagIds = normalizeTagIds(options.tagIds);

  const { error: deleteError } = await options.adminSupabase
    .from("point_tag_assignments")
    .delete()
    .eq("point_id", options.pointId);

  if (deleteError) {
    throw fromPostgrestError(deleteError, {
      message: deleteError.message,
      status: 400,
      code: "POINT_TAG_ASSIGNMENT_DELETE_FAILED",
    });
  }

  if (!normalizedTagIds.length) {
    return;
  }

  const { error: insertError } = await options.adminSupabase
    .from("point_tag_assignments")
    .insert(
      normalizedTagIds.map((tagId) => ({
        point_id: options.pointId,
        point_tag_id: tagId,
        created_by: options.createdBy ?? null,
      })),
    );

  if (insertError) {
    throw fromPostgrestError(insertError, {
      message: insertError.message,
      status: 400,
      code: "POINT_TAG_ASSIGNMENT_INSERT_FAILED",
    });
  }
}
