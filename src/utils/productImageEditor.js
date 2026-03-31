export const readImageFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    image.src = src;
  });

export const buildAdjustedProductImageFile = async (
  source,
  {
    zoom = 1,
    offsetX = 0,
    offsetY = 0,
    outputSize = 1200,
    mimeType = 'image/webp',
    quality = 0.92,
    fileName = 'product-image.webp',
  } = {}
) => {
  const image = await loadImageElement(source);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar el editor de imagen.');
  }

  const baseScale = Math.max(outputSize / image.width, outputSize / image.height);
  const finalScale = baseScale * Number(zoom || 1);
  const drawWidth = image.width * finalScale;
  const drawHeight = image.height * finalScale;

  const normalizedOffsetX = (Number(offsetX || 0) / 100) * (outputSize / 2);
  const normalizedOffsetY = (Number(offsetY || 0) / 100) * (outputSize / 2);

  const x = outputSize / 2 - drawWidth / 2 + normalizedOffsetX;
  const y = outputSize / 2 - drawHeight / 2 + normalizedOffsetY;

  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('No se pudo exportar la imagen ajustada.'));
      },
      mimeType,
      quality
    );
  });

  return new File([blob], fileName, { type: mimeType });
};
