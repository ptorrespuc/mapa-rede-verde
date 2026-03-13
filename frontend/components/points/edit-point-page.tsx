"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DeletePointButton } from "@/components/points/delete-point-button";
import { PointForm } from "@/components/points/point-form";
import { apiClient } from "@/lib/api-client";
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
      const updatedPoint = await apiClient.updatePoint(point.id, {
        groupId: payload.groupId,
        classificationId: payload.classificationId,
        title: payload.title,
        speciesId: payload.speciesId?.trim() ? payload.speciesId : null,
        description: payload.description,
        isPublic: payload.isPublic,
        longitude: payload.longitude,
        latitude: payload.latitude,
        photos: payload.photos,
        photoUpdateMode: payload.photoUpdateMode,
        preservePreviousStateOnReclassification:
          payload.preservePreviousStateOnReclassification,
      });
      toast.success(
        updatedPoint.has_pending_update || updatedPoint.approval_status === "pending"
          ? "Alteracao enviada para aprovacao."
          : "Ponto atualizado com sucesso.",
      );
      router.push(`/points/${point.id}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel atualizar o ponto.";
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
            Atualize classificacao, coordenadas, visibilidade e demais dados operacionais.
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
          initialValues={{
            groupId: point.group_id,
            classificationId: point.classification_id,
            title: point.title,
            speciesId: point.species_id ?? undefined,
            description: point.description ?? undefined,
            isPublic: point.is_public,
            longitude: point.longitude,
            latitude: point.latitude,
          }}
          onCancel={() => router.push(`/points/${point.id}`)}
          onSubmit={handleSubmit}
          submitLabel="Salvar alteracoes"
          groupLabel="Grupo de referencia"
          enableInitialPhotoUpload
        />
      </section>

      {point.viewer_can_delete ? (
        <section className="panel stack-md">
          <div>
            <h2 className="section-title">Arquivar ponto</h2>
            <p className="subtitle">
              O ponto sai das listagens operacionais, mas o historico e as fotos permanecem
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
