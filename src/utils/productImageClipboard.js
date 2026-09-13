// src/utils/productImageClipboard.js
// 📋 Descargar y copiar al portapapeles la foto ampliada del inventario.
// La app empaquetada carga el renderer desde file:// (ver electron-main.cjs), donde
// navigator.clipboard no copia imagenes de forma confiable. Por eso el camino bueno
// es el puente de Electron (preload.cjs -> electron-main.cjs), que usa el modulo
// clipboard del proceso principal. El navegador queda solo de reserva, para cuando
// se abre la vista con `npm run dev` en Chrome y no existe window.electronAPI.

const IMAGE_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

const getElectronBridge = () => (typeof window === 'undefined' ? null : window.electronAPI);

const slugifyProductTitle = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

export const getProductImageExtension = (imageUrl) => {
  const rawUrl = String(imageUrl || '').trim();
  const dataMatch = rawUrl.match(/^data:image\/([a-z0-9.+-]+)[;,]/i);
  if (dataMatch) {
    const subtype = dataMatch[1].toLowerCase();
    return subtype === 'jpeg' ? 'jpg' : subtype;
  }

  const pathMatch = rawUrl.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  const extension = pathMatch ? pathMatch[1].toLowerCase() : '';
  if (!IMAGE_FILE_EXTENSIONS.includes(extension)) return 'jpg';
  return extension === 'jpeg' ? 'jpg' : extension;
};

export const buildProductImageFileName = (productTitle, imageUrl) => {
  const slug = slugifyProductTitle(productTitle) || 'producto';
  return `rebu-${slug}.${getProductImageExtension(imageUrl)}`;
};

// 🖼️ El portapapeles de Windows quiere un mapa de bits y nativeImage solo decodifica
// PNG y JPEG: las miniaturas del bucket son WebP, asi que se copiarian vacias. Las
// pasamos por un canvas y viajan siempre como PNG.
export const readImageAsPngDataUrl = (imageUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    if (!String(imageUrl || '').startsWith('data:') && !String(imageUrl || '').startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) {
          throw new Error('No se pudo preparar la foto.');
        }
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('No se pudo preparar la foto.'));
    image.src = imageUrl;
  });

const copyWithBrowserClipboard = async (source) => {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      return { success: false, error: 'Este equipo no permite copiar imagenes.' };
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error(`No se pudo traer la foto (${response.status}).`);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || 'No se pudo copiar la foto.' };
  }
};

const downloadWithBrowserAnchor = async (source, fileName) => {
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`No se pudo traer la foto (${response.status}).`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return { success: true, fileName };
  } catch (error) {
    return { success: false, error: error?.message || 'No se pudo descargar la foto.' };
  }
};

export const copyProductImage = async ({ imageUrl } = {}) => {
  const source = String(imageUrl || '').trim();
  if (!source) return { success: false, error: 'No hay foto para copiar.' };

  let pngDataUrl = '';
  try {
    pngDataUrl = await readImageAsPngDataUrl(source);
  } catch {
    // Si el canvas queda "sucio" (una foto vieja alojada afuera, sin CORS) seguimos
    // igual: el proceso principal la descarga sin restricciones de origen.
  }

  const bridge = getElectronBridge();
  if (bridge?.copyImageToClipboard) {
    return bridge.copyImageToClipboard({ dataUrl: pngDataUrl, imageUrl: source });
  }

  return copyWithBrowserClipboard(pngDataUrl || source);
};

export const downloadProductImage = async ({ imageUrl, productTitle } = {}) => {
  const source = String(imageUrl || '').trim();
  if (!source) return { success: false, error: 'No hay foto para descargar.' };

  // El nombre sugerido se arma aca para que el dialogo del proceso principal y la
  // descarga del navegador propongan exactamente el mismo archivo.
  const fileName = buildProductImageFileName(productTitle, source);

  const bridge = getElectronBridge();
  if (bridge?.saveProductImage) {
    return bridge.saveProductImage({ imageUrl: source, defaultName: fileName });
  }

  return downloadWithBrowserAnchor(source, fileName);
};
