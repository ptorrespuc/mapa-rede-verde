"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import {
  formatProcessedImageLabel,
  processImageForUpload,
} from "@/lib/image-processing";
import type {
  PointEventPhotoInput,
  PointEventRecord,
  PointEventTypeRecord,
} from "@/types/domain";

interface PointTimelineProps {
  pointId: string;
  eventTypeOptions: PointEventTypeRecord[];
  initialEvents: PointEventRecord[];
  canManage: boolean;
}

interface TimelinePhotoDraft {
  id: string;
  file: File;
  caption: string;
  previewUrl: string;
  width: number;
  height: number;
  wasResized: boolean;
}

const MAX_TIMELINE_FILES = 6;
const MAX_TIMELINE_FILE_SIZE = 10 * 1024 * 1024;

function getDefaultEventDateValue() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export function PointTimeline({
  pointId,
  eventTypeOptions,
  initialEvents,
  canManage,
}: PointTimelineProps) {
  const [events, setEvents] = useState(initialEvents);
  const [pointEventTypeId, setPointEventTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(() => getDefaultEventDateValue());
  const [photos, setPhotos] = useState<TimelinePhotoDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const [isDeletingEventId, setIsDeletingEventId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const photosRef = useRef<TimelinePhotoDraft[]>([]);
  const hasConfiguredEventTypes = eventTypeOptions.length > 0;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    setPointEventTypeId("");
  }, [eventTypeOptions, pointId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    setIsSubmitting(true);

    try {
      const createdEvent = await apiClient.createPointEvent(pointId, {
        pointEventTypeId: pointEventTypeId || undefined,
        eventType: pointEventTypeId ? undefined : "Informacao",
        description,
        eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        photos: photos.map<PointEventPhotoInput>((photo) => ({
          file: photo.file,
          caption: photo.caption,
        })),
      });

      setEvents((current) => [createdEvent, ...current]);
      resetComposer();
      setIsComposerOpen(false);
      toast.success("Informacoes adicionadas a linha do tempo.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel adicionar o evento.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhotosSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (!selectedFiles.length) {
      return;
    }

    setErrorMessage(null);
    setIsPreparingPhotos(true);

    const nextPhotos: TimelinePhotoDraft[] = [];

    try {
      for (const file of selectedFiles) {
        if (!file.type.startsWith("image/")) {
          setErrorMessage("Somente imagens sao permitidas na timeline.");
          continue;
        }

        if (file.size > MAX_TIMELINE_FILE_SIZE) {
          setErrorMessage("Cada foto pode ter no maximo 10 MB.");
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
              : "Nao foi possivel preparar uma das fotos da timeline.",
          );
        }
      }

      setPhotos((current) => {
        const merged = [...current, ...nextPhotos].slice(0, MAX_TIMELINE_FILES);

        if (current.length + nextPhotos.length > MAX_TIMELINE_FILES) {
          setErrorMessage(`Use no maximo ${MAX_TIMELINE_FILES} fotos por evento.`);
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
      setIsPreparingPhotos(false);
    }
  }

  function updatePhotoCaption(photoId: string, caption: string) {
    setPhotos((current) =>
      current.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
    );
  }

  function removePhoto(photoId: string) {
    setPhotos((current) => {
      const photoToRemove = current.find((photo) => photo.id === photoId);

      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.previewUrl);
      }

      return current.filter((photo) => photo.id !== photoId);
    });
  }

  function clearDraftPhotos() {
    setPhotos((current) => {
      current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
      return [];
    });
  }

  function resetComposer() {
    setPointEventTypeId("");
    setDescription("");
    setEventDate(getDefaultEventDateValue());
    clearDraftPhotos();
    setErrorMessage(null);
  }

  function openComposer() {
    setErrorMessage(null);
    setPointEventTypeId("");
    setEventDate(getDefaultEventDateValue());
    setIsComposerOpen(true);
  }

  function closeComposer() {
    resetComposer();
    setIsComposerOpen(false);
  }

  async function handleDeleteEvent(eventId: string) {
    setErrorMessage(null);
    setIsDeletingEventId(eventId);

    try {
      await apiClient.deletePointEvent(pointId, eventId);
      setEvents((current) => current.filter((item) => item.id !== eventId));
      setPendingDeleteEventId((current) => (current === eventId ? null : current));
      toast.success("Evento excluido com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel excluir o evento.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsDeletingEventId(null);
    }
  }

  return (
    <div className="stack-lg">
      {canManage ? (
        <section className="panel stack-md">
          <div>
            <h2 className="section-title">Adicionar informacoes a linha do tempo</h2>
            <p className="subtitle">
              Registre fotos, observacoes e atualizacoes relacionadas a este ponto.
            </p>
          </div>
          {!isComposerOpen ? (
            <div className="form-actions">
              <button className="button" onClick={openComposer} type="button">
                Adicionar informacoes
              </button>
            </div>
          ) : (
            <form className="form-stack" onSubmit={handleSubmit}>
              <div className="input-grid two">
                {hasConfiguredEventTypes ? (
                  <div className="field">
                    <label htmlFor="event-type">Categoria da informacao</label>
                    <select
                      id="event-type"
                      value={pointEventTypeId}
                      onChange={(inputEvent) => setPointEventTypeId(inputEvent.target.value)}
                    >
                      <option value="">Sem categoria</option>
                      {eventTypeOptions.map((eventType) => (
                        <option key={eventType.id} value={eventType.id}>
                          {eventType.name}
                        </option>
                      ))}
                    </select>
                    <span className="hint">Campo opcional.</span>
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="event-date">Data da informacao</label>
                  <input
                    id="event-date"
                    type="datetime-local"
                    value={eventDate}
                    onChange={(inputEvent) => setEventDate(inputEvent.target.value)}
                  />
                </div>
              </div>

              {!hasConfiguredEventTypes ? (
                <div className="surface-subtle">
                  <span className="muted">
                    Esta classificacao nao possui categorias predefinidas. Basta descrever a
                    informacao e anexar fotos, se quiser.
                  </span>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="event-description">Descricao da informacao</label>
                <textarea
                  id="event-description"
                  value={description}
                  onChange={(inputEvent) => setDescription(inputEvent.target.value)}
                  placeholder="Observacoes de campo, decisao tomada ou contexto da manutencao."
                />
              </div>

              <div className="field">
                <label htmlFor="event-photos">Fotos da informacao</label>
                <input
                  id="event-photos"
                  className="file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void handlePhotosSelected(event)}
                />
                <span className="hint">
                  Ate {MAX_TIMELINE_FILES} fotos por evento, com limite de 10 MB por imagem. Cada
                  arquivo e salvo com ate 2 MP.
                </span>
              </div>

              {isPreparingPhotos ? (
                <div className="surface-subtle">
                  <span className="muted">Preparando imagens para upload...</span>
                </div>
              ) : null}

              {photos.length ? (
                <div className="media-upload-list">
                  {photos.map((photo) => (
                    <div className="media-upload-card" key={photo.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="media-upload-preview"
                        src={photo.previewUrl}
                        alt={photo.file.name}
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
                          <label htmlFor={`photo-caption-${photo.id}`}>Descricao da foto</label>
                          <input
                            id={`photo-caption-${photo.id}`}
                            value={photo.caption}
                            onChange={(inputEvent) =>
                              updatePhotoCaption(photo.id, inputEvent.target.value)
                            }
                            placeholder="Ex.: copa apos poda, raiz exposta, canteiro fechado."
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
                          <button className="button-ghost" onClick={() => removePhoto(photo.id)} type="button">
                            Remover foto
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {errorMessage ? <p className="error">{errorMessage}</p> : null}

              <div className="form-actions">
                <button className="button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Salvando..." : "Salvar informacoes"}
                </button>
                <button className="button-ghost" disabled={isSubmitting} onClick={closeComposer} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>
      ) : (
        <section className="panel">
          <p className="subtitle">
            Voce esta visualizando a linha do tempo em modo leitura. Somente membros com acesso ao
            grupo podem adicionar informacoes e fotos.
          </p>
        </section>
      )}

      <section className="list-card">
        <div className="stack-sm">
          <h2 className="section-title">Linha do tempo</h2>
          <div className="timeline">
            {events.map((item) => (
              <article className="timeline-item" key={item.id}>
                <div className="timeline-item-header">
                  <div className="point-meta">
                    <span className="badge">{item.event_type}</span>
                    <span className="muted">{new Date(item.event_date).toLocaleString("pt-BR")}</span>
                  </div>
                  {canManage ? (
                    pendingDeleteEventId === item.id ? (
                      <div className="timeline-item-actions">
                        <button
                          className="button-ghost danger"
                          disabled={isDeletingEventId === item.id}
                          onClick={() => handleDeleteEvent(item.id)}
                          type="button"
                        >
                          {isDeletingEventId === item.id ? "Excluindo..." : "Confirmar exclusao"}
                        </button>
                        <button
                          className="button-ghost"
                          disabled={isDeletingEventId === item.id}
                          onClick={() => setPendingDeleteEventId(null)}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button-ghost danger"
                        disabled={Boolean(isDeletingEventId)}
                        onClick={() => setPendingDeleteEventId(item.id)}
                        type="button"
                      >
                        Excluir evento
                      </button>
                    )
                  ) : null}
                </div>
                <p className="timeline-description">{item.description || "Sem descricao."}</p>
                {item.media.length ? (
                  <div className="timeline-media-grid">
                    {item.media.map((media) => (
                      <figure className="timeline-media-card" key={media.id}>
                        {media.signed_url ? (
                          <Image
                            className="timeline-media-image"
                            src={media.signed_url}
                            alt={media.caption || `Foto do evento ${item.event_type}`}
                            width={320}
                            height={320}
                          />
                        ) : (
                          <div className="timeline-media-placeholder">Imagem indisponivel</div>
                        )}
                        <figcaption className="muted">
                          {media.caption || "Sem descricao da foto."}
                        </figcaption>
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
                      </figure>
                    ))}
                  </div>
                ) : null}
                <div className="timeline-item-footer">
                  <span className="muted">Registrado por {item.created_by_name}</span>
                </div>
              </article>
            ))}
            {!events.length ? <p className="muted">Ainda nao ha eventos registrados.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
