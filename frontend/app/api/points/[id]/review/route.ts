import { NextResponse } from "next/server";

import { withPointGroupLogo } from "@/lib/group-logos";
import {
  appendCurrentPointMedia,
  clonePointMediaToEvent,
  findLatestReclassificationEventId,
  getCurrentPointMediaRows,
  removeStoredPointMedia,
  replaceCurrentPointMedia,
} from "@/lib/point-media";
import {
  getPendingPointMediaDescriptors,
  getPendingPointMediaMode,
  shouldPreservePreviousState,
} from "@/lib/pending-point-updates";
import {
  buildReclassificationEventDescription,
  updatePointEventDescription,
} from "@/lib/point-reclassification";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointDetailRecord, PointRecord } from "@/types/domain";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action =
    body?.action === "reject" ? "reject" : body?.action === "approve" ? "approve" : null;

  if (!action) {
    return NextResponse.json({ error: "Acao de revisao invalida." }, { status: 400 });
  }

  const { data: existingPointData, error: existingPointError } = await supabase.rpc("get_point", {
    p_point_id: id,
  });

  if (existingPointError) {
    return NextResponse.json({ error: existingPointError.message }, { status: 400 });
  }

  const existingPoint = (existingPointData as PointDetailRecord[] | null)?.[0];

  if (!existingPoint) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  const pendingPointMedia = getPendingPointMediaDescriptors(existingPoint.pending_update_data);
  const pendingPointMediaMode = getPendingPointMediaMode(existingPoint.pending_update_data);
  const preservePreviousState = shouldPreservePreviousState(existingPoint.pending_update_data);
  const pendingClassificationId =
    typeof existingPoint.pending_update_data?.classification_id === "string"
      ? existingPoint.pending_update_data.classification_id
      : existingPoint.classification_id;
  const isReclassificationChange = pendingClassificationId !== existingPoint.classification_id;
  const currentPointMedia = await getCurrentPointMediaRows(id);

  const { data, error } = await supabase.rpc("review_point", {
    p_point_id: id,
    p_action: action,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const point = (data as PointRecord[] | null)?.[0];

  if (!point) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  try {
    if (action === "approve") {
      if (preservePreviousState && isReclassificationChange) {
        const reclassificationEventId = await findLatestReclassificationEventId(id);

        if (reclassificationEventId) {
          await updatePointEventDescription(
            reclassificationEventId,
            buildReclassificationEventDescription(
              existingPoint,
              point.classification_name,
              true,
            ),
          );

          if (currentPointMedia.length) {
            await clonePointMediaToEvent(id, reclassificationEventId, currentPointMedia);
          }
        }
      }

      if (pendingPointMedia.length) {
        if (pendingPointMediaMode === "append") {
          await appendCurrentPointMedia(id, pendingPointMedia);
        } else {
          await replaceCurrentPointMedia(id, pendingPointMedia);
        }
      }
    } else if (pendingPointMedia.length) {
      await removeStoredPointMedia(pendingPointMedia);
    }
  } catch (postProcessingError) {
    return NextResponse.json(
      {
        error:
          postProcessingError instanceof Error
            ? postProcessingError.message
            : "A revisao foi concluida, mas o processamento das fotos falhou.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(withPointGroupLogo(point));
}
