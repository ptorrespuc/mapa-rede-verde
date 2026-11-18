"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DeletePointButton } from "@/components/points/delete-point-button";
import { PointForm } from "@/components/points/point-form";
import { storeFlashFeedback } from "@/lib/flash-feedback";
import { getLastMapHref } from "@/lib/map-view-state";
import {
  buildPointFormInitialValues,
  describePointUpdate,
  submitPointUpdate,
} from "@/lib/point-update";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  PointDetailRecord,
  PointMediaRecord,
  SpeciesRecord,
} from "@/types/domain";

interface EditPointPageProps {
  point: PointDetailRecord;
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  pointMedia: PointMediaRecord[];
  speciesCatalog: SpeciesRecord[];
  speciesAdminHref?: string;
}

export function EditPointPage({
  point,
  groups,
  classifications,
  pointMedia,
  speciesCatalog,
  speciesAdminHref,
}: EditPointPageProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(payload: CreatePointPayload) {
    setErrorMessage(null);

    try {
      const updatedPoint = await submitPointUpdate(point.id, payload);
      const outcome = describePointUpdate(updatedPoint);
      storeFlashFeedback({
        scope: `/points/${point.id}`,
        title: outcome.title,
        message: outcome.message,
        actionHref: getLastMapHref(point.id),
        actionLabel: "Voltar ao mapa",
      });
      toast.success(outcome.toast);
      router.push(`/points/${point.id}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar o ponto.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Editar ponto</p>
          <h1>{point.title}</h1>
          <p className="subtitle">
            Atualize classificação, coordenadas, visibilidade e demais dados operacionais.
          </p>
        </div>
      </div>

      <section className="panel stack-md">
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        <PointForm
          groups={groups}
          classifications={classifications}
          existingPointPhotos={pointMedia}
          isEditing
          speciesCatalog={speciesCatalog}
          speciesAdminHref={speciesAdminHref}
          initialValues={buildPointFormInitialValues(point)}
          onCancel={() => router.push(`/points/${point.id}`)}
          onSubmit={handleSubmit}
          submitLabel="Salvar alterações"
          groupLabel="Grupo de referência"
          enableInitialPhotoUpload
        />
      </section>

      {point.viewer_can_delete ? (
        <section className="panel stack-md">
          <div>
            <h2 className="section-title">Arquivar ponto</h2>
            <p className="subtitle">
              O ponto sai das listagens operacionais, mas o histórico e as fotos permanecem
              preservados.
            </p>
          </div>
          <div className="button-row">
            <DeletePointButton pointId={point.id} initialLabel="Arquivar ponto" />
          </div>
        </section>
      ) : null}
    </section>
  );
}
