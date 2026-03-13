"use client";

import { useState } from "react";

import { PointForm } from "@/components/points/point-form";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  PointMediaRecord,
  SpeciesRecord,
} from "@/types/domain";

const GROUPS: GroupRecord[] = [
  {
    id: "group-1",
    name: "Grupo de teste",
    code: "grupo-teste",
    is_public: true,
    accepts_point_collaboration: true,
    max_pending_points_per_collaborator: 5,
    logo_path: null,
    logo_url: null,
    my_role: "group_collaborator",
    created_at: "2026-03-11T00:00:00.000Z",
    viewer_can_manage: false,
    viewer_can_submit_points: true,
    viewer_can_approve_points: false,
  },
];

const CLASSIFICATIONS: PointClassificationRecord[] = [
  {
    id: "classification-1",
    slug: "arvore",
    name: "Arvore",
    requires_species: true,
    is_active: true,
    marker_color: "#3f7d58",
    created_at: "2026-03-11T00:00:00.000Z",
    updated_at: "2026-03-11T00:00:00.000Z",
    event_type_count: 0,
  },
];

const SPECIES: SpeciesRecord[] = [
  {
    id: "species-1",
    common_name: "Oiti",
    scientific_name: "Licania tomentosa",
    origin: "native",
    display_name: "Oiti (Licania tomentosa)",
    is_active: true,
    created_at: "2026-03-11T00:00:00.000Z",
    updated_at: "2026-03-11T00:00:00.000Z",
  },
];

const CURRENT_POINT_PHOTOS: PointMediaRecord[] = [
  {
    id: "current-photo-1",
    point_id: "point-1",
    point_event_id: null,
    file_url: "point-1/pending/foto-atual-aprovada.jpg",
    caption: "Foto atual aprovada",
    created_at: "2026-03-11T00:00:00.000Z",
    signed_url:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnQ7xQAAAAASUVORK5CYII=",
  },
];

export function PointEditFormHarness() {
  const [lastPayload, setLastPayload] = useState<CreatePointPayload | null>(null);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Harness</p>
          <h1>Formulario de edicao do ponto</h1>
          <p className="subtitle">
            Ambiente isolado para validar fotos atuais, limite de novas fotos e fluxo do
            colaborador.
          </p>
        </div>
      </div>

      <section className="panel stack-md">
        <PointForm
          classifications={CLASSIFICATIONS}
          enableInitialPhotoUpload
          existingPointPhotos={CURRENT_POINT_PHOTOS}
          groups={GROUPS}
          isEditing
          initialValues={{
            groupId: "group-1",
            classificationId: "classification-1",
            title: "Ponto com foto atual",
            speciesId: "species-1",
            isPublic: true,
            latitude: -22.9285,
            longitude: -43.1729,
          }}
          onSubmit={(payload) => {
            setLastPayload(payload);
          }}
          speciesCatalog={SPECIES}
          submitLabel="Salvar alteracoes"
        />
      </section>

      {lastPayload ? (
        <section className="panel stack-sm">
          <h2 className="section-title">Ultimo payload enviado</h2>
          <pre>{JSON.stringify(lastPayload, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
}
