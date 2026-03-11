function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel carregar a imagem."));
    image.src = source;
  });
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

export async function cropImageToSquare(
  source: string,
  options: {
    zoom: number;
    offsetX: number;
    offsetY: number;
    size?: number;
  },
) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const size = options.size ?? 512;
  const minSide = Math.min(image.naturalWidth, image.naturalHeight);
  const cropSide = minSide / Math.max(options.zoom, 1);
  const centeredX = (image.naturalWidth - cropSide) / 2;
  const centeredY = (image.naturalHeight - cropSide) / 2;
  const maxOffsetX = centeredX;
  const maxOffsetY = centeredY;
  const sourceX = clamp(centeredX + maxOffsetX * options.offsetX, 0, image.naturalWidth - cropSide);
  const sourceY = clamp(centeredY + maxOffsetY * options.offsetY, 0, image.naturalHeight - cropSide);

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nao foi possivel preparar o recorte da imagem.");
  }

  context.drawImage(image, sourceX, sourceY, cropSide, cropSide, 0, 0, size, size);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("Nao foi possivel gerar a imagem recortada."));
          return;
        }

        resolve(nextBlob);
      },
      "image/png",
      0.92,
    );
  });

  return {
    blob,
    previewUrl: canvas.toDataURL("image/png"),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
