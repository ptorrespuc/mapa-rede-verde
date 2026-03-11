import { redirect } from "next/navigation";

import { withGroupLogo } from "@/lib/group-logos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GroupRecord, UserContext, UserProfile } from "@/types/domain";

export async function getCurrentUserContext(): Promise<UserContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: groups }] = await Promise.all([
    supabase
      .from("users")
      .select("id, auth_user_id, name, email, created_at")
      .eq("auth_user_id", user.id)
      .single(),
    supabase.rpc("list_groups"),
  ]);

  const memberships = (((groups ?? []) as GroupRecord[]) ?? []).map(withGroupLogo);

  if (!profile) {
    return null;
  }

  const manageableGroups = memberships.filter(
    (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
  );
  const submissionGroups = memberships.filter((group) => group.viewer_can_submit_points);
  const approvableGroups = memberships.filter((group) => group.viewer_can_approve_points);

  return {
    profile: profile as UserProfile,
    groups: memberships,
    manageable_groups: manageableGroups,
    submission_groups: submissionGroups,
    approvable_groups: approvableGroups,
    is_super_admin: memberships.some((group) => group.my_role === "super_admin"),
    has_group_admin: memberships.some(
      (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
    ),
    has_point_workspace:
      manageableGroups.length > 0 || submissionGroups.length > 0 || approvableGroups.length > 0,
  };
}

export async function requireUserContext() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}
