export const AI_IMAGE_SIZES = [
  { id: 'square', label: 'Cuadrada', detail: '1024 × 1024', width: 1024, height: 1024 },
  { id: 'landscape', label: 'Horizontal', detail: '1024 × 768', width: 1024, height: 768 },
  { id: 'portrait', label: 'Vertical', detail: '768 × 1024', width: 768, height: 1024 },
  { id: 'wide', label: 'Panorámica', detail: '1280 × 720', width: 1280, height: 720 },
];

export const AI_IMAGE_REFERENCE_LIMIT = 4;
export const AI_IMAGE_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const AI_IMAGE_MAX_REFERENCE_SIDE = 512;

export const getAiImageSize = (sizeId) =>
  AI_IMAGE_SIZES.find((size) => size.id === sizeId) || AI_IMAGE_SIZES[0];

export const buildAiImageRequest = ({ mode, prompt, sizeId, references = [] }) => {
  const normalizedMode = mode === 'edit' ? 'edit' : 'generate';
  const normalizedPrompt = String(prompt || '').trim();
  const size = getAiImageSize(sizeId);

  if (normalizedPrompt.length < 3) {
    throw new Error('Escribí una indicación de al menos 3 caracteres.');
  }
  if (normalizedPrompt.length > 2000) {
    throw new Error('La indicación no puede superar los 2000 caracteres.');
  }
  if (normalizedMode === 'edit' && references.length === 0) {
    throw new Error('Agregá al menos una imagen para editar.');
  }
  if (references.length > AI_IMAGE_REFERENCE_LIMIT) {
    throw new Error(`Podés usar hasta ${AI_IMAGE_REFERENCE_LIMIT} imágenes de referencia.`);
  }

  return {
    mode: normalizedMode,
    prompt: normalizedPrompt,
    width: size.width,
    height: size.height,
    images: normalizedMode === 'edit'
      ? references.map((reference, index) => ({
          name: String(reference?.name || `referencia-${index + 1}.jpg`),
          dataUrl: String(reference?.dataUrl || ''),
        }))
      : [],
  };
};

const readBlobAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  reader.readAsDataURL(blob);
});

export const prepareAiImageReference = async (file) => {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Seleccioná un archivo de imagen válido.');
  }
  if (file.size > AI_IMAGE_MAX_FILE_BYTES) {
    throw new Error('Cada referencia debe pesar menos de 8 MB.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AI_IMAGE_MAX_REFERENCE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error('No se pudo preparar la referencia.'))),
      mimeType,
      mimeType === 'image/jpeg' ? 0.88 : undefined,
    );
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: String(file.name || 'referencia').replace(/\.[^.]+$/, '') + (mimeType === 'image/png' ? '.png' : '.jpg'),
    dataUrl: await readBlobAsDataUrl(blob),
    width,
    height,
  };
};

export const createReferenceFromResult = (result) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: `prueba-rebu-${result.id}.png`,
  dataUrl: result.imageDataUrl,
  width: result.width,
  height: result.height,
});
