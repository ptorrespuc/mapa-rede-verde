import type { PointRecord } from "@/types/domain";

type PointVisibilityRecord = Pick<
  PointRecord,
  | "status"
  | "approval_status"
  | "has_pending_update"
  | "viewer_can_approve"
  | "viewer_is_creator"
  | "pending_update_requested_by"
>;

export function isPointPendingRestricted(
  point: Pick<PointVisibilityRecord, "approval_status" | "has_pending_update">,
) {
  return point.approval_status === "pending" || point.has_pending_update;
}

export function canViewerSeePendingPoint(
  point: Pick<
    PointVisibilityRecord,
    | "approval_status"
    | "has_pending_update"
    | "viewer_can_approve"
    | "viewer_is_creator"
    | "pending_update_requested_by"
  >,
  viewerProfileId?: string | null,
) {
  if (!isPointPendingRestricted(point)) {
    return true;
  }

  if (point.viewer_can_approve || point.viewer_is_creator) {
    return true;
  }

  return Boolean(
    viewerProfileId &&
      point.pending_update_requested_by &&
      point.pending_update_requested_by === viewerProfileId,
  );
}

export function canViewerSeePoint(point: PointVisibilityRecord, viewerProfileId?: string | null) {
  if (point.status === "archived") {
    return false;
  }

  return canViewerSeePendingPoint(point, viewerProfileId);
}

export function filterVisiblePoints<T extends PointVisibilityRecord>(
  points: T[],
  viewerProfileId?: string | null,
) {
  return points.filter((point) => canViewerSeePoint(point, viewerProfileId));
}
