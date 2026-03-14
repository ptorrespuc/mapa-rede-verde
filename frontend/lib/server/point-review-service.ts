import "server-only";

import {
  appendCurrentPointMedia,
  clonePointMediaToEvent,
  findLatestReclassificationEventId,
  getCurrentPointMediaRows,
  removeStoredPointMedia,
  replaceCurrentPointMedia,
} from "@/lib/point-media";
import {
  hasPendingTagIds,
  getPendingTagIds,
  getPendingPointMediaDescriptors,
  getPendingPointMediaMode,
  shouldPreservePreviousState,
} from "@/lib/pending-point-updates";
import {
  buildReclassificationEventDescription,
  updatePointEventDescription,
} from "@/lib/point-reclassification";
import {
  buildPointApprovalEventDescription,
  getPointApprovalEventType,
} from "@/lib/point-approval-events";
import { ApiRouteError } from "@/lib/server/api-route";
import {
  fromPostgrestError,
  loadActorProfileIdOrThrow,
  loadPointDetailOrThrow,
  type ServerSupabaseClient,
} from "@/lib/server/point-service-shared";
import { replacePointTagAssignments } from "@/lib/server/point-tag-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PointRecord } from "@/types/domain";

export type PointReviewAction = "approve" | "reject";

export async function parsePointReviewAction(request: Request): Promise<PointReviewAction> {
  const body = await request.json().catch(() => null);
  const action =
    body?.action === "reject" ? "reject" : body?.action === "approve" ? "approve" : null;

  if (!action) {
    throw new ApiRouteError("Acao de revisao invalida.", {
      status: 400,
      code: "INVALID_REVIEW_ACTION",
    });
  }

  return action;
}

export async function reviewPointChange(options: {
  pointId: string;
  action: PointReviewAction;
  actorAuthUserId: string;
  supabase: ServerSupabaseClient;
}) {
  const { pointId, action, actorAuthUserId, supabase } = options;
  const existingPoint = await loadPointDetailOrThrow(supabase, pointId);
  const pendingPointMedia = getPendingPointMediaDescriptors(existingPoint.pending_update_data);
  const pendingPointMediaMode = getPendingPointMediaMode(existingPoint.pending_update_data);
  const pendingTagIds = getPendingTagIds(existingPoint.pending_update_data);
  const hasPendingTagSelection = hasPendingTagIds(existingPoint.pending_update_data);
  const preservePreviousState = shouldPreservePreviousState(existingPoint.pending_update_data);
  const pendingClassificationId =
    typeof existingPoint.pending_update_data?.classification_id === "string"
      ? existingPoint.pending_update_data.classification_id
      : existingPoint.classification_id;
  const isReclassificationChange = pendingClassificationId !== existingPoint.classification_id;
  const currentPointMedia = await getCurrentPointMediaRows(pointId);

  const { data, error } = await supabase.rpc("review_point", {
    p_point_id: pointId,
    p_action: action,
  });

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "POINT_REVIEW_FAILED",
    });
  }

  const point = (data as PointRecord[] | null)?.[0];

  if (!point) {
    throw new ApiRouteError("Ponto nao encontrado.", {
      status: 404,
      code: "POINT_NOT_FOUND",
    });
  }

  try {
    if (action === "approve") {
      if (preservePreviousState && isReclassificationChange) {
        const reclassificationEventId = await findLatestReclassificationEventId(pointId);

        if (reclassificationEventId) {
          await updatePointEventDescription(
            reclassificationEventId,
            buildReclassificationEventDescription(
              existingPoint,
              point.classification_name,
              true,
            ),
          );

          if (currentPointMedia.length) {
            await clonePointMediaToEvent(pointId, reclassificationEventId, currentPointMedia);
          }
        }
      }

      if (pendingPointMedia.length) {
        if (pendingPointMediaMode === "append") {
          await appendCurrentPointMedia(pointId, pendingPointMedia);
        } else {
          await replaceCurrentPointMedia(pointId, pendingPointMedia);
        }
      }

      if (existingPoint.has_pending_update && hasPendingTagSelection) {
        const adminSupabase = createAdminSupabaseClient();
        const actorProfileId = await loadActorProfileIdOrThrow(adminSupabase, actorAuthUserId);
        await replacePointTagAssignments({
          adminSupabase,
          pointId,
          tagIds: pendingTagIds,
          createdBy: actorProfileId,
        });
      }

      await recordApprovalTimelineEvent({
        actorAuthUserId,
        existingPoint,
        point,
      });
    } else if (pendingPointMedia.length) {
      await removeStoredPointMedia(pendingPointMedia);
    }
  } catch (error) {
    throw new ApiRouteError(
      error instanceof Error
        ? error.message
        : "A revisao foi concluida, mas o processamento das fotos falhou.",
      {
        status: 400,
        code: "POINT_REVIEW_POST_PROCESSING_FAILED",
      },
    );
  }

  return loadPointDetailOrThrow(supabase, pointId);
}

async function recordApprovalTimelineEvent(options: {
  actorAuthUserId: string;
  existingPoint: PointRecord;
  point: PointRecord;
}) {
  const { actorAuthUserId, existingPoint, point } = options;
  const adminSupabase = createAdminSupabaseClient();
  const actorProfileId = await loadActorProfileIdOrThrow(adminSupabase, actorAuthUserId);

  if (!actorProfileId || actorProfileId === existingPoint.created_by) {
    return;
  }

  const { error } = await adminSupabase.from("point_events").insert({
    point_id: point.id,
    point_event_type_id: null,
    event_type: getPointApprovalEventType(existingPoint.has_pending_update),
    description: buildPointApprovalEventDescription(existingPoint.has_pending_update),
    event_date: new Date().toISOString(),
    created_by: actorProfileId,
  });

  if (error) {
    console.error("[point-review-approval-event]", {
      pointId: point.id,
      actorAuthUserId,
      errorMessage: error.message,
    });
  }
}
