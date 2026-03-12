import Link from "next/link";
import { notFound } from "next/navigation";

import { DeletePointButton } from "@/components/points/delete-point-button";
import { PointMapPreviewTrigger } from "@/components/points/point-map-preview-trigger";
import { PointReviewActions } from "@/components/points/point-review-actions";
import { PointTimeline } from "@/components/points/point-timeline";
import { getCurrentUserContext } from "@/lib/auth";
import { getPointDisplayStatusLabel, isPointPendingForReview } from "@/lib/point-display";
import { withPointGroupLogo } from "@/lib/group-logos";
import { canViewerSeePoint } from "@/lib/point-visibility";
import { getPointMedia, getPointTimeline } from "@/lib/point-timeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type PointDetailRecord,
  type PointEventRecord,
  type PointEventTypeRecord,
  type PointMediaRecord,
} from "@/types/domain";

export default async function PointDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getCurrentUserContext();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: pointData }] = await Promise.all([supabase.rpc("get_point", { p_point_id: id })]);

  const rawPoint = (pointData as PointDetailRecord[] | null)?.[0] ?? null;

  if (!rawPoint) {
    notFound();
  }

  if (!canViewerSeePoint(rawPoint, context?.profile.id ?? null)) {
    notFound();
  }

  const point = withPointGroupLogo(rawPoint);
  const [timeline, pointMedia, { data: eventTypeData }] = await Promise.all([
    getPointTimeline(supabase, id),
    getPointMedia(supabase, id),
    supabase.rpc("list_point_event_types", {
      p_point_classification_id: point.classification_id,
    }),
  ]);
  const pointPhotos = pointMedia as PointMediaRecord[];

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Detalhe do ponto</p>
          <div className="group-heading-row">
            {point.group_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Logo de ${point.group_name}`}
                className="group-logo"
                src={point.group_logo_url}
              />
            ) : null}
            <h1>{point.title}</h1>
          </div>
          <p className="subtitle">
            {point.group_name} | {point.classification_name} |{" "}
            {getPointDisplayStatusLabel(point)}
          </p>
        </div>
        <div className="button-row">
          {point.viewer_can_manage || point.viewer_can_request_update ? (
            <Link className="button-secondary" href={`/points/${point.id}/edit`}>
              {point.viewer_can_manage ? "Editar ponto" : "Solicitar alteracao"}
            </Link>
          ) : null}
          {point.viewer_can_delete ? <DeletePointButton pointId={point.id} /> : null}
          <Link className="button-ghost" href="/map">
            Voltar ao mapa
          </Link>
        </div>
      </div>

      <div className="stat-grid point-detail-summary-grid">
        <article className="stat-card point-detail-location-card">
          <span className="muted">Localizacao</span>
          <div className="point-detail-location-row">
            <div className="point-detail-coordinate-chip">
              <span className="muted">Latitude</span>
              <strong>{point.latitude.toFixed(6)}</strong>
            </div>
            <div className="point-detail-coordinate-chip">
              <span className="muted">Longitude</span>
              <strong>{point.longitude.toFixed(6)}</strong>
            </div>
            <PointMapPreviewTrigger
              className="button-inline-ghost button-ghost detail-map-preview-button"
              label="Visualizar este ponto no mapa"
              point={point}
              variant="text"
            />
          </div>
        </article>
        <article className="stat-card point-detail-owner-card">
          <span className="muted">Criado por</span>
          <strong>{point.created_by_name}</strong>
        </article>
      </div>

      <section className="panel stack-md">
        {point.approval_status !== "approved" ? (
          <div className="surface-subtle stack-xs">
            <strong>
              {point.approval_status === "pending"
                ? "Ponto aguardando aprovacao"
                : "Ponto rejeitado"}
            </strong>
            <span className="muted">
              {point.approval_status === "pending"
                ? "Este registro ainda nao aparece no mapa publico ate ser revisado."
                : "Ajuste os dados e envie novamente para aprovacao."}
            </span>
            {point.viewer_can_approve && isPointPendingForReview(point) ? (
              <PointReviewActions
                hasPendingUpdate={point.has_pending_update}
                pointId={point.id}
              />
            ) : null}
          </div>
        ) : null}
        {point.has_pending_update ? (
          <div className="surface-subtle stack-xs">
            <strong>Alteracao pendente</strong>
            <span className="muted">
              Existe uma solicitacao de alteracao aguardando revisao deste ponto.
            </span>
            {point.viewer_can_approve &&
            point.approval_status === "approved" &&
            isPointPendingForReview(point) ? (
              <PointReviewActions
                hasPendingUpdate={point.has_pending_update}
                pointId={point.id}
              />
            ) : null}
          </div>
        ) : null}
        <div className="stack-sm">
          {point.description?.trim() ? (
            <div>
              <h2 className="section-title">Descricao</h2>
              <p className="subtitle">{point.description}</p>
            </div>
          ) : null}
          {point.classification_requires_species && point.species_name ? (
            <div>
              <span className="muted">Especie registrada</span>
              <p className="detail-value">{point.species_name}</p>
            </div>
          ) : null}
        </div>
        <div className="point-meta">
          <span className="badge">{point.classification_name}</span>
          <span className="badge">{getPointDisplayStatusLabel(point)}</span>
          <span className="badge">{point.is_public ? "publico" : "privado"}</span>
          <span className="badge">{point.group_is_public ? "grupo publico" : "grupo privado"}</span>
          <span className="badge">
            {point.approval_status === "approved"
              ? "aprovado"
              : point.approval_status === "pending"
                ? "pendente"
                : "rejeitado"}
          </span>
          {point.has_pending_update ? <span className="badge">alteracao pendente</span> : null}
          <span className="muted">Criado em {new Date(point.created_at).toLocaleString("pt-BR")}</span>
        </div>
        {point.viewer_can_manage || point.viewer_can_request_update ? (
          <div className="surface-subtle stack-xs">
            <strong>Alterar classificacao</strong>
            <span className="muted">
              {point.viewer_can_manage
                ? "Use Editar ponto para mudar a classificacao. A linha do tempo registra a reclassificacao automaticamente."
                : "Use Solicitar alteracao para pedir uma nova classificacao. Depois da aprovacao, a linha do tempo registra a reclassificacao automaticamente."}
            </span>
          </div>
        ) : null}
      </section>

      {pointPhotos.length ? (
        <section className="panel stack-md">
          <div>
            <h2 className="section-title">Fotos do ponto</h2>
            <p className="subtitle">Imagens registradas no cadastro inicial do ponto.</p>
          </div>
          <div className="point-photo-gallery">
            {pointPhotos.map((media) => (
              <article className="point-photo-card" key={media.id}>
                {media.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={media.caption || `Foto do ponto ${point.title}`}
                    className="point-photo-thumb"
                    loading="lazy"
                    src={media.signed_url}
                  />
                ) : (
                  <div className="point-photo-thumb-placeholder">Imagem indisponivel</div>
                )}
                {media.caption ? <span className="muted">{media.caption}</span> : null}
                {media.signed_url ? (
                  <div className="form-actions">
                    <a
                      className="button-ghost"
                      download
                      href={media.signed_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Baixar imagem
                    </a>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <PointTimeline
        pointId={point.id}
        eventTypeOptions={(eventTypeData ?? []) as PointEventTypeRecord[]}
        initialEvents={timeline as PointEventRecord[]}
        canManage={Boolean(context) && point.viewer_can_manage}
      />
    </section>
  );
}
