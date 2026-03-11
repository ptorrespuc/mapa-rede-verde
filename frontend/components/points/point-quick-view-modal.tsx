"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { getPointDisplayStatusLabel, isPointPendingForReview } from "@/lib/point-display";
import { PointReviewActions } from "@/components/points/point-review-actions";
import type { PointMediaRecord, PointRecord } from "@/types/domain";

interface PointQuickViewModalProps {
  point: PointRecord | null;
  onClose: () => void;
  onApprove?: (point: PointRecord) => Promise<void> | void;
  onReject?: (point: PointRecord) => Promise<void> | void;
  onDelete?: (point: PointRecord) => Promise<void> | void;
}

export function PointQuickViewModal({
  point,
  onClose,
  onApprove,
  onReject,
  onDelete,
}: PointQuickViewModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pointMedia, setPointMedia] = useState<PointMediaRecord[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadPointMedia() {
      if (!point?.id) {
        return;
      }

      setIsLoadingMedia(true);

      try {
        const media = await apiClient.getPointMedia(point.id);

        if (!ignore) {
          setPointMedia(media);
        }
      } catch {
        if (!ignore) {
          setPointMedia([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingMedia(false);
        }
      }
    }

    setPointMedia([]);
    void loadPointMedia();

    return () => {
      ignore = true;
    };
  }, [point?.id]);

  if (!point) {
    return null;
  }

  const currentPoint = point;
  const canReview = currentPoint.viewer_can_approve && isPointPendingForReview(currentPoint);
  const canDelete = currentPoint.viewer_can_delete && typeof onDelete === "function";
  const firstPointPhoto = pointMedia[0] ?? null;

  async function runAction(action?: (point: PointRecord) => Promise<void> | void) {
    if (!action) {
      return;
    }

    setIsSubmitting(true);

    try {
      await action(currentPoint);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card stack-md">
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <p className="eyebrow">Ponto</p>
              <h2 className="section-title">{point.title}</h2>
              <p className="subtitle">
                {currentPoint.group_name} | {currentPoint.classification_name} |{" "}
                {getPointDisplayStatusLabel(currentPoint)}
              </p>
            </div>
            <button
              aria-label="Fechar janela"
              className="modal-close-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>

        <div className="point-meta">
          <span className="badge">{currentPoint.classification_name}</span>
          <span className="badge">{currentPoint.is_public ? "publico" : "privado"}</span>
          <span className="badge">{currentPoint.group_is_public ? "grupo publico" : "grupo privado"}</span>
          <span className="badge">{getPointDisplayStatusLabel(currentPoint)}</span>
          <span className="badge">
            {currentPoint.approval_status === "approved"
              ? "aprovado"
              : currentPoint.approval_status === "pending"
                ? "pendente"
                : "rejeitado"}
          </span>
          {currentPoint.has_pending_update ? <span className="badge">alteracao pendente</span> : null}
        </div>

        {currentPoint.classification_requires_species && currentPoint.species_name ? (
          <div className="surface-subtle stack-xs">
            <span className="muted">Especie</span>
            <strong>{currentPoint.species_name}</strong>
          </div>
        ) : null}

        {isLoadingMedia ? (
          <div className="surface-subtle">
            <span className="muted">Carregando foto do ponto...</span>
          </div>
        ) : firstPointPhoto?.signed_url ? (
          <div className="point-photo-inline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={firstPointPhoto.caption || `Foto de ${currentPoint.title}`}
              className="point-photo-inline-image"
              src={firstPointPhoto.signed_url}
            />
            <div className="stack-xs">
              <span className="muted">{firstPointPhoto.caption || "Foto principal do ponto."}</span>
              <div className="form-actions">
                <a
                  className="button-ghost"
                  download
                  href={firstPointPhoto.signed_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Baixar imagem
                </a>
              </div>
            </div>
          </div>
        ) : null}

        <div className="stack-sm">
          <div>
            <span className="muted">Descricao</span>
            <p className="detail-value">{currentPoint.description || "Nenhuma descricao informada."}</p>
          </div>
          <div>
            <span className="muted">Coordenadas</span>
            <p className="detail-value">
              {currentPoint.latitude.toFixed(6)}, {currentPoint.longitude.toFixed(6)}
            </p>
          </div>
        </div>

        {canReview && onApprove && onReject ? (
          <PointReviewActions
            hasPendingUpdate={currentPoint.has_pending_update}
            onReviewAction={(action) =>
              action === "approve" ? runAction(onApprove) : runAction(onReject)
            }
            pointId={currentPoint.id}
          />
        ) : null}

        <div className="form-actions">
          {canDelete ? (
            <button
              className="button-ghost danger"
              disabled={isSubmitting}
              onClick={() => void runAction(onDelete)}
              type="button"
            >
              Arquivar ponto
            </button>
          ) : null}
          <Link className="button" href={`/points/${currentPoint.id}`}>
            Abrir detalhe completo
          </Link>
          <button className="button-ghost" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
