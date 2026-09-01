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
    if (!String(src || '').startsWith('data:') && !String(src || '').startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    image.src = src;
  });

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const calculateAdjustedImageLayout = ({
  imageWidth,
  imageHeight,
  outputSize,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  fitMode = 'contain',
}) => {
  const safeWidth = Math.max(1, Number(imageWidth) || 1);
  const safeHeight = Math.max(1, Number(imageHeight) || 1);
  const safeOutputSize = Math.max(1, Number(outputSize) || 1);
  const safeZoom = Math.max(1, Number(zoom) || 1);
  const baseScale = fitMode === 'cover'
    ? Math.max(safeOutputSize / safeWidth, safeOutputSize / safeHeight)
    : Math.min(safeOutputSize / safeWidth, safeOutputSize / safeHeight);
  const finalScale = baseScale * safeZoom;
  const drawWidth = safeWidth * finalScale;
  const drawHeight = safeHeight * finalScale;
  const maxShiftX = Math.abs(drawWidth - safeOutputSize) / 2;
  const maxShiftY = Math.abs(drawHeight - safeOutputSize) / 2;
  const maxOffsetX = (maxShiftX / (safeOutputSize / 2)) * 100;
  const maxOffsetY = (maxShiftY / (safeOutputSize / 2)) * 100;
  const clampedOffsetX = clamp(Number(offsetX) || 0, -maxOffsetX, maxOffsetX);
  const clampedOffsetY = clamp(Number(offsetY) || 0, -maxOffsetY, maxOffsetY);
  const shiftX = (clampedOffsetX / 100) * (safeOutputSize / 2);
  const shiftY = (clampedOffsetY / 100) * (safeOutputSize / 2);

  return {
    drawWidth,
    drawHeight,
    x: safeOutputSize / 2 - drawWidth / 2 + shiftX,
    y: safeOutputSize / 2 - drawHeight / 2 + shiftY,
    offsetX: clampedOffsetX,
    offsetY: clampedOffsetY,
    maxOffsetX,
    maxOffsetY,
  };
};

export const buildAdjustedProductImageFile = async (
  source,
  {
    zoom = 1,
    offsetX = 0,
    offsetY = 0,
    fitMode = 'contain',
    outputSize = 1200,
    mimeType = 'image/webp',
    quality = 0.86,
    backgroundColor = '#f8fafc',
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

  const layout = calculateAdjustedImageLayout({
    imageWidth: image.width,
    imageHeight: image.height,
    outputSize,
    zoom,
    offsetX,
    offsetY,
    fitMode,
  });

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, layout.x, layout.y, layout.drawWidth, layout.drawHeight);

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
