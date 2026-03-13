"use client";

import Link from "next/link";
import { Camera, Crosshair, MapPinned, PencilLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PointCoordinatePickerModal } from "@/components/points/point-coordinate-picker-modal";
import {
  formatProcessedImageLabel,
  processImageForUpload,
} from "@/lib/image-processing";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  PointMediaRecord,
  PointPhotoUpdateMode,
  SpeciesRecord,
} from "@/types/domain";

interface PointFormProps {
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  existingPointPhotos?: PointMediaRecord[];
  isEditing?: boolean;
  speciesAdminHref?: string;
  initialValues?: Partial<CreatePointPayload>;
  onSubmit: (payload: CreatePointPayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  groupLabel?: string;
  enableInitialPhotoUpload?: boolean;
  compactForMapFlow?: boolean;
}

interface PointFormState {
  groupId: string;
  classificationId: string;
  title: string;
  speciesId: string;
  description: string;
  isPublic: boolean;
  longitude: string;
  latitude: string;
}

interface PointPhotoDraft {
  id: string;
  file: File;
  caption: string;
  previewUrl: string;
  width: number;
  height: number;
  wasResized: boolean;
}

const MAX_POINT_PHOTOS = 3;
const EMPTY_POINT_PHOTOS: PointMediaRecord[] = [];

function getDefaultPointPhotoUpdateMode(existingPointPhotos: PointMediaRecord[]) {
  return existingPointPhotos.length < MAX_POINT_PHOTOS ? "append" : "replace";
}

function buildState(
  groups: GroupRecord[],
  classifications: PointClassificationRecord[],
  values?: Partial<CreatePointPayload>,
): PointFormState {
  const initialGroup = groups.find((group) => group.id === values?.groupId) ?? groups[0];
  const initialClassification =
    classifications.find((classification) => classification.id === values?.classificationId) ??
    classifications[0];
  const canBePublic = initialGroup?.is_public ?? false;

  return {
    groupId: values?.groupId ?? initialGroup?.id ?? "",
    classificationId: values?.classificationId ?? initialClassification?.id ?? "",
    title: values?.title ?? "",
    speciesId: values?.speciesId ?? "",
    description: values?.description ?? "",
    isPublic: canBePublic ? (values?.isPublic ?? true) : false,
    longitude: values?.longitude?.toString() ?? "",
    latitude: values?.latitude?.toString() ?? "",
  };
}

export function PointForm({
  groups,
  classifications,
  speciesCatalog,
  existingPointPhotos = EMPTY_POINT_PHOTOS,
  isEditing = false,
  speciesAdminHref,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Salvar ponto",
  groupLabel = "Grupo",
  enableInitialPhotoUpload = false,
  compactForMapFlow = false,
}: PointFormProps) {
  const defaults = useMemo(
    () => buildState(groups, classifications, initialValues),
    [groups, classifications, initialValues],
  );
  const [formState, setFormState] = useState<PointFormState>(defaults);
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [pointPhotoDrafts, setPointPhotoDrafts] = useState<PointPhotoDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [showCoordinateEditor, setShowCoordinateEditor] = useState(
    !Boolean(defaults.longitude && defaults.latitude),
  );
  const [showCoordinatePickerModal, setShowCoordinatePickerModal] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);
  const [preservePreviousStateOnReclassification, setPreservePreviousStateOnReclassification] =
    useState(true);
  const [photoUpdateMode, setPhotoUpdateMode] = useState<PointPhotoUpdateMode>(() =>
    getDefaultPointPhotoUpdateMode(existingPointPhotos),
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pointPhotoDraftsRef = useRef<PointPhotoDraft[]>([]);

  useEffect(() => {
    pointPhotoDraftsRef.current = pointPhotoDrafts;
  }, [pointPhotoDrafts]);

  useEffect(() => {
    return () => {
      pointPhotoDraftsRef.current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    setFormState(defaults);
    clearDraftPointPhotos();
    setShowCoordinateEditor(!(defaults.longitude && defaults.latitude));
    setShowCoordinatePickerModal(false);
    setShowPhotoUploader(false);
    setPreservePreviousStateOnReclassification(true);
    setPhotoUpdateMode(getDefaultPointPhotoUpdateMode(existingPointPhotos));
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }, [defaults, existingPointPhotos]);

  useEffect(() => {
    const selectedSpecies = speciesCatalog.find((species) => species.id === defaults.speciesId);
    setSpeciesSearch(selectedSpecies?.display_name ?? "");
  }, [defaults.speciesId, speciesCatalog]);

  const selectedGroup = groups.find((group) => group.id === formState.groupId) ?? null;
  const selectedClassification =
    classifications.find((classification) => classification.id === formState.classificationId) ??
    null;
  const showGroupSelector = groups.length > 1;
  const pointCanBePublic = selectedGroup?.is_public ?? false;
  const canConfigurePointState = selectedGroup?.viewer_can_manage ?? false;
  const canAutoApprovePoint = selectedGroup?.viewer_can_approve_points ?? false;
  const requiresSpecies = selectedClassification?.requires_species ?? false;
  const hasCoordinates = Boolean(formState.longitude.trim() && formState.latitude.trim());
  const isEditingExistingPoint = isEditing;
  const isReclassificationChange =
    isEditing &&
    Boolean(initialValues?.classificationId) &&
    initialValues?.classificationId !== formState.classificationId;
  const maxDraftPointPhotos =
    isEditingExistingPoint && photoUpdateMode === "append"
      ? Math.max(0, MAX_POINT_PHOTOS - existingPointPhotos.length)
      : MAX_POINT_PHOTOS;
  const canAppendPointPhotos =
    existingPointPhotos.length > 0 && existingPointPhotos.length < MAX_POINT_PHOTOS;
  const willReplaceCurrentPointPhotos =
    isEditingExistingPoint && existingPointPhotos.length > 0 && photoUpdateMode === "replace";
  const filteredSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();

    if (!query) {
      return speciesCatalog;
    }

    return speciesCatalog.filter((species) =>
      [species.display_name, species.common_name, species.scientific_name].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [speciesCatalog, speciesSearch]);

  const selectedSpecies =
    speciesCatalog.find((species) => species.id === formState.speciesId) ?? null;
  const speciesAdminLink = useMemo(() => {
    if (!speciesAdminHref) {
      return undefined;
    }

    if (!speciesSearch.trim()) {
      return speciesAdminHref;
    }

    const separator = speciesAdminHref.includes("?") ? "&" : "?";
    return `${speciesAdminHref}${separator}commonName=${encodeURIComponent(speciesSearch.trim())}`;
  }, [speciesAdminHref, speciesSearch]);
  const coordinatePickerInitialCoordinates = useMemo(() => {
    const latitude = Number(formState.latitude);
    const longitude = Number(formState.longitude);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    return { latitude, longitude };
  }, [formState.latitude, formState.longitude]);

  useEffect(() => {
    if (!pointCanBePublic && formState.isPublic) {
      setFormState((current) => ({ ...current, isPublic: false }));
    }
  }, [pointCanBePublic, formState.isPublic]);

  useEffect(() => {
    if (canConfigurePointState) {
      return;
    }

    setFormState((current) => {
      const nextIsPublic = selectedGroup?.is_public ?? false;

      if (current.isPublic === nextIsPublic) {
        return current;
      }

      return {
        ...current,
        isPublic: nextIsPublic,
      };
    });
  }, [canConfigurePointState, selectedGroup?.is_public]);

  useEffect(() => {
    if (!requiresSpecies && formState.speciesId) {
      setFormState((current) => ({ ...current, speciesId: "" }));
    }
  }, [requiresSpecies, formState.speciesId]);

  useEffect(() => {
    if (!requiresSpecies && speciesSearch) {
      setSpeciesSearch("");
    }
  }, [requiresSpecies, speciesSearch]);

  useEffect(() => {
    if (!requiresSpecies) {
      return;
    }

    const query = speciesSearch.trim().toLowerCase();

    if (!query) {
      return;
    }

    const exactMatch = speciesCatalog.find((species) =>
      [species.display_name, species.common_name, species.scientific_name].some(
        (value) => value.trim().toLowerCase() === query,
      ),
    );

    if (!exactMatch || exactMatch.id === formState.speciesId) {
      return;
    }

    setFormState((current) => ({
      ...current,
      speciesId: exactMatch.id,
      title: current.title.trim() ? current.title : exactMatch.common_name,
    }));
  }, [formState.speciesId, requiresSpecies, speciesCatalog, speciesSearch]);

  function setField<Key extends keyof PointFormState>(key: Key, value: PointFormState[Key]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function applyCoordinatesFromMap(coordinates: { latitude: number; longitude: number }) {
    setFormState((current) => ({
      ...current,
      latitude: coordinates.latitude.toString(),
      longitude: coordinates.longitude.toString(),
    }));
    setShowCoordinatePickerModal(false);
    setShowCoordinateEditor(false);
  }

  async function handlePointPhotosSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (!selectedFiles.length) {
      return;
    }

    setErrorMessage(null);
    setIsPreparingPhoto(true);

    const nextPhotos: PointPhotoDraft[] = [];

    try {
      for (const file of selectedFiles) {
        if (!file.type.startsWith("image/")) {
          setErrorMessage("Somente imagens sao permitidas para o ponto.");
          continue;
        }

        try {
          const processedPhoto = await processImageForUpload(file);

          nextPhotos.push({
            id: crypto.randomUUID(),
            file: processedPhoto.file,
            caption: "",
            previewUrl: processedPhoto.previewUrl,
            width: processedPhoto.width,
            height: processedPhoto.height,
            wasResized: processedPhoto.wasResized,
          });
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Nao foi possivel preparar uma das fotos do ponto.",
          );
        }
      }

      setPointPhotoDrafts((current) => {
        const merged = [...current, ...nextPhotos].slice(0, maxDraftPointPhotos);

        if (current.length + nextPhotos.length > maxDraftPointPhotos) {
          setErrorMessage(
            photoUpdateMode === "append"
              ? `Com as fotos atuais, voce pode adicionar no maximo ${maxDraftPointPhotos} nova(s) foto(s).`
              : `Use no maximo ${MAX_POINT_PHOTOS} fotos por ponto.`,
          );
        }

        [...current, ...nextPhotos]
          .filter((photo) => !merged.some((item) => item.id === photo.id))
          .forEach((photo) => {
            URL.revokeObjectURL(photo.previewUrl);
          });

        return merged;
      });

      event.target.value = "";
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  function updatePointPhotoCaption(photoId: string, caption: string) {
    setPointPhotoDrafts((current) =>
      current.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
    );
  }

  function removePointPhoto(photoId: string) {
    setPointPhotoDrafts((current) => {
      const photoToRemove = current.find((photo) => photo.id === photoId);

      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.previewUrl);
      }

      return current.filter((photo) => photo.id !== photoId);
    });
  }

  function clearDraftPointPhotos() {
    setPointPhotoDrafts((current) => {
      current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
      return [];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const longitude = Number(formState.longitude);
    const latitude = Number(formState.latitude);

    if (
      !formState.groupId ||
      !formState.classificationId ||
      Number.isNaN(longitude) ||
      Number.isNaN(latitude)
    ) {
      setErrorMessage("Grupo, classificacao, longitude e latitude sao obrigatorios.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        groupId: formState.groupId,
        classificationId: formState.classificationId,
        title: formState.title.trim(),
        speciesId: requiresSpecies ? formState.speciesId : undefined,
        description: formState.description.trim(),
        isPublic: canConfigurePointState
          ? pointCanBePublic
            ? formState.isPublic
            : false
          : pointCanBePublic,
        longitude,
        latitude,
        photos: pointPhotoDrafts.length
          ? pointPhotoDrafts.map((photo) => ({
              file: photo.file,
              caption: photo.caption.trim() || undefined,
            }))
          : undefined,
        photoUpdateMode: isEditingExistingPoint ? photoUpdateMode : undefined,
        preservePreviousStateOnReclassification:
          isEditingExistingPoint && isReclassificationChange
            ? preservePreviousStateOnReclassification
            : undefined,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o ponto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <section className="form-section stack-md">
        <div className="form-section-header">
          <div className="stack-xs">
            <h3 className="form-section-title">Dados principais</h3>
            <p className="muted">
              Defina o grupo, a classificacao e as informacoes basicas do ponto.
            </p>
          </div>
        </div>

        <div className="input-grid two">
          <div className="field">
            <label htmlFor="point-group">{groupLabel}</label>
            {showGroupSelector ? (
              <select
                id="point-group"
                value={formState.groupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  const nextGroup = groups.find((group) => group.id === nextGroupId) ?? null;

                  setFormState((current) => ({
                    ...current,
                    groupId: nextGroupId,
                    isPublic: nextGroup?.is_public ?? false,
                  }));
                }}
                required
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.is_public ? "publico" : "privado"})
                  </option>
                ))}
              </select>
            ) : (
              <div className="surface-subtle stack-xs">
                <strong>{selectedGroup?.name ?? "Grupo selecionado"}</strong>
                {selectedGroup?.code ? (
                  <span className="muted">Codigo: {selectedGroup.code}</span>
                ) : null}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="point-classification">Classificacao do ponto</label>
            <select
              id="point-classification"
              value={formState.classificationId}
              onChange={(event) => setField("classificationId", event.target.value)}
              required
            >
              {classifications.map((classification) => (
                <option key={classification.id} value={classification.id}>
                  {classification.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isEditingExistingPoint && isReclassificationChange ? (
          <div className="surface-subtle stack-sm">
            <strong>Reclassificacao em andamento</strong>
            <label className="inline-toggle">
              <input
                checked={preservePreviousStateOnReclassification}
                onChange={(event) =>
                  setPreservePreviousStateOnReclassification(event.target.checked)
                }
                type="checkbox"
              />
              Guardar o estado anterior na linha do tempo
            </label>
            <span className="muted">
              Se marcado, a timeline guarda o titulo, a especie, a descricao, a posicao do mapa
              e as fotos atuais do estado anterior quando a reclassificacao for concluida.
            </span>
          </div>
        ) : null}

        {requiresSpecies ? (
          <div className="field">
            <label htmlFor="point-species">Especie</label>
            <input
              id="point-species-search"
              autoComplete="off"
              value={speciesSearch}
              onChange={(event) => setSpeciesSearch(event.target.value)}
              placeholder="Buscar por nome popular ou cientifico"
            />
            <select
              id="point-species"
              value={formState.speciesId}
              onChange={(event) => {
                const nextSpeciesId = event.target.value;
                const nextSpecies = speciesCatalog.find((species) => species.id === nextSpeciesId);
                if (nextSpecies) {
                  setSpeciesSearch(nextSpecies.display_name);
                  setFormState((current) => ({
                    ...current,
                    speciesId: nextSpeciesId,
                    title: current.title.trim() ? current.title : nextSpecies.common_name,
                  }));
                  return;
                }
                setField("speciesId", nextSpeciesId);
              }}
              disabled={!speciesCatalog.length}
            >
              <option value="">Selecione uma especie</option>
              {filteredSpecies.map((species) => (
                <option key={species.id} value={species.id}>
                  {species.display_name} {species.origin === "exotic" ? "- exotica" : "- nativa"}
                </option>
              ))}
            </select>
            <span className="hint">
              Esta classificacao usa o catalogo de especies. Vincular uma especie ao ponto e
              opcional.
            </span>
            {!filteredSpecies.length ? (
              <div className="surface-subtle stack-xs">
                <span className="muted">Nenhuma especie encontrada para esta busca.</span>
                {speciesAdminLink ? (
                  <Link className="button-ghost" href={speciesAdminLink} rel="noreferrer" target="_blank">
                    Cadastrar nova especie
                  </Link>
                ) : (
                  <span className="muted">
                    Solicite ao superusuario o cadastro de uma nova especie.
                  </span>
                )}
              </div>
            ) : null}
            {filteredSpecies.length > 0 && speciesAdminLink ? (
              <div className="form-actions">
                <Link className="button-ghost" href={speciesAdminLink} rel="noreferrer" target="_blank">
                  Cadastrar nova especie
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="point-title">Titulo</label>
          <input
            id="point-title"
            value={formState.title}
            onChange={(event) => setField("title", event.target.value)}
            placeholder={
              selectedSpecies?.common_name || "Arvore jovem proxima ao portao principal"
            }
            required
          />
        </div>

        <div className="field">
          <label htmlFor="point-description">Descricao</label>
          <textarea
            id="point-description"
            value={formState.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder="Problema encontrado, contexto do plantio ou observacoes de campo."
          />
        </div>
      </section>

      <section className="form-section stack-md">
        <div className="form-section-header">
          <div className="stack-xs">
            <h3 className="form-section-title">Localizacao</h3>
            <p className="muted">
              A posicao do ponto pode vir direto do mapa e so precisa de ajuste se necessario.
            </p>
          </div>
        </div>

        {hasCoordinates && !showCoordinateEditor ? (
          <div className="surface-subtle form-toggle-card">
            <div className="stack-xs">
              <strong>Posicao definida no mapa</strong>
              <span className="muted">
                Latitude {Number(formState.latitude).toFixed(6)} | Longitude{" "}
                {Number(formState.longitude).toFixed(6)}
              </span>
            </div>
            <div className="button-row">
              {isEditingExistingPoint ? (
                <button
                  className="button-ghost button-inline-ghost"
                  onClick={() => setShowCoordinatePickerModal(true)}
                  type="button"
                >
                  <MapPinned aria-hidden="true" size={15} />
                  Buscar no mapa
                </button>
              ) : null}
              <button
                className="button-ghost button-inline-ghost"
                onClick={() => setShowCoordinateEditor(true)}
                type="button"
              >
                <PencilLine aria-hidden="true" size={15} />
                Ajustar coordenadas
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="input-grid two">
              <div className="field">
                <label htmlFor="point-longitude">Longitude</label>
                <input
                  id="point-longitude"
                  type="number"
                  step="any"
                  value={formState.longitude}
                  onChange={(event) => setField("longitude", event.target.value)}
                  required
                />
                <span className="hint">Use as coordenadas do mapa ou ajuste manualmente.</span>
              </div>

              <div className="field">
                <label htmlFor="point-latitude">Latitude</label>
                <input
                  id="point-latitude"
                  type="number"
                  step="any"
                  value={formState.latitude}
                  onChange={(event) => setField("latitude", event.target.value)}
                  required
                />
                <span className="hint">Valores em graus decimais, no padrao WGS84.</span>
              </div>
            </div>

            {hasCoordinates || isEditingExistingPoint ? (
              <div className="form-actions">
                {isEditingExistingPoint ? (
                  <button
                    className="button-ghost button-inline-ghost"
                    onClick={() => setShowCoordinatePickerModal(true)}
                    type="button"
                  >
                    <MapPinned aria-hidden="true" size={15} />
                    Buscar no mapa
                  </button>
                ) : null}
                <button
                  className="button-ghost button-inline-ghost"
                  onClick={() => setShowCoordinateEditor(false)}
                  type="button"
                  disabled={!hasCoordinates}
                >
                  <Crosshair aria-hidden="true" size={15} />
                  Manter so a posicao do mapa
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {enableInitialPhotoUpload ? (
        <section className="form-section stack-md">
          <div className="form-section-header">
            <div className="stack-xs">
              <h3 className="form-section-title">
                {isEditingExistingPoint ? "Fotos do ponto" : "Fotos iniciais"}
              </h3>
              <p className="muted">
                {isEditingExistingPoint
                  ? "Defina se as novas fotos entram junto das atuais ou se substituem o conjunto atual."
                  : "Opcional. Voce pode anexar ate 3 fotos ja no momento do cadastro."}
              </p>
            </div>
          </div>

          {isEditingExistingPoint && existingPointPhotos.length ? (
            <div className="stack-sm">
              <strong>Fotos atuais</strong>
              <div className="point-photo-gallery">
                {existingPointPhotos.map((photo) => (
                  <article className="point-photo-card" key={photo.id}>
                    {photo.signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={photo.caption || `Foto atual de ${formState.title || "ponto"}`}
                        className="point-photo-thumb"
                        src={photo.signed_url}
                      />
                    ) : (
                      <div className="point-photo-thumb-placeholder">Imagem indisponivel</div>
                    )}
                    {photo.caption ? <span className="muted">{photo.caption}</span> : null}
                    {photo.signed_url ? (
                      <div className="form-actions">
                        <a className="button-ghost" download href={photo.signed_url}>
                          Baixar imagem
                        </a>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {!pointPhotoDrafts.length ? (
                <span className="hint">
                  Se voce nao enviar novas fotos, essas imagens continuam como estado atual do ponto.
                </span>
              ) : (
                <div className="surface-subtle">
                  <span className="muted">
                    {willReplaceCurrentPointPhotos
                      ? "As novas fotos abaixo substituem as fotos atuais quando o salvamento for concluido."
                      : "As novas fotos abaixo serao adicionadas ao conjunto atual, respeitando o limite total de 3 imagens."}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {isEditingExistingPoint && existingPointPhotos.length ? (
            <div className="input-grid two">
              <label className="inline-toggle">
                <input
                  checked={photoUpdateMode === "append"}
                  disabled={!canAppendPointPhotos}
                  name="point-photo-update-mode"
                  onChange={() => {
                    clearDraftPointPhotos();
                    setShowPhotoUploader(false);
                    setPhotoUpdateMode("append");
                    if (photoInputRef.current) {
                      photoInputRef.current.value = "";
                    }
                  }}
                  type="radio"
                />
                <span>
                  Adicionar novas fotos
                  <br />
                  <small className="muted">
                    {canAppendPointPhotos
                      ? `Voce ainda pode adicionar ${MAX_POINT_PHOTOS - existingPointPhotos.length} foto(s).`
                      : "O ponto ja esta no limite de 3 fotos."}
                  </small>
                </span>
              </label>
              <label className="inline-toggle">
                <input
                  checked={photoUpdateMode === "replace"}
                  name="point-photo-update-mode"
                  onChange={() => {
                    clearDraftPointPhotos();
                    setShowPhotoUploader(false);
                    setPhotoUpdateMode("replace");
                    if (photoInputRef.current) {
                      photoInputRef.current.value = "";
                    }
                  }}
                  type="radio"
                />
                <span>
                  Substituir fotos atuais
                  <br />
                  <small className="muted">
                    Remove o conjunto atual e permite enviar ate 3 novas fotos.
                  </small>
                </span>
              </label>
            </div>
          ) : null}

          {!showPhotoUploader && !pointPhotoDrafts.length ? (
            <div className="surface-subtle form-toggle-card">
              <span className="muted">
                {isEditingExistingPoint
                  ? photoUpdateMode === "append"
                    ? maxDraftPointPhotos > 0
                      ? `Se quiser mostrar o novo estado do ponto, adicione ate ${maxDraftPointPhotos} nova(s) foto(s).`
                      : "O ponto ja atingiu o limite de 3 fotos. Troque para substituicao se quiser enviar novas imagens."
                    : "Se quiser mostrar o novo estado do ponto, envie ate 3 fotos para substituir o conjunto atual."
                  : "Se quiser, adicione ate 3 fotos do ponto. Cada imagem sera salva com ate 2 MP."}
              </span>
              <button
                className="button-ghost button-inline-ghost"
                disabled={isEditingExistingPoint && photoUpdateMode === "append" && maxDraftPointPhotos === 0}
                onClick={() => setShowPhotoUploader(true)}
                type="button"
              >
                <Camera aria-hidden="true" size={15} />
                {isEditingExistingPoint
                  ? photoUpdateMode === "append"
                    ? "Adicionar fotos"
                    : "Substituir fotos"
                  : "Adicionar fotos"}
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="point-photo">Selecionar imagens</label>
                <input
                  id="point-photo"
                  ref={photoInputRef}
                  accept="image/*"
                  className="file-input"
                  multiple
                  onChange={(event) => void handlePointPhotosSelected(event)}
                  type="file"
                />
                <span className="hint">
                  {isEditingExistingPoint && photoUpdateMode === "append"
                    ? `Voce pode adicionar ate ${maxDraftPointPhotos} foto(s) nova(s) mantendo o limite total de ${MAX_POINT_PHOTOS}.`
                    : `Ate ${MAX_POINT_PHOTOS} fotos por ponto.`}{" "}
                  Cada imagem e tratada para no maximo 2 MP.
                </span>
              </div>

              {isPreparingPhoto ? (
                <div className="surface-subtle">
                  <span className="muted">Preparando imagens para upload...</span>
                </div>
              ) : null}

              {pointPhotoDrafts.length ? (
                <div className="media-upload-list">
                  {pointPhotoDrafts.map((photo) => (
                    <div className="media-upload-card" key={photo.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={photo.caption || `Foto do ponto ${formState.title || "novo ponto"}`}
                        className="media-upload-preview"
                        src={photo.previewUrl}
                      />
                      <div className="stack-sm">
                        <div className="stack-xs">
                          <strong>{photo.file.name}</strong>
                          <span className="muted">
                            {formatProcessedImageLabel(photo.width, photo.height)} |{" "}
                            {(photo.file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <span className="muted">
                            {photo.wasResized
                              ? "Imagem tratada para o limite de 2 MP."
                              : "Imagem mantida dentro do limite de 2 MP."}
                          </span>
                        </div>
                        <div className="field">
                          <label htmlFor={`point-photo-caption-${photo.id}`}>Legenda da foto</label>
                          <input
                            id={`point-photo-caption-${photo.id}`}
                            onChange={(event) =>
                              updatePointPhotoCaption(photo.id, event.target.value)
                            }
                            placeholder="Ex.: estado atual do ponto"
                            value={photo.caption}
                          />
                        </div>
                        <div className="form-actions">
                          <a
                            className="button-ghost"
                            download={photo.file.name}
                            href={photo.previewUrl}
                          >
                            Baixar imagem
                          </a>
                          <button
                            className="button-ghost"
                            onClick={() => removePointPhoto(photo.id)}
                            type="button"
                          >
                            Remover foto
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="form-actions">
                  <button
                    className="button-ghost button-inline-ghost"
                    onClick={() => setShowPhotoUploader(false)}
                    type="button"
                  >
                    {isEditingExistingPoint
                      ? photoUpdateMode === "replace"
                        ? "Manter fotos atuais"
                        : "Nao adicionar novas fotos agora"
                      : "Nao adicionar foto agora"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {canConfigurePointState ? (
        <section className="form-section stack-md">
          <div className="form-section-header">
            <div className="stack-xs">
              <h3 className="form-section-title">Configuracoes do ponto</h3>
              <p className="muted">Ajustes visiveis apenas para quem pode gerenciar o grupo.</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="point-visibility">Visibilidade</label>
            <select
              id="point-visibility"
              value={formState.isPublic ? "public" : "private"}
              onChange={(event) => setField("isPublic", event.target.value === "public")}
              disabled={!pointCanBePublic}
            >
              <option value="private">Privado</option>
              <option value="public">Publico</option>
            </select>
            {!pointCanBePublic ? (
              <span className="hint">Grupos privados sempre produzem pontos privados.</span>
            ) : null}
          </div>
        </section>
      ) : !compactForMapFlow ? (
        <div className="surface-subtle">
          <span className="muted">
            {canAutoApprovePoint
              ? "Como voce pode aprovar pontos neste grupo, o registro sera salvo como ativo automaticamente."
              : "Pontos enviados em colaboracao ficam pendentes ate revisao e seguem a visibilidade padrao do grupo."}
          </span>
        </div>
      ) : null}

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="form-actions">
        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Salvando..." : submitLabel}
        </button>
        {onCancel ? (
          <button className="button-ghost" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
      </div>

      {isEditingExistingPoint ? (
        <PointCoordinatePickerModal
          initialCoordinates={coordinatePickerInitialCoordinates}
          isOpen={showCoordinatePickerModal}
          onClose={() => setShowCoordinatePickerModal(false)}
          onConfirm={applyCoordinatesFromMap}
        />
      ) : null}
    </form>
  );
}
