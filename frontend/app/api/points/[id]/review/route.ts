import { withPointGroupLogo } from "@/lib/group-logos";
import {
  buildApiErrorResponse,
  requireAuthenticatedUser,
} from "@/lib/server/api-route";
import {
  parsePointReviewAction,
  reviewPointChange,
} from "@/lib/server/point-review-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const POINT_REVIEW_ROUTE = "/api/points/[id]/review";

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

    const action = await parsePointReviewAction(request);
    const point = await reviewPointChange({
      pointId: id,
      action,
      actorAuthUserId,
      supabase,
    });

    return Response.json(withPointGroupLogo(point));
  } catch (error) {
    return buildApiErrorResponse(
      error,
      {
        route: POINT_REVIEW_ROUTE,
        action: "post",
        actorAuthUserId,
        pointId: id,
      },
      {
        code: "POINT_REVIEW_REQUEST_FAILED",
      },
    );
  }
}
