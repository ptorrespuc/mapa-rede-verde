import { STATUS_LABELS, type PointRecord } from "@/src/types/domain";

export const PENDING_POINT_COLOR = "#d6b23f";

export function isPointPendingForReview(
  point: Pick<PointRecord, "approval_status" | "has_pending_update">,
) {
  return point.approval_status === "pending" || point.has_pending_update;
}

export function getPointDisplayColor(
  point: Pick<PointRecord, "approval_status" | "classification_marker_color">,
) {
  if (point.approval_status === "pending") {
    return PENDING_POINT_COLOR;
  }

  return point.classification_marker_color || "#6a5a91";
}

export function getPointDisplayStatus(
  point: Pick<PointRecord, "approval_status" | "status">,
) {
  return point.approval_status === "pending" ? "pending" : point.status;
}

export function getPointDisplayStatusLabel(
  point: Pick<PointRecord, "approval_status" | "status">,
) {
  const status = getPointDisplayStatus(point);
  return STATUS_LABELS[status] ?? status;
}
