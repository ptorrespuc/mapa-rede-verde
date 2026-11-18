"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

import { PointForm } from "@/components/points/point-form";
import { apiClient } from "@/lib/api-client";
import {
  buildEditableGroups,
  buildPointFormInitialValues,
  submitPointUpdate,
} from "@/lib/point-update";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  PointDetailRecord,
  PointMediaRecord,
  PointRecord,
  SpeciesRecord,
} from "@/types/domain";

interface PointEditDrawerProps {
  pointId: string | null;
  submissionGroups: GroupRecord[];
  visibleGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  speciesAdminHref?: string;
  onClose: () => void;
  onSaved: (updatedPoint: PointRecord) => Promise<void> | void;
}

/**
 * Edicao do ponto sem sair do mapa: painel lateral no computador e gaveta que sobe de baixo
 * no celular. O mapa continua visivel (e na mesma posicao) atras do painel.
 */
export function PointEditDrawer({
  pointId,
  submissionGroups,
  visibleGroups,
  classifications,
  speciesCatalog,
  speciesAdminHref,
  onClose,
  onSaved,
}: PointEditDrawerProps) {
  const isOpen = Boolean(pointId);
  const drawerRef = useModalAccessibility<HTMLDivElement>(isOpen, onClose);
  const [point, setPoint] = useState<PointDetailRecord | null>(null);
  const [media, setMedia] = useState<PointMediaRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    setPoint(null);
    setMedia([]);
    setLoadError(null);

    if (!pointId) {
      return;
    }

    async function load(id: string) {
      try {
        const [detail, pointMedia] = await Promise.all([
          apiClient.getPoint(id),
          apiClient.getPointMedia(id).catch(() => [] as PointMediaRecord[]),
        ]);

        if (!ignore) {
          setPoint(detail);
          setMedia(pointMedia);
        }
      } catch (error) {
        if (!ignore) {
          setLoadError(
            error instanceof Error ? error.message : "Não foi possível carregar o ponto.",
          );
        }
      }
    }

    void load(pointId);

    return () => {
      ignore = true;
    };
  }, [pointId]);

  if (!pointId) {
    return null;
  }

  async function handleSubmit(payload: CreatePointPayload) {
    if (!point) {
      return;
    }

    // Erros sao exibidos pelo proprio formulario (ele captura a excecao).
    const updatedPoint = await submitPointUpdate(point.id, payload);
    await onSaved(updatedPoint);
  }

  const canManage = point?.viewer_can_manage ?? true;

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-labelledby="point-edit-drawer-title">
      <button
        aria-label="Fechar edição"
        className="drawer-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="drawer-card stack-md" ref={drawerRef} tabIndex={-1}>
        <div className="drawer-handle" aria-hidden="true" />
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <p className="eyebrow">{canManage ? "Editar ponto" : "Sugerir alteração"}</p>
              <h2 className="section-title" id="point-edit-drawer-title">
                {point?.title ?? "Carregando…"}
              </h2>
            </div>
            <button
              aria-label="Fechar edição"
              className="modal-close-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {point ? (
            <div className="drawer-header-links">
              <Link className="drawer-link" href={`/points/${point.id}`}>
                <ExternalLink aria-hidden="true" size={14} />
                Abrir página completa do ponto
              </Link>
            </div>
          ) : null}
        </div>

        {loadError ? <p className="error">{loadError}</p> : null}

        {point ? (
          <PointForm
            key={point.id}
            compactForMapFlow
            enableInitialPhotoUpload
            existingPointPhotos={media}
            groupLabel="Grupo de referência"
            groups={buildEditableGroups(point, submissionGroups, visibleGroups)}
            classifications={classifications}
            initialValues={buildPointFormInitialValues(point)}
            isEditing
            onCancel={onClose}
            onSubmit={handleSubmit}
            speciesAdminHref={speciesAdminHref}
            speciesCatalog={speciesCatalog}
            submitLabel={canManage ? "Salvar alterações" : "Enviar sugestão"}
          />
        ) : !loadError ? (
          <div className="drawer-loading" role="status">
            <span aria-hidden="true" className="map-spinner" />
            <span className="muted">Carregando dados do ponto…</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
