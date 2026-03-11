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
  is_active: boolean;
  marker_color: string;
  created_at: string;
  updated_at: string;
  event_type_count: number;
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
  species_common_name?: string | null;
  species_scientific_name?: string | null;
  species_origin?: "native" | "exotic" | null;
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

export type PendingReviewMediaMode = "append" | "replace" | "unspecified" | null;

export interface PendingPointReviewSnapshot {
  classificationName: string;
  title: string;
  speciesName: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  isPublic: boolean;
}

export interface PendingPointReviewChange {
  field: string;
  label: string;
  currentValue: string;
  nextValue: string;
}

export interface PendingPointReviewSummary {
  pointId: string;
  requestedAt: string | null;
  current: PendingPointReviewSnapshot;
  proposed: PendingPointReviewSnapshot;
  changes: PendingPointReviewChange[];
  currentMedia: PointMediaRecord[];
  pendingMedia: PointMediaRecord[];
  resultingMedia: PointMediaRecord[];
  pendingMediaMode: PendingReviewMediaMode;
}

export interface PointPhotoInput {
  file: File;
  caption?: string;
}

export type PointPhotoUpdateMode = "append" | "replace";

export type PointEventPhotoInput = PointPhotoInput;

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

export interface GroupRecord {
  id: string;
  name: string;
  code: string;
  is_public: boolean;
  accepts_point_collaboration: boolean;
  max_pending_points_per_collaborator: number;
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

export interface AdminUserGroupMembership {
  group_id: string;
  group_name: string;
  group_code: string;
  role: UserRole;
}

export interface AdminUserRecord extends UserProfile {
  memberships: AdminUserGroupMembership[];
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
  isPublic: boolean;
  longitude: number;
  latitude: number;
  photos?: PointPhotoInput[];
  photoUpdateMode?: PointPhotoUpdateMode;
  preservePreviousStateOnReclassification?: boolean;
}

export interface UpdatePointPayload {
  classificationId?: string;
  title?: string;
  speciesId?: string | null;
  description?: string;
  isPublic?: boolean;
  longitude?: number;
  latitude?: number;
  photos?: PointPhotoInput[];
  photoUpdateMode?: PointPhotoUpdateMode;
  preservePreviousStateOnReclassification?: boolean;
}

export interface CreatePointEventPayload {
  pointEventTypeId?: string;
  eventType?: string;
  description?: string;
  eventDate?: string;
  photos?: PointEventPhotoInput[];
}

export interface CreateGroupPayload {
  name: string;
  code?: string;
  isPublic: boolean;
  acceptsPointCollaboration: boolean;
  maxPendingPointsPerCollaborator?: number;
  logo?: File;
}

export interface UpdateGroupPayload {
  name?: string;
  code?: string;
  isPublic?: boolean;
  acceptsPointCollaboration?: boolean;
  maxPendingPointsPerCollaborator?: number;
  logo?: File;
  removeLogo?: boolean;
}

export interface AddUserToGroupPayload {
  userId: string;
  role: UserRole;
}

export interface CreateAdminUserPayload {
  name: string;
  email: string;
  groupId: string;
  role: UserRole;
}

export interface UpdateAdminUserMembershipPayload {
  groupId: string;
  role: UserRole;
}

export interface UpdateAdminUserPayload {
  name?: string;
  email?: string;
  memberships?: UpdateAdminUserMembershipPayload[];
}

export interface CreatePointClassificationPayload {
  name: string;
  slug?: string;
  requiresSpecies: boolean;
  markerColor?: string;
}

export interface UpdatePointClassificationPayload {
  name?: string;
  slug?: string;
  requiresSpecies?: boolean;
  isActive?: boolean;
  markerColor?: string;
}

export interface CreateSpeciesPayload {
  commonName: string;
  scientificName: string;
  origin: "native" | "exotic";
  isActive?: boolean;
}

export interface UpdateSpeciesPayload {
  commonName?: string;
  scientificName?: string;
  origin?: "native" | "exotic";
  isActive?: boolean;
}

export interface CreatePointEventTypePayload {
  pointClassificationId: string;
  name: string;
  slug?: string;
}

export interface UpdatePointEventTypePayload {
  pointClassificationId?: string;
  name?: string;
  slug?: string;
}

export const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "pending", label: "Pendente" },
  { value: "archived", label: "Arquivado" },
];

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export const USER_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "group_collaborator", label: "Colaborador" },
  { value: "group_approver", label: "Aprovador do grupo" },
  { value: "group_admin", label: "Administrador do grupo" },
  { value: "super_admin", label: "Superusuario" },
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  group_collaborator: "Colaborador",
  group_approver: "Aprovador do grupo",
  group_admin: "Administrador do grupo",
  super_admin: "Superusuario",
};
