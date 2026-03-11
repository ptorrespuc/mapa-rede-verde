import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { ApiRouteError } from "@/lib/server/api-route";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointDetailRecord } from "@/types/domain";

export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
export type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

export async function loadPointDetailOrThrow(
  supabase: ServerSupabaseClient,
  pointId: string,
) {
  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "POINT_LOOKUP_FAILED",
    });
  }

  const point = (data as PointDetailRecord[] | null)?.[0];

  if (!point) {
    throw new ApiRouteError("Ponto nao encontrado.", {
      status: 404,
      code: "POINT_NOT_FOUND",
    });
  }

  return point;
}

export async function loadViewerProfileId(
  supabase: ServerSupabaseClient,
  authUserId?: string | null,
) {
  if (!authUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "VIEWER_PROFILE_LOOKUP_FAILED",
    });
  }

  return data?.id ?? null;
}

export async function loadActorProfileIdOrThrow(
  adminSupabase: AdminSupabaseClient,
  authUserId: string,
) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw fromPostgrestError(error, {
      message: error.message,
      status: 400,
      code: "ACTOR_PROFILE_LOOKUP_FAILED",
    });
  }

  return data?.id ?? null;
}

export function fromPostgrestError(
  error: PostgrestError,
  options: {
    message?: string;
    status?: number;
    code?: string;
    details?: unknown;
  } = {},
) {
  return new ApiRouteError(options.message ?? error.message, {
    status: options.status ?? 400,
    code: options.code ?? "DATABASE_REQUEST_FAILED",
    details:
      typeof options.details !== "undefined"
        ? options.details
        : {
            details: error.details,
            hint: error.hint,
          },
  });
}
