export type UserRole =
  | "super_admin"
  | "group_admin"
  | "group_approver"
  | "group_collaborator";

export type PointApprovalStatus = "approved" | "pending" | "rejected";

export interface PointClassificationRecord {
  id: string;
  slug: string;
  name: string;
  requires_species: boolean;
  marker_color: string;
  created_at: string;
  updated_at: string;
  event_type_count: number;
}

export interface SpeciesRecord {
  id: string;
  common_name: string;
  scientific_name: string;
  origin: "native" | "exotic";
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointRecord {
  id: string;
  group_id: string;
  group_name: string;
  group_code: string;
  group_is_public: boolean;
  group_accepts_point_collaboration: boolean;
  group_logo_path: string | null;
  group_logo_url: string | null;
  classification_id: string;
  classification_slug: string;
  classification_name: string;
  classification_requires_species: boolean;
  classification_marker_color: string;
  title: string;
  species_id: string | null;
  species_name: string | null;
  description: string | null;
  status: string;
  is_public: boolean;
  approval_status: PointApprovalStatus;
  pending_update_data: Record<string, unknown> | null;
  has_pending_update: boolean;
  pending_update_requested_by: string | null;
  pending_update_requested_at: string | null;
  longitude: number;
  latitude: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  viewer_can_manage: boolean;
  viewer_can_submit: boolean;
  viewer_can_approve: boolean;
  viewer_can_request_update: boolean;
  viewer_can_delete: boolean;
  viewer_is_creator: boolean;
}

export interface PointDetailRecord extends PointRecord {
  created_by_name: string;
}

export interface PointMediaRecord {
  id: string;
  point_id: string;
  point_event_id: string | null;
  file_url: string;
  caption: string | null;
  created_at: string;
  signed_url: string | null;
}

export interface PointEventRecord {
  id: string;
  point_id: string;
  point_event_type_id: string | null;
  event_type: string;
  description: string | null;
  event_date: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  media: PointMediaRecord[];
}

export interface PointEventTypeRecord {
  id: string;
  point_classification_id: string;
  point_classification_name: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  code: string;
  is_public: boolean;
  accepts_point_collaboration: boolean;
  logo_path: string | null;
  logo_url: string | null;
  my_role: UserRole | null;
  created_at: string;
  viewer_can_manage: boolean;
  viewer_can_submit_points: boolean;
  viewer_can_approve_points: boolean;
}

export interface UserProfile {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface UserContext {
  profile: UserProfile;
  groups: GroupRecord[];
  manageable_groups: GroupRecord[];
  submission_groups: GroupRecord[];
  approvable_groups: GroupRecord[];
  is_super_admin: boolean;
  has_group_admin: boolean;
  has_point_workspace: boolean;
}

export interface CreatePointPayload {
  groupId: string;
  classificationId: string;
  title: string;
  speciesId?: string;
  description?: string;
  status: string;
  isPublic: boolean;
  longitude: number;
  latitude: number;
}

export interface UpdatePointPayload {
  classificationId?: string;
  title?: string;
  speciesId?: string | null;
  description?: string;
  status?: string;
  isPublic?: boolean;
  longitude?: number;
  latitude?: number;
}

export interface CreatePointEventPayload {
  pointEventTypeId?: string;
  eventType?: string;
  description?: string;
  eventDate?: string;
}

export const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "planned", label: "Planejado" },
  { value: "pending", label: "Pendente" },
  { value: "resolved", label: "Resolvido" },
  { value: "archived", label: "Arquivado" },
];

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Superusuario",
  group_admin: "Administrador do grupo",
  group_approver: "Aprovador do grupo",
  group_collaborator: "Colaborador",
};
