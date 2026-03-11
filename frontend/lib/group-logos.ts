import type { GroupRecord, PointRecord } from "@/types/domain";

export const GROUP_LOGO_BUCKET = "group-logos";
const DEFAULT_MAX_PENDING_POINTS_PER_COLLABORATOR = 5;

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function getGroupLogoPublicUrl(path: string | null | undefined) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!path || !supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${GROUP_LOGO_BUCKET}/${encodeStoragePath(path)}`;
}

export function withGroupLogo<
  T extends Pick<GroupRecord, "logo_path"> & Partial<Pick<GroupRecord, "max_pending_points_per_collaborator">>,
>(group: T) {
  return {
    ...group,
    max_pending_points_per_collaborator:
      group.max_pending_points_per_collaborator ??
      DEFAULT_MAX_PENDING_POINTS_PER_COLLABORATOR,
    logo_url: getGroupLogoPublicUrl(group.logo_path),
  };
}

export function withPointGroupLogo<T extends Pick<PointRecord, "group_logo_path">>(point: T) {
  return {
    ...point,
    group_logo_url: getGroupLogoPublicUrl(point.group_logo_path),
  };
}
