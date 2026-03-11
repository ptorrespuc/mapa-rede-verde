"use client";

import { Crosshair, MapPin, X } from "lucide-react";

import { PointForm } from "@/components/points/point-form";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  SpeciesRecord,
} from "@/types/domain";

interface PointCreationModalProps {
  isOpen: boolean;
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  speciesAdminHref?: string;
  initialValues?: Partial<CreatePointPayload>;
  onClose: () => void;
  onCreate: (payload: CreatePointPayload) => Promise<void> | void;
}

export function PointCreationModal({
  isOpen,
  groups,
  classifications,
  speciesCatalog,
  speciesAdminHref,
  initialValues,
  onClose,
  onCreate,
}: PointCreationModalProps) {
  if (!isOpen) {
    return null;
  }

  const hasCoordinates =
    typeof initialValues?.latitude === "number" && typeof initialValues?.longitude === "number";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card stack-md">
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <p className="eyebrow">Novo ponto</p>
              <h2 className="section-title">Registrar ponto georreferenciado</h2>
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
          <p className="subtitle">
            Escolha o tipo, descreva o ponto e envie o registro do local selecionado no mapa.
          </p>
          <div className="modal-inline-badges">
            <span className="badge badge-with-icon">
              <MapPin aria-hidden="true" size={14} />
              Novo ponto
            </span>
            {hasCoordinates ? (
              <span className="badge badge-with-icon">
                <Crosshair aria-hidden="true" size={14} />
                Posicao capturada no mapa
              </span>
            ) : null}
          </div>
        </div>

        <PointForm
          compactForMapFlow
          enableInitialPhotoUpload
          groups={groups}
          classifications={classifications}
          speciesCatalog={speciesCatalog}
          speciesAdminHref={speciesAdminHref}
          initialValues={initialValues}
          onCancel={onClose}
          onSubmit={onCreate}
          submitLabel="Criar ponto"
        />
      </div>
    </div>
  );
}
