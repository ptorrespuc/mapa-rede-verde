import { withPointGroupLogo } from "@/lib/group-logos";
import { removeStoredPointMedia } from "@/lib/point-media";
import { getPendingPointMediaDescriptors } from "@/lib/pending-point-updates";
import {
  ApiRouteError,
  buildApiErrorResponse,
  requireAuthenticatedUser,
} from "@/lib/server/api-route";
import {
  loadActorProfileIdOrThrow,
  loadPointDetailOrThrow,
} from "@/lib/server/point-service-shared";
import {
  parsePointPatchRequest,
  updatePointWithPendingMedia,
} from "@/lib/server/point-update-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const POINT_ROUTE = "/api/points/[id]";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const supabase = await createServerSupabaseClient();
    const point = await loadPointDetailOrThrow(supabase, id);

    return Response.json(withPointGroupLogo(point));
  } catch (error) {
    return buildApiErrorResponse(error, {
      route: POINT_ROUTE,
      action: "get",
      pointId: id,
    });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let actorAuthUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    actorAuthUserId = requireAuthenticatedUser(user?.id);

    const parsed = await parsePointPatchRequest(request);
    const point = await updatePointWithPendingMedia({
      pointId: id,
      parsed,
      supabase,
    });

    return Response.json(withPointGroupLogo(point));
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_ROUTE,
        action: "patch",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_UPDATE_REQUEST_FAILED",
      },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let actorAuthUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    actorAuthUserId = requireAuthenticatedUser(user?.id);

    const point = await loadPointDetailOrThrow(supabase, id);

    if (!point.viewer_can_delete) {
      throw new ApiRouteError("Voce nao tem permissao para arquivar este ponto.", {
        status: 403,
        code: "POINT_ARCHIVE_FORBIDDEN",
      });
    }

    const adminSupabase = createAdminSupabaseClient();
    const pendingPointMedia = getPendingPointMediaDescriptors(point.pending_update_data);
    const actorProfileId = await loadActorProfileIdOrThrow(adminSupabase, actorAuthUserId);
    const { error: archiveError } = await adminSupabase
      .from("points")
      .update({
        status: "archived",
        approval_status: "approved",
        approved_by: actorProfileId ?? point.approved_by ?? point.created_by,
        approved_at: new Date().toISOString(),
        pending_update_data: null,
        pending_update_requested_by: null,
        pending_update_requested_at: null,
      })
      .eq("id", id);

    if (archiveError) {
      throw new ApiRouteError(archiveError.message, {
        status: 400,
        code: "POINT_ARCHIVE_FAILED",
      });
    }

    if (pendingPointMedia.length) {
      await removeStoredPointMedia(pendingPointMedia).catch((storageError) => {
        console.error("[point-archive-storage-cleanup]", {
          pointId: id,
          errorMessage:
            storageError instanceof Error ? storageError.message : "Erro desconhecido",
        });
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_ROUTE,
        action: "delete",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_ARCHIVE_REQUEST_FAILED",
      },
    );
  }
}
