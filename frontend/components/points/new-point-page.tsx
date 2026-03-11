"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PointForm } from "@/components/points/point-form";
import { apiClient } from "@/lib/api-client";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  SpeciesRecord,
} from "@/types/domain";

interface NewPointPageProps {
  groups: GroupRecord[];
  initialGroup?: GroupRecord | null;
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  speciesAdminHref?: string;
}

export function NewPointPage({
  groups,
  initialGroup,
  classifications,
  speciesCatalog,
  speciesAdminHref,
}: NewPointPageProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(payload: CreatePointPayload) {
    setErrorMessage(null);

    try {
      const point = await apiClient.createPoint(payload);
      toast.success(
        point.approval_status === "pending"
          ? "Ponto enviado para aprovacao."
          : "Ponto criado com sucesso.",
      );
      router.push(`/points/${point.id}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel criar o ponto.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  if (!groups.length) {
    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Novo ponto</p>
            <h1>Sem grupos gerenciaveis</h1>
            <p className="subtitle">
              Para criar pontos, seu usuario precisa estar associado a pelo menos um grupo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!classifications.length) {
    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Novo ponto</p>
            <h1>Sem classificacoes cadastradas</h1>
            <p className="subtitle">
              O superusuario precisa cadastrar ao menos uma classificacao antes de criar pontos.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Novo ponto</p>
          <h1>Registrar ponto no mapa</h1>
          <p className="subtitle">
            Use este formulario quando quiser criar um ponto fora do fluxo do mapa.
          </p>
        </div>
      </div>

      <section className="panel stack-md">
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        <PointForm
          enableInitialPhotoUpload
          groups={groups}
          classifications={classifications}
          speciesCatalog={speciesCatalog}
          speciesAdminHref={speciesAdminHref}
          initialValues={{
            groupId: initialGroup?.id ?? groups[0]?.id,
            classificationId: classifications[0]?.id,
          }}
          onSubmit={handleSubmit}
          submitLabel="Criar ponto"
        />
      </section>
    </section>
  );
}
