export const POINT_APPROVED_EVENT_TYPE = "Ponto aprovado";
export const POINT_UPDATE_APPROVED_EVENT_TYPE = "Alteracao aprovada";

export function getPointApprovalEventType(hasPendingUpdate: boolean) {
  return hasPendingUpdate ? POINT_UPDATE_APPROVED_EVENT_TYPE : POINT_APPROVED_EVENT_TYPE;
}

export function buildPointApprovalEventDescription(hasPendingUpdate: boolean) {
  return hasPendingUpdate
    ? "A alteracao solicitada para este ponto foi aprovada e passou a valer no cadastro."
    : "O ponto foi aprovado e passou a integrar o mapa validado do grupo.";
}
