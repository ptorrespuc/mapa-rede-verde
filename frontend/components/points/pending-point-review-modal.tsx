"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import type {
  PendingPointReviewSummary,
  PointMediaRecord,
} from "@/types/domain";

type PendingReviewViewMode = "preview" | "diff";

interface PendingPointReviewModalProps {
  pointId: string;
  initialMode: PendingReviewViewMode;
  hasPendingUpdate?: boolean;
  isReviewing?: boolean;
  onReviewAction?: (action: "approve" | "reject") => Promise<void> | void;
  onClose: () => void;
}

export function PendingPointReviewModal({
  pointId,
  initialMode,
  hasPendingUpdate = true,
  isReviewing = false,
  onReviewAction,
  onClose,
}: PendingPointReviewModalProps) {
  const [mode, setMode] = useState<PendingReviewViewMode>(initialMode);
  const [summary, setSummary] = useState<PendingPointReviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let ignore = false;

    async function loadSummary() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextSummary = await apiClient.getPendingPointReview(pointId);

        if (!ignore) {
          setSummary(nextSummary);
        }
      } catch (error) {
        if (!ignore) {
          setSummary(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Nao foi possivel carregar a revisao da alteracao.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      ignore = true;
    };
  }, [pointId]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card stack-md">
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <p className="eyebrow">Revisao da alteracao</p>
              <h2 className="section-title">Alteracao pendente</h2>
              <p className="subtitle">
                Veja como o ponto ficaria e compare os dados antes de aprovar ou rejeitar.
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

        {isLoading ? (
          <div className="surface-subtle">
            <span className="muted">Carregando alteracao pendente...</span>
          </div>
        ) : errorMessage ? (
          <div className="surface-subtle stack-xs">
            <strong>Nao foi possivel abrir a revisao.</strong>
            <span className="muted">{errorMessage}</span>
          </div>
        ) : summary ? (
          <>
            <div className="review-tab-row">
              <button
                className={mode === "preview" ? "button-secondary" : "button-ghost"}
                onClick={() => setMode("preview")}
                type="button"
              >
                Visualizar alteracao
              </button>
              <button
                className={mode === "diff" ? "button-secondary" : "button-ghost"}
                onClick={() => setMode("diff")}
                type="button"
              >
                Visualizar diferencas
              </button>
            </div>

            {summary.requestedAt ? (
              <span className="muted">
                Solicitacao registrada em{" "}
                {new Date(summary.requestedAt).toLocaleString("pt-BR")}
              </span>
            ) : null}

            {mode === "preview" ? (
              <PreviewModeContent summary={summary} />
            ) : (
              <DiffModeContent summary={summary} />
            )}
          </>
        ) : null}

        <div className="form-actions">
          {onReviewAction ? (
            <>
              <button
                className="button-secondary"
                disabled={isLoading || isReviewing}
                onClick={() => void onReviewAction("approve")}
                type="button"
              >
                {hasPendingUpdate ? "Aprovar alteracao" : "Aprovar ponto"}
              </button>
              <button
                className="button-ghost danger"
                disabled={isLoading || isReviewing}
                onClick={() => void onReviewAction("reject")}
                type="button"
              >
                {hasPendingUpdate ? "Rejeitar alteracao" : "Rejeitar ponto"}
              </button>
            </>
          ) : null}
          <button className="button-ghost" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModeContent({ summary }: { summary: PendingPointReviewSummary }) {
  return (
    <div className="stack-md">
      <div className="pending-preview-grid">
        <InfoCard label="Grupo" value={summary.proposed.groupName} />
        <InfoCard label="Classificacao" value={summary.proposed.classificationName} />
        <InfoCard label="Titulo" value={summary.proposed.title} />
        <InfoCard label="Especie" value={summary.proposed.speciesName ?? "Sem especie"} />
        <InfoCard
          label="Tags"
          value={summary.proposed.tagNames.length ? summary.proposed.tagNames.join(", ") : "Sem tags"}
          multiline
        />
        <InfoCard
          label="Visibilidade"
          value={summary.proposed.isPublic ? "Publico" : "Privado"}
        />
        <InfoCard
          label="Posicao no mapa"
          value={`${summary.proposed.latitude.toFixed(6)}, ${summary.proposed.longitude.toFixed(6)}`}
        />
        <InfoCard
          label="Descricao"
          value={summary.proposed.description ?? "Sem descricao"}
          multiline
        />
      </div>

      {summary.pendingMedia.length ? (
        <div className="stack-sm">
          <div className="point-meta">
            <span className="badge">{getMediaModeLabel(summary.pendingMediaMode)}</span>
          </div>
          {summary.pendingMediaMode === "unspecified" ? (
            <span className="muted">
              Existem fotos pendentes ligadas a esta alteracao. O modo exato de aplicacao nao foi
              registrado, entao elas aparecem aqui para revisao.
            </span>
          ) : null}
          <div>
            <h3 className="section-title">Fotos relacionadas a alteracao</h3>
            <PhotoGrid media={summary.resultingMedia} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DiffModeContent({ summary }: { summary: PendingPointReviewSummary }) {
  return (
    <div className="stack-md">
      {summary.changes.length ? (
        <div className="pending-change-list">
          {summary.changes.map((change) => (
            <article className="pending-change-card" key={change.field}>
              <span className="muted">{change.label}</span>
              <div className="pending-change-values">
                <div className="pending-change-column">
                  <span className="muted">Atual</span>
                  <strong>{change.currentValue}</strong>
                </div>
                <div className="pending-change-arrow" aria-hidden="true">
                  {"->"}
                </div>
                <div className="pending-change-column">
                  <span className="muted">Solicitado</span>
                  <strong>{change.nextValue}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface-subtle">
          <span className="muted">
            Nenhum campo textual foi alterado. Esta revisao afeta apenas as fotos associadas ao
            ponto.
          </span>
        </div>
      )}

      {summary.pendingMedia.length ? (
        <div className="stack-md">
          <div className="point-meta">
            <span className="badge">{getMediaModeLabel(summary.pendingMediaMode)}</span>
          </div>
          <div className="review-media-columns">
            <div className="stack-sm">
              <h3 className="section-title">Fotos atuais</h3>
              {summary.currentMedia.length ? (
                <PhotoGrid media={summary.currentMedia} />
              ) : (
                <div className="surface-subtle">
                  <span className="muted">Este ponto nao possui fotos atuais.</span>
                </div>
              )}
            </div>
            <div className="stack-sm">
              <h3 className="section-title">Fotos pendentes</h3>
              <PhotoGrid media={summary.pendingMedia} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({
  label,
  multiline = false,
  value,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <article className="stat-card">
      <span className="muted">{label}</span>
      <strong className={multiline ? "pending-review-multiline" : undefined}>{value}</strong>
    </article>
  );
}

function PhotoGrid({ media }: { media: PointMediaRecord[] }) {
  return (
    <div className="point-photo-gallery">
      {media.map((item) => (
        <article className="point-photo-card" key={item.id}>
          {item.signed_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={item.caption || "Foto do ponto"}
              className="point-photo-thumb"
              loading="lazy"
              src={item.signed_url}
            />
          ) : (
            <div className="point-photo-thumb-placeholder">Imagem indisponivel</div>
          )}
          {item.caption ? <span className="muted">{item.caption}</span> : null}
          {item.signed_url ? (
            <div className="form-actions">
              <a
                className="button-ghost"
                download
                href={item.signed_url}
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
  );
}

function getMediaModeLabel(mode: PendingPointReviewSummary["pendingMediaMode"]) {
  if (mode === "append") {
    return "novas fotos serao adicionadas";
  }

  if (mode === "replace") {
    return "fotos atuais serao substituidas";
  }

  return "fotos pendentes para revisao";
}
