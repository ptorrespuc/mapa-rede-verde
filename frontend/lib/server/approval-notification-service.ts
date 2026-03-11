import "server-only";

import {
  POINT_APPROVED_EVENT_TYPE,
  POINT_UPDATE_APPROVED_EVENT_TYPE,
} from "@/lib/point-approval-events";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ApprovalNotificationRecord } from "@/types/domain";

export async function listApprovalNotificationsForUser(
  userProfileId: string,
): Promise<ApprovalNotificationRecord[]> {
  const adminSupabase = createAdminSupabaseClient();
  const { data: pointRows, error: pointError } = await adminSupabase
    .from("points")
    .select("id, title")
    .eq("created_by", userProfileId)
    .neq("status", "archived");

  if (pointError) {
    throw pointError;
  }

  const points = pointRows ?? [];

  if (!points.length) {
    return [];
  }

  const pointIds = points.map((point) => point.id);
  const pointTitleById = new Map(points.map((point) => [point.id, point.title]));
  const { data: eventRows, error: eventError } = await adminSupabase
    .from("point_events")
    .select("id, point_id, event_type, description, event_date, created_at, created_by")
    .in("point_id", pointIds)
    .in("event_type", [POINT_APPROVED_EVENT_TYPE, POINT_UPDATE_APPROVED_EVENT_TYPE])
    .neq("created_by", userProfileId)
    .order("event_date", { ascending: false })
    .limit(100);

  if (eventError) {
    throw eventError;
  }

  const events = eventRows ?? [];

  if (!events.length) {
    return [];
  }

  const actorIds = [...new Set(events.map((event) => event.created_by).filter(Boolean))];
  const { data: actorRows, error: actorError } = await adminSupabase
    .from("users")
    .select("id, name")
    .in("id", actorIds);

  if (actorError) {
    throw actorError;
  }

  const actorNameById = new Map((actorRows ?? []).map((actor) => [actor.id, actor.name]));

  return events.map((event) => ({
    id: event.id,
    point_id: event.point_id,
    point_title: pointTitleById.get(event.point_id) ?? "Ponto",
    event_type: event.event_type,
    description: event.description,
    event_date: event.event_date,
    created_at: event.created_at,
    actor_name: actorNameById.get(event.created_by) ?? "Outro usuario",
  }));
}
