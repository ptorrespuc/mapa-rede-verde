import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { GROUP_LOGO_BUCKET } from "@/lib/group-logos";

export async function ensureGroupLogoBucketExists() {
  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.storage.createBucket(GROUP_LOGO_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });

  if (
    error &&
    !error.message.toLowerCase().includes("already exists") &&
    !error.message.toLowerCase().includes("duplicate")
  ) {
    throw error;
  }
}
