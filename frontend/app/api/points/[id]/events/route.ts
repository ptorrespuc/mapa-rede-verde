import {
  ApiRouteError,
  buildApiErrorResponse,
  requireAuthenticatedUser,
} from "@/lib/server/api-route";
import { canViewerSeePoint } from "@/lib/point-visibility";
import {
  createPointEvent,
  deletePointEvent,
  listPointEvents,
} from "@/lib/server/point-event-service";
import { loadPointDetailOrThrow, loadViewerProfileId } from "@/lib/server/point-service-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const POINT_EVENTS_ROUTE = "/api/points/[id]/events";

export async function GET(
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
    actorAuthUserId = user?.id ?? null;
    const point = await loadPointDetailOrThrow(supabase, id);
    const viewerProfileId = await loadViewerProfileId(supabase, actorAuthUserId);

    if (!canViewerSeePoint(point, viewerProfileId)) {
      throw new ApiRouteError("Ponto nao encontrado.", {
        status: 404,
        code: "POINT_NOT_FOUND",
      });
    }

    const events = await listPointEvents(supabase, id);
    return Response.json(events);
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_EVENTS_ROUTE,
        action: "get",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_EVENTS_LOAD_REQUEST_FAILED",
      },
    );
  }
}

export async function POST(
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

    const result = await createPointEvent({
      request,
      pointId: id,
      supabase,
    });

    return Response.json(result.event, { status: result.status });
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_EVENTS_ROUTE,
        action: "post",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_EVENT_CREATE_REQUEST_FAILED",
      },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  let actorAuthUserId: string | null = null;

  try {
    if (!eventId) {
      throw new ApiRouteError("Informe o evento que deve ser excluido.", {
        status: 400,
        code: "POINT_EVENT_ID_REQUIRED",
      });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    actorAuthUserId = requireAuthenticatedUser(user?.id);

    await deletePointEvent({
      pointId: id,
      eventId,
      supabase,
    });

    return Response.json({ success: true });
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_EVENTS_ROUTE,
        action: "delete",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_EVENT_DELETE_REQUEST_FAILED",
      },
    );
  }
}
