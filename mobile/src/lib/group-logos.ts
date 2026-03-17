import type { GroupRecord, PointRecord } from "@/src/types/domain";

export const GROUP_LOGO_BUCKET = "group-logos";

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getGroupLogoPublicUrl(path: string | null | undefined) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl || !path) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${GROUP_LOGO_BUCKET}/${encodeStoragePath(path)}`;
}

export function withGroupLogo<T extends Pick<GroupRecord, "logo_path">>(group: T) {
  return {
    ...group,
    logo_url: getGroupLogoPublicUrl(group.logo_path),
  };
}

export function withPointGroupLogo<T extends Pick<PointRecord, "group_logo_path">>(point: T) {
  return {
    ...point,
    group_logo_url: getGroupLogoPublicUrl(point.group_logo_path),
  };
}
