"use client";

export const MAX_UPLOAD_IMAGE_PIXELS = 2_000_000;

export interface ProcessedUploadImage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  wasResized: boolean;
}

const FALLBACK_IMAGE_MIME = "image/jpeg";

export async function processImageForUpload(file: File): Promise<ProcessedUploadImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Somente imagens sao permitidas.");
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const totalPixels = width * height;

    if (totalPixels <= MAX_UPLOAD_IMAGE_PIXELS) {
      return {
        file,
        previewUrl: sourceUrl,
        width,
        height,
        wasResized: false,
      };
    }

    const scale = Math.sqrt(MAX_UPLOAD_IMAGE_PIXELS / totalPixels);
    const nextWidth = Math.max(1, Math.round(width * scale));
    const nextHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Nao foi possivel preparar a imagem para upload.");
    }

    context.drawImage(image, 0, 0, nextWidth, nextHeight);

    const outputMimeType = getOutputMimeType(file.type);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error("Nao foi possivel gerar a imagem tratada."));
            return;
          }

          resolve(nextBlob);
        },
        outputMimeType,
        0.9,
      );
    });

    const processedFile = new File(
      [blob],
      buildProcessedFileName(file.name, outputMimeType),
      {
        type: outputMimeType,
        lastModified: Date.now(),
      },
    );

    URL.revokeObjectURL(sourceUrl);

    return {
      file: processedFile,
      previewUrl: URL.createObjectURL(processedFile),
      width: nextWidth,
      height: nextHeight,
      wasResized: true,
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

export function formatProcessedImageLabel(width: number, height: number) {
  const megapixels = (width * height) / 1_000_000;
  return `${width} x ${height} (${megapixels.toFixed(1)} MP)`;
}

function getOutputMimeType(originalMimeType: string) {
  if (originalMimeType === "image/png" || originalMimeType === "image/webp") {
    return originalMimeType;
  }

  return FALLBACK_IMAGE_MIME;
}

function buildProcessedFileName(fileName: string, mimeType: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  const baseName = (lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `${baseName || "imagem"}-${Date.now()}.${extension}`;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel ler a imagem selecionada."));
    image.src = source;
  });
}
