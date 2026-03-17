import type { Session } from "@supabase/supabase-js";

import { withGroupLogo, withPointGroupLogo } from "@/src/lib/group-logos";
import { supabase } from "@/src/lib/supabase";
import type {
  CreatePointEventPayload,
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  PointDetailRecord,
  PointEventRecord,
  PointEventTypeRecord,
  PointRecord,
  SpeciesRecord,
  UpdatePointPayload,
  UserContext,
  UserProfile,
} from "@/src/types/domain";

function getSingleRow<T>(rows: T[] | null | undefined, errorMessage: string) {
  const row = rows?.[0];

  if (!row) {
    throw new Error(errorMessage);
  }

  return row;
}

function requireData<T>(data: T | null, error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return session;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function listGroups() {
  const { data, error } = await supabase.rpc("list_groups");
  const rows = requireData(data, error) as GroupRecord[] | null;
  return (rows ?? []).map(withGroupLogo);
}

export async function listPointClassifications() {
  const { data, error } = await supabase.rpc("list_point_classifications");
  return (requireData(data, error) as PointClassificationRecord[] | null) ?? [];
}

export async function listSpecies() {
  const { data, error } = await supabase.rpc("list_species", {
    p_only_active: true,
  });

  return (requireData(data, error) as SpeciesRecord[] | null) ?? [];
}

export async function getUserContext(session: Session | null): Promise<UserContext | null> {
  if (!session?.user) {
    return null;
  }

  const [profileResponse, groups] = await Promise.all([
    supabase
      .from("users")
      .select("id, auth_user_id, name, email, created_at")
      .eq("auth_user_id", session.user.id)
      .single(),
    listGroups(),
  ]);

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message);
  }

  const profile = profileResponse.data as UserProfile | null;

  if (!profile) {
    return null;
  }

  const manageableGroups = groups.filter((group) => group.viewer_can_manage);
  const submissionGroups = groups.filter((group) => group.viewer_can_submit_points);
  const approvableGroups = groups.filter((group) => group.viewer_can_approve_points);

  return {
    profile,
    groups,
    manageable_groups: manageableGroups,
    submission_groups: submissionGroups,
    approvable_groups: approvableGroups,
    is_super_admin: groups.some((group) => group.my_role === "super_admin"),
    has_group_admin: groups.some(
      (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
    ),
    has_point_workspace:
      manageableGroups.length > 0 ||
      submissionGroups.length > 0 ||
      approvableGroups.length > 0,
  };
}

export async function listPoints(filters?: {
  classificationId?: string | null;
  groupId?: string | null;
}) {
  const { data, error } = await supabase.rpc("list_points", {
    p_point_classification_id: filters?.classificationId || null,
    p_group_id: filters?.groupId || null,
  });

  const rows = requireData(data, error) as PointRecord[] | null;
  return (rows ?? []).map(withPointGroupLogo);
}

export async function listWorkspacePoints(filters?: {
  classificationId?: string | null;
  groupId?: string | null;
  pendingOnly?: boolean;
  mineOnly?: boolean;
}) {
  const { data, error } = await supabase.rpc("list_workspace_points", {
    p_point_classification_id: filters?.classificationId || null,
    p_group_id: filters?.groupId || null,
    p_pending_only: filters?.pendingOnly ?? false,
    p_only_mine: filters?.mineOnly ?? false,
  });

  const rows = requireData(data, error) as PointRecord[] | null;
  return (rows ?? []).map(withPointGroupLogo);
}

export async function getPoint(pointId: string) {
  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  const point = getSingleRow(
    requireData(data, error) as PointDetailRecord[] | null,
    "Ponto nao encontrado.",
  );

  return withPointGroupLogo(point);
}

export async function listPointEvents(pointId: string) {
  const { data, error } = await supabase.rpc("list_point_events", {
    p_point_id: pointId,
  });

  const rows = requireData(data, error) as PointEventRecord[] | null;
  return (rows ?? []).map((event) => ({
    ...event,
    media: event.media ?? [],
  }));
}

export async function listPointEventTypes(pointClassificationId?: string | null) {
  const { data, error } = await supabase.rpc("list_point_event_types", {
    p_point_classification_id: pointClassificationId || null,
  });

  return (requireData(data, error) as PointEventTypeRecord[] | null) ?? [];
}

export async function createPoint(payload: CreatePointPayload) {
  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: payload.groupId,
    p_point_classification_id: payload.classificationId,
    p_title: payload.title,
    p_longitude: payload.longitude,
    p_latitude: payload.latitude,
    p_description: payload.description?.trim() || null,
    p_status: payload.status,
    p_is_public: payload.isPublic,
    p_species_id: payload.speciesId?.trim() || null,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "O ponto nao foi criado.",
  );

  return withPointGroupLogo(point);
}

export async function updatePoint(pointId: string, payload: UpdatePointPayload) {
  const speciesIdProvided = Object.prototype.hasOwnProperty.call(payload, "speciesId");
  const { data, error } = await supabase.rpc("update_point", {
    p_point_id: pointId,
    p_point_classification_id: payload.classificationId ?? null,
    p_title: payload.title ?? null,
    p_description: payload.description ?? null,
    p_status: payload.status ?? null,
    p_longitude: payload.longitude ?? null,
    p_latitude: payload.latitude ?? null,
    p_is_public: typeof payload.isPublic === "boolean" ? payload.isPublic : null,
    p_species_id: payload.speciesId ?? null,
    p_species_id_provided: speciesIdProvided,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "O ponto nao foi atualizado.",
  );

  return withPointGroupLogo(point);
}

export async function reviewPoint(pointId: string, action: "approve" | "reject") {
  const { data, error } = await supabase.rpc("review_point", {
    p_point_id: pointId,
    p_action: action,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "Nao foi possivel revisar o ponto.",
  );

  return withPointGroupLogo(point);
}

export async function createPointEvent(pointId: string, payload: CreatePointEventPayload) {
  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id: payload.pointEventTypeId || null,
    p_event_type: payload.eventType || null,
    p_description: payload.description?.trim() || null,
    p_event_date: payload.eventDate || null,
  });

  const event = getSingleRow(
    requireData(data, error) as PointEventRecord[] | null,
    "O evento nao foi criado.",
  );

  return {
    ...event,
    media: [],
  };
}
