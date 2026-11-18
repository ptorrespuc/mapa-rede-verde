"use client";

import { apiClient } from "@/lib/api-client";
import type {
  CreatePointPayload,
  GroupRecord,
  PointDetailRecord,
  PointRecord,
} from "@/types/domain";

/** Envia a edicao de um ponto (mesma regra da pagina de edicao e da gaveta do mapa). */
export function submitPointUpdate(pointId: string, payload: CreatePointPayload) {
  return apiClient.updatePoint(pointId, {
    groupId: payload.groupId,
    classificationId: payload.classificationId,
    tagIds: payload.tagIds ?? [],
    title: payload.title,
    speciesId: payload.speciesId?.trim() ? payload.speciesId : null,
    description: payload.description,
    isPublic: payload.isPublic,
    longitude: payload.longitude,
    latitude: payload.latitude,
    photos: payload.photos,
    photoUpdateMode: payload.photoUpdateMode,
    preservePreviousStateOnReclassification: payload.preservePreviousStateOnReclassification,
  });
}

export function isUpdatePendingReview(point: Pick<PointRecord, "has_pending_update" | "approval_status">) {
  return point.has_pending_update || point.approval_status === "pending";
}

export function describePointUpdate(point: Pick<PointRecord, "has_pending_update" | "approval_status">) {
  return isUpdatePendingReview(point)
    ? {
        title: "Alteração enviada para aprovação",
        message: "A solicitação foi registrada e agora aguarda a revisão do grupo.",
        toast: "Alteração enviada para aprovação.",
      }
    : {
        title: "Ponto atualizado",
        message: "Os dados do ponto já refletem a atualização.",
        toast: "Ponto atualizado com sucesso.",
      };
}

export function buildPointFormInitialValues(point: PointDetailRecord): Partial<CreatePointPayload> {
  return {
    groupId: point.group_id,
    classificationId: point.classification_id,
    tagIds: (point.tags ?? []).map((tag) => tag.id),
    title: point.title,
    speciesId: point.species_id ?? undefined,
    description: point.description ?? undefined,
    isPublic: point.is_public,
    longitude: point.longitude,
    latitude: point.latitude,
  };
}

/** Grupos que podem aparecer no formulario: os de envio do usuario + o grupo atual do ponto. */
export function buildEditableGroups(
  point: Pick<PointRecord, "group_id">,
  submissionGroups: GroupRecord[],
  visibleGroups: GroupRecord[],
) {
  const currentPointGroup =
    submissionGroups.find((group) => group.id === point.group_id) ??
    visibleGroups.find((group) => group.id === point.group_id) ??
    null;

  return currentPointGroup && !submissionGroups.some((group) => group.id === currentPointGroup.id)
    ? [currentPointGroup, ...submissionGroups]
    : submissionGroups;
}
