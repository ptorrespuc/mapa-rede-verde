"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cropImageToSquare, readFileAsDataUrl } from "@/lib/image-crop";

interface GroupLogoEditorProps {
  initialPreviewUrl?: string | null;
  onChange: (payload: {
    file: File | null;
    previewUrl: string | null;
    removeLogo: boolean;
  }) => void;
}

export function GroupLogoEditor({ initialPreviewUrl, onChange }: GroupLogoEditorProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl ?? null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const isEditingCrop = Boolean(sourceUrl);
  const visiblePreview = useMemo(() => previewUrl ?? initialPreviewUrl ?? null, [initialPreviewUrl, previewUrl]);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setPreviewUrl(initialPreviewUrl ?? null);
  }, [initialPreviewUrl]);

  useEffect(() => {
    let ignore = false;

    async function buildPreview() {
      if (!sourceUrl) {
        return;
      }

      setIsProcessing(true);

      try {
        const { blob, previewUrl: nextPreviewUrl } = await cropImageToSquare(sourceUrl, {
          zoom,
          offsetX,
          offsetY,
        });

        if (ignore) {
          return;
        }

        const file = new File([blob], `group-logo-${Date.now()}.png`, { type: "image/png" });
        setPreviewUrl(nextPreviewUrl);
        onChangeRef.current({ file, previewUrl: nextPreviewUrl, removeLogo: false });
      } catch {
        if (!ignore) {
          onChangeRef.current({
            file: null,
            previewUrl: initialPreviewUrl ?? null,
            removeLogo: false,
          });
        }
      } finally {
        if (!ignore) {
          setIsProcessing(false);
        }
      }
    }

    void buildPreview();

    return () => {
      ignore = true;
    };
  }, [initialPreviewUrl, offsetX, offsetY, sourceUrl, zoom]);

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setSourceUrl(dataUrl);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  function handleRemoveLogo() {
    setSourceUrl(null);
    setPreviewUrl(null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    onChangeRef.current({ file: null, previewUrl: null, removeLogo: true });
  }

  return (
    <div className="stack-sm">
      <input
        accept="image/png,image/jpeg,image/webp"
        className="file-input"
        onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
        type="file"
      />

      {visiblePreview ? (
        <div className="group-logo-editor">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Preview da logo do grupo" className="group-logo-preview" src={visiblePreview} />
        </div>
      ) : (
        <div className="group-logo-empty">
          <span className="muted">Nenhuma logo selecionada.</span>
        </div>
      )}

      {isEditingCrop ? (
        <div className="stack-sm">
          <div className="field">
            <label htmlFor="group-logo-zoom">Zoom</label>
            <input
              id="group-logo-zoom"
              max={2.5}
              min={1}
              onChange={(event) => setZoom(Number(event.target.value))}
              step={0.05}
              type="range"
              value={zoom}
            />
          </div>
          <div className="input-grid two">
            <div className="field">
              <label htmlFor="group-logo-offset-x">Ajuste horizontal</label>
              <input
                id="group-logo-offset-x"
                max={1}
                min={-1}
                onChange={(event) => setOffsetX(Number(event.target.value))}
                step={0.01}
                type="range"
                value={offsetX}
              />
            </div>
            <div className="field">
              <label htmlFor="group-logo-offset-y">Ajuste vertical</label>
              <input
                id="group-logo-offset-y"
                max={1}
                min={-1}
                onChange={(event) => setOffsetY(Number(event.target.value))}
                step={0.01}
                type="range"
                value={offsetY}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="button-row">
        {visiblePreview ? (
          <button className="button-ghost" onClick={handleRemoveLogo} type="button">
            Remover logo
          </button>
        ) : null}
        {isProcessing ? <span className="muted">Atualizando preview...</span> : null}
      </div>
    </div>
  );
}
