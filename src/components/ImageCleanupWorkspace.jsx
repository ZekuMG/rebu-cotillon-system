import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  LocateFixed,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react';
import { getProductImageUrl, hasProductImage } from '../utils/productImages';

const WATERMARK_LOGO_SRC = '/rebu-logo.png';
const DEFAULT_WATERMARK_OPACITY = 0.62;
const DEFAULT_WATERMARK_SCALE = 0.16;
const WATERMARK_LOGO_STORAGE_KEY = 'rebu_image_cleanup_logo_v1';
const WATERMARK_LOGO_NOTE_STORAGE_KEY = 'rebu_image_cleanup_logo_note_v1';

const DEFAULT_CLEANUP_PROMPT = [
  'Eliminar elementos visuales ajenos al producto, como texto superpuesto, stickers, marcas, bordes, precios o detalles que ensucien la foto.',
  'Mantener el producto principal intacto, con sus colores reales, textura, perspectiva, sombras naturales y proporcion.',
  'Dejar una imagen limpia, comercial, luminosa y coherente para catalogo de Rebu Cotillon.',
  'No agregar objetos nuevos, logos, texto ni marcas de agua.',
].join(' ');

const REFERENCE_ROLE_OPTIONS = [
  'referencia visual',
  'logo/marca',
  'objeto a quitar',
  'fondo deseado',
  'estilo final',
  'paleta/color',
];

const STATUS_META = {
  pending: { label: 'Pendiente', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  editing: { label: 'Editando', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  review: { label: 'Revisar', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  applying: { label: 'Guardando', className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
  applied: { label: 'Aplicada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  restored: { label: 'Restaurada', className: 'border-slate-300 bg-white text-slate-700' },
  error: { label: 'Error', className: 'border-red-200 bg-red-50 text-red-700' },
};

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.pending;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    image.src = src;
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el logo.'));
    reader.readAsDataURL(file);
  });

const getStoredValue = (key, fallback = '') => {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const setStoredValue = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // La seleccion del logo sigue funcionando aunque localStorage falle.
  }
};

const createReferenceImage = (dataUrl, file, index) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  imageUrl: dataUrl,
  name: file?.name || `referencia-${index + 1}`,
  role: 'referencia visual',
  instruction: 'Usar esta imagen solo como referencia adicional para entender estilo, objeto a quitar, fondo o terminacion esperada. No copiar elementos sobre el producto salvo que el prompt lo pida.',
});

const getWatermarkCandidates = ({ width, height, markWidth, markHeight, padding }) => ([
  { key: 'top-left', label: 'arriba izquierda', x: padding, y: padding },
  { key: 'top-right', label: 'arriba derecha', x: width - markWidth - padding, y: padding },
  { key: 'bottom-left', label: 'abajo izquierda', x: padding, y: height - markHeight - padding },
  { key: 'bottom-right', label: 'abajo derecha', x: width - markWidth - padding, y: height - markHeight - padding },
  { key: 'bottom-center', label: 'abajo centro', x: (width - markWidth) / 2, y: height - markHeight - padding },
]).map((candidate) => ({
  ...candidate,
  x: Math.round(clamp(candidate.x, padding, width - markWidth - padding)),
  y: Math.round(clamp(candidate.y, padding, height - markHeight - padding)),
}));

const scoreWatermarkArea = (ctx, candidate, width, height) => {
  const sampleWidth = Math.max(1, Math.round(candidate.width));
  const sampleHeight = Math.max(1, Math.round(candidate.height));
  const imageData = ctx.getImageData(candidate.x, candidate.y, sampleWidth, sampleHeight).data;
  const step = Math.max(4, Math.floor((sampleWidth * sampleHeight) / 900) * 4);
  let count = 0;
  let sum = 0;
  let sumSquared = 0;
  let edgeScore = 0;
  let previousLum = null;

  for (let index = 0; index < imageData.length; index += step) {
    const r = imageData[index] || 0;
    const g = imageData[index + 1] || 0;
    const b = imageData[index + 2] || 0;
    const lum = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    sum += lum;
    sumSquared += lum * lum;
    if (previousLum !== null) edgeScore += Math.abs(lum - previousLum);
    previousLum = lum;
    count += 1;
  }

  if (!count) return Number.POSITIVE_INFINITY;
  const mean = sum / count;
  const variance = Math.max(0, (sumSquared / count) - (mean * mean));
  const edgeAverage = edgeScore / Math.max(1, count - 1);
  const bottomPenalty = candidate.y > height * 0.62 ? 7 : 0;
  const centerPenalty = Math.abs((candidate.x + candidate.width / 2) - width / 2) < width * 0.18 ? 12 : 0;

  return variance + edgeAverage * 2 + bottomPenalty + centerPenalty;
};

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
};

const buildWatermarkedImageDataUrl = async (
  source,
  {
    logoSrc = WATERMARK_LOGO_SRC,
    opacity = 0.62,
    scale = 0.16,
  } = {},
) => {
  const [image, logo] = await Promise.all([
    loadImageElement(source),
    loadImageElement(logoSrc),
  ]);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo preparar la marca de agua.');

  ctx.drawImage(image, 0, 0, width, height);

  const padding = Math.round(clamp(Math.min(width, height) * 0.035, 24, 72));
  const markWidth = Math.round(clamp(width * scale, 96, width * 0.28));
  const logoRatio = (logo.naturalHeight || logo.height) / Math.max(1, logo.naturalWidth || logo.width);
  const markHeight = Math.round(markWidth * logoRatio);
  const boxPadding = Math.round(markWidth * 0.12);
  const boxWidth = markWidth + boxPadding * 2;
  const boxHeight = markHeight + boxPadding * 2;

  const candidates = getWatermarkCandidates({
    width,
    height,
    markWidth: boxWidth,
    markHeight: boxHeight,
    padding,
  }).map((candidate) => ({
    ...candidate,
    width: boxWidth,
    height: boxHeight,
  }));

  const best = candidates
    .map((candidate) => ({ ...candidate, score: scoreWatermarkArea(ctx, candidate, width, height) }))
    .sort((a, b) => a.score - b.score)[0] || candidates[0];

  ctx.save();
  ctx.globalAlpha = clamp(Number(opacity) || 0.62, 0.18, 0.9);
  ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
  ctx.shadowBlur = Math.round(markWidth * 0.08);
  ctx.shadowOffsetY = Math.round(markWidth * 0.025);
  drawRoundedRect(ctx, best.x, best.y, boxWidth, boxHeight, Math.round(boxHeight * 0.26));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.drawImage(logo, best.x + boxPadding, best.y + boxPadding, markWidth, markHeight);
  ctx.restore();

  return {
    dataUrl: canvas.toDataURL('image/webp', 0.9),
    placementLabel: best.label,
  };
};

const buildRows = (products) =>
  products.map((product) => {
    const originalImageUrl = getProductImageUrl(product, { preferOriginal: true });
    return {
      rowId: `${product.id}-ai-cleanup`,
      productId: product.id,
      title: product.title || 'Producto sin nombre',
      barcode: String(product.barcode || '').trim(),
      category: Array.isArray(product.categories) ? product.categories.join(', ') : product.category || '',
      originalImageUrl,
      originalThumbUrl: product.imageThumb || product.image_thumb || originalImageUrl,
      editedDataUrl: '',
      watermarked: false,
      watermarkPlacement: '',
      status: 'pending',
      approved: false,
      message: 'Lista para limpiar con IA',
      prompt: DEFAULT_CLEANUP_PROMPT,
    };
  });

export default function ImageCleanupWorkspace({
  inventory = [],
  selectedIds = [],
  onApplyProductImageImports,
  onRestoreProductImage,
  onProductsApplied,
}) {
  const [rows, setRows] = useState([]);
  const [prompt, setPrompt] = useState(DEFAULT_CLEANUP_PROMPT);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeRowId, setActiveRowId] = useState('');
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkLogoSrc, setWatermarkLogoSrc] = useState(() => getStoredValue(WATERMARK_LOGO_STORAGE_KEY, ''));
  const [logoInstruction, setLogoInstruction] = useState(() => getStoredValue(
    WATERMARK_LOGO_NOTE_STORAGE_KEY,
    'Usar esta imagen solo como logo/marca de Rebu. No modificar el producto con elementos del logo salvo que el prompt lo pida explicitamente.',
  ));
  const [referenceImages, setReferenceImages] = useState([]);
  const [watermarkingRowId, setWatermarkingRowId] = useState('');

  const productsWithImage = useMemo(
    () => inventory.filter((product) => hasProductImage(product)),
    [inventory],
  );

  const selectedProductsWithImage = useMemo(
    () => productsWithImage.filter((product) => selectedIds.includes(product.id)),
    [productsWithImage, selectedIds],
  );

  const sourceProducts = selectedProductsWithImage.length > 0
    ? selectedProductsWithImage
    : productsWithImage;

  const visibleRows = rows.filter((row) => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return true;
    return [row.title, row.barcode, row.category, row.status]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });

  const activeRow = rows.find((row) => row.rowId === activeRowId) || rows[0] || null;
  const stats = rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.status === 'review') acc.review += 1;
    if (row.status === 'applied') acc.applied += 1;
    if (row.status === 'error') acc.error += 1;
    return acc;
  }, { total: 0, review: 0, applied: 0, error: 0 });

  const updateRow = (rowId, patch) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const applyWatermarkToRow = async (row, sourceOverride = '') => {
    if (!row) return null;
    setWatermarkingRowId(row.rowId);
    try {
      const source = sourceOverride || row.editedDataUrl || row.originalImageUrl;
      const result = await buildWatermarkedImageDataUrl(source, {
        logoSrc: watermarkLogoSrc || WATERMARK_LOGO_SRC,
        opacity: DEFAULT_WATERMARK_OPACITY,
        scale: DEFAULT_WATERMARK_SCALE,
      });
      updateRow(row.rowId, {
        editedDataUrl: result.dataUrl,
        watermarked: true,
        watermarkPlacement: result.placementLabel,
        status: 'review',
        message: `Marca de agua colocada ${result.placementLabel}. Revisala antes de guardar.`,
      });
      return result;
    } catch (error) {
      updateRow(row.rowId, {
        status: 'error',
        message: error?.message || 'No se pudo aplicar la marca de agua.',
      });
      return null;
    } finally {
      setWatermarkingRowId('');
    }
  };

  const prepareQueue = () => {
    const nextRows = buildRows(sourceProducts);
    setRows(nextRows);
    setActiveRowId(nextRows[0]?.rowId || '');
  };

  const handleLogoFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setWatermarkLogoSrc(dataUrl);
    setStoredValue(WATERMARK_LOGO_STORAGE_KEY, dataUrl);
  };

  const handleReferenceFilesChange = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/'));
    event.target.value = '';
    if (files.length === 0) return;
    const remainingSlots = Math.max(0, 6 - referenceImages.length);
    const nextFiles = files.slice(0, remainingSlots);
    const nextImages = await Promise.all(nextFiles.map(async (file, index) => (
      createReferenceImage(await readFileAsDataUrl(file), file, referenceImages.length + index)
    )));
    setReferenceImages((current) => [...current, ...nextImages].slice(0, 6));
  };

  const updateReferenceImage = (id, patch) => {
    setReferenceImages((current) => current.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
  };

  const removeReferenceImage = (id) => {
    setReferenceImages((current) => current.filter((item) => item.id !== id));
  };

  const applyReferenceAsWatermarkLogo = (reference) => {
    if (!reference?.imageUrl) return;
    setWatermarkLogoSrc(reference.imageUrl);
    setStoredValue(WATERMARK_LOGO_STORAGE_KEY, reference.imageUrl);
    setLogoInstruction(`Usar "${reference.name}" como logo/marca de agua de Rebu si el prompt pide aplicar marca.`);
    setStoredValue(WATERMARK_LOGO_NOTE_STORAGE_KEY, `Usar "${reference.name}" como logo/marca de agua de Rebu si el prompt pide aplicar marca.`);
  };

  const resetWatermarkLogo = () => {
    setWatermarkLogoSrc('');
    setStoredValue(WATERMARK_LOGO_STORAGE_KEY, '');
  };

  const handleLogoInstructionChange = (value) => {
    setLogoInstruction(value);
    setStoredValue(WATERMARK_LOGO_NOTE_STORAGE_KEY, value);
  };

  const buildFullPrompt = (rowPrompt) => [
    String(rowPrompt || prompt || DEFAULT_CLEANUP_PROMPT).trim(),
    watermarkLogoSrc
      ? [
          '',
          'Logo adjunto:',
          'La imagen adicional marcada como logo debe interpretarse como el logo/marca de Rebu.',
          String(logoInstruction || '').trim(),
        ].filter(Boolean).join('\n')
      : '',
    referenceImages.length > 0
      ? [
          '',
          'Imagenes extra adjuntas:',
          ...referenceImages.map((reference, index) => (
            `Extra ${index + 1} (${reference.role || 'referencia'} - ${reference.name}): ${reference.instruction || 'Usar solo como referencia visual.'}`
          )),
        ].join('\n')
      : '',
  ].filter(Boolean).join('\n');

  const editRow = async (row) => {
    if (!row) return;
    if (!window.electronAPI?.openAIImageEdit) {
      updateRow(row.rowId, {
        status: 'error',
        message: 'Esta accion necesita ejecutarse desde Electron.',
      });
      return;
    }

    const rowPrompt = buildFullPrompt(row.prompt);
    updateRow(row.rowId, {
      status: 'editing',
      message: 'Enviando imagen a OpenAI...',
      prompt: rowPrompt,
      approved: false,
    });

    const result = await window.electronAPI.openAIImageEdit({
      imageUrl: row.originalImageUrl,
      logoImageUrl: watermarkLogoSrc || '',
      logoInstruction,
      referenceImages: referenceImages.map((reference) => ({
        imageUrl: reference.imageUrl,
        role: reference.role,
        instruction: reference.instruction,
        name: reference.name,
      })),
      productTitle: row.title,
      prompt: rowPrompt,
    });

    if (!result?.success) {
      updateRow(row.rowId, {
        status: 'error',
        message: result?.error || 'No se pudo editar la imagen.',
      });
      return;
    }

    let editedDataUrl = result.imageDataUrl;
    let watermarkPlacement = '';
    let watermarked = false;

    if (watermarkEnabled) {
      try {
        const watermarkedResult = await buildWatermarkedImageDataUrl(result.imageDataUrl, {
          logoSrc: watermarkLogoSrc || WATERMARK_LOGO_SRC,
          opacity: DEFAULT_WATERMARK_OPACITY,
          scale: DEFAULT_WATERMARK_SCALE,
        });
        editedDataUrl = watermarkedResult.dataUrl;
        watermarkPlacement = watermarkedResult.placementLabel;
        watermarked = true;
      } catch {
        watermarkPlacement = '';
        watermarked = false;
      }
    }

    updateRow(row.rowId, {
      status: 'review',
      editedDataUrl,
      watermarked,
      watermarkPlacement,
      message: watermarked
        ? `Revisala antes de guardar. Marca colocada ${watermarkPlacement}.`
        : 'Revisala antes de guardar en el producto',
    });
  };

  const applyRow = async (row) => {
    if (!row?.editedDataUrl || !onApplyProductImageImports) return;

    updateRow(row.rowId, { status: 'applying', message: 'Guardando foto limpia...' });
    const result = await onApplyProductImageImports([{
      productId: row.productId,
      title: row.title,
      barcode: row.barcode,
      status: 'found',
      approved: true,
      imageDataUrl: row.editedDataUrl,
      replaceExistingImage: true,
      preservePreviousImage: true,
      previousImageUrl: row.originalImageUrl,
      previousImageThumbUrl: row.originalThumbUrl,
      foundTitle: 'Limpieza IA Rebu',
      imageUrl: row.originalImageUrl,
      sourceUrl: 'openai-image-edit',
      matchQuality: 'ai_cleanup',
      watermarked: Boolean(row.watermarked),
      watermarkPlacement: row.watermarkPlacement || '',
    }]);

    const failed = result?.failedRows?.find((failedRow) => String(failedRow.productId) === String(row.productId));
    if (failed) {
      updateRow(row.rowId, {
        status: 'error',
        message: failed.error || 'No se pudo guardar la foto limpia.',
      });
      return;
    }

    if (Array.isArray(result?.products)) onProductsApplied?.(result.products);
    updateRow(row.rowId, {
      status: 'applied',
      approved: true,
      message: 'Foto limpia aplicada. El original quedo disponible para restaurar.',
    });
  };

  const restoreRow = async (row) => {
    if (!row?.originalImageUrl || !onRestoreProductImage) {
      updateRow(row.rowId, {
        status: 'pending',
        editedDataUrl: '',
        watermarked: false,
        watermarkPlacement: '',
        approved: false,
        message: 'Volvio al original en la cola',
      });
      return;
    }

    updateRow(row.rowId, { status: 'applying', message: 'Restaurando foto original...' });
    const result = await onRestoreProductImage({
      productId: row.productId,
      image: row.originalImageUrl,
      image_thumb: row.originalThumbUrl,
      reason: 'Restauracion desde limpieza IA',
    });

    if (!result?.success) {
      updateRow(row.rowId, {
        status: 'error',
        message: result?.error || 'No se pudo restaurar el original.',
      });
      return;
    }

    if (result.product) onProductsApplied?.([result.product]);
    updateRow(row.rowId, {
      status: 'restored',
      editedDataUrl: '',
      watermarked: false,
      watermarkPlacement: '',
      approved: false,
      message: 'Producto restaurado al original',
    });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white p-3 custom-scrollbar">
        <section className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700">
            <Sparkles size={13} />
            Limpieza IA
          </p>
          <p className="mt-2 text-xs font-bold leading-relaxed text-slate-700">
            Prepara las fotos actuales del inventario, edita una por una con tu prompt y guarda solo las aprobadas.
          </p>
          <button
            type="button"
            onClick={prepareQueue}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-black text-white transition hover:bg-slate-800"
          >
            <ImageIcon size={14} />
            Preparar {sourceProducts.length} fotos
          </button>
          <p className="mt-2 text-[10px] font-bold leading-snug text-fuchsia-900/70">
            {selectedProductsWithImage.length > 0
              ? `Usando ${selectedProductsWithImage.length} productos seleccionados.`
              : 'Sin seleccion: usa todos los productos con foto.'}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Prompt base
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={8}
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold leading-relaxed text-slate-800 outline-none focus:border-fuchsia-300"
          />
        </section>

        <section className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">
                <LocateFixed size={13} />
                Marca y referencias
              </p>
              <p className="mt-1 text-[11px] font-bold leading-snug text-sky-900/75">
                Adjunta logo y fotos guia. La IA recibe todo con instrucciones; la marca automatica busca una zona limpia.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWatermarkEnabled((current) => !current)}
              className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
                watermarkEnabled ? 'bg-sky-600' : 'bg-slate-300'
              }`}
              aria-pressed={watermarkEnabled}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  watermarkEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-sky-200 bg-white p-2.5">
            <div className="grid grid-cols-[58px_1fr] gap-2.5">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img
                  src={watermarkLogoSrc || WATERMARK_LOGO_SRC}
                  alt="Logo para marca de agua"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black text-slate-800">
                  {watermarkLogoSrc ? 'Logo elegido por vos' : 'Logo Rebu predeterminado'}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                  Se manda como imagen separada para que el prompt lo interprete bien.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[10px] font-black text-white transition hover:bg-sky-700">
                    <Upload size={11} />
                    Elegir logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                  </label>
                  {watermarkLogoSrc ? (
                    <button
                      type="button"
                      onClick={resetWatermarkLogo}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
                    >
                      <Trash2 size={11} />
                      Usar Rebu
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <label className="mt-2 block">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-sky-800">
                Instruccion para el logo
              </span>
              <textarea
                value={logoInstruction}
                onChange={(event) => handleLogoInstructionChange(event.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold leading-relaxed text-slate-700 outline-none focus:border-sky-300"
              />
            </label>
            <p className="mt-1 text-[10px] font-bold leading-snug text-sky-900/70">
              Opacidad, tamano, posicion o uso del logo se aclaran en el prompt cuando queres que lo resuelva la IA.
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Adjuntos para OpenAI
                </p>
                <p className="mt-0.5 text-[10px] font-bold leading-snug text-slate-500">
                  Hasta 6 imagenes extra con rol e instruccion corta. Usadas junto al producto.
                </p>
              </div>
              <label className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-black text-white transition ${
                referenceImages.length >= 6
                  ? 'cursor-not-allowed bg-slate-300'
                  : 'cursor-pointer bg-slate-900 hover:bg-slate-800'
              }`}>
                <Upload size={11} />
                Agregar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={referenceImages.length >= 6}
                  className="hidden"
                  onChange={handleReferenceFilesChange}
                />
              </label>
            </div>

            {referenceImages.length > 0 ? (
              <div className="mt-2 space-y-2">
                {referenceImages.map((reference, index) => (
                  <div key={reference.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="grid grid-cols-[54px_1fr_auto] gap-2">
                      <img
                        src={reference.imageUrl}
                        alt=""
                        className="h-[54px] w-[54px] rounded-md border border-slate-200 bg-white object-contain"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-black text-slate-700" title={reference.name}>
                          Extra {index + 1}: {reference.name}
                        </p>
                        <select
                          value={reference.role}
                          onChange={(event) => updateReferenceImage(reference.id, { role: event.target.value })}
                          className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 outline-none focus:border-sky-300"
                        >
                          {REFERENCE_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReferenceImage(reference.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-red-600"
                        title="Quitar referencia"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <textarea
                      value={reference.instruction}
                      onChange={(event) => updateReferenceImage(reference.id, { instruction: event.target.value })}
                      rows={2}
                      placeholder="Que debe entender la IA de esta imagen..."
                      className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-[10px] font-semibold leading-relaxed text-slate-700 outline-none focus:border-sky-300"
                    />
                    <button
                      type="button"
                      onClick={() => applyReferenceAsWatermarkLogo(reference)}
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-sky-700 hover:text-sky-900"
                    >
                      <LocateFixed size={11} />
                      Usar como logo/marca
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-md bg-slate-50 p-2 text-[10px] font-bold leading-snug text-slate-400">
                Sin extras. Si agregas imagenes, OpenAI las recibira como referencias numeradas junto al producto.
              </p>
            )}
          </div>

        </section>

        <section className="grid grid-cols-2 gap-2">
          {[
            ['Lote', stats.total],
            ['Revisar', stats.review],
            ['Aplicadas', stats.applied],
            ['Errores', stats.error],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-2">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      </aside>

      <section className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white p-3">
          <label className="relative block w-72">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar en cola..."
              className="h-9 w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-xs font-bold outline-none focus:border-fuchsia-300"
            />
          </label>
          <p className="text-[11px] font-bold text-slate-400">
            El original se conserva para poder restaurar.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,0.38fr)_minmax(0,1fr)] overflow-hidden">
          <div className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-2 custom-scrollbar">
            {visibleRows.length === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-center">
                <p className="max-w-xs text-xs font-bold leading-relaxed text-slate-400">
                  Prepara el lote para ver las fotos disponibles.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleRows.map((row) => {
                  const meta = getStatusMeta(row.status);
                  const isActive = activeRow?.rowId === row.rowId;
                  return (
                    <button
                      key={row.rowId}
                      type="button"
                      onClick={() => setActiveRowId(row.rowId)}
                      className={`grid w-full grid-cols-[52px_1fr] gap-2 rounded-lg border p-2 text-left transition ${
                        isActive ? 'border-fuchsia-300 bg-fuchsia-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <img src={row.editedDataUrl || row.originalThumbUrl || row.originalImageUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-800">{row.title}</span>
                        <span className="mt-1 block truncate text-[10px] font-bold text-slate-400">{row.barcode || row.category || 'Sin codigo'}</span>
                        <span className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${meta.className}`}>
                          {meta.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
            {!activeRow ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-xl bg-white">
                <p className="text-sm font-black text-slate-400">Todavia no hay foto seleccionada.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-slate-900">{activeRow.title}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">{activeRow.barcode || 'Sin codigo'} · {activeRow.category || 'Sin categoria'}</p>
                    {activeRow.message ? <p className="mt-2 text-xs font-bold text-slate-500">{activeRow.message}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${getStatusMeta(activeRow.status).className}`}>
                    {getStatusMeta(activeRow.status).label}
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <figcaption className="border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Original
                    </figcaption>
                    <img src={activeRow.originalImageUrl} alt="" className="h-[360px] w-full object-contain bg-slate-50" />
                  </figure>
                  <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <figcaption className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      <span>Editada</span>
                      {activeRow.watermarked ? (
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">
                          Logo {activeRow.watermarkPlacement}
                        </span>
                      ) : null}
                    </figcaption>
                    {activeRow.status === 'editing' || watermarkingRowId === activeRow.rowId ? (
                      <div className="flex h-[360px] items-center justify-center bg-slate-50 text-amber-700">
                        <Loader2 size={28} className="animate-spin" />
                      </div>
                    ) : activeRow.editedDataUrl ? (
                      <img src={activeRow.editedDataUrl} alt="" className="h-[360px] w-full object-contain bg-slate-50" />
                    ) : (
                      <div className="flex h-[360px] items-center justify-center bg-slate-50 text-center">
                        <p className="max-w-xs text-xs font-bold leading-relaxed text-slate-400">
                          Edita con IA para ver una propuesta limpia antes de aprobar.
                        </p>
                      </div>
                    )}
                  </figure>
                </div>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Prompt para esta foto
                  </label>
                  <textarea
                    value={activeRow.prompt || prompt}
                    onChange={(event) => updateRow(activeRow.rowId, { prompt: event.target.value })}
                    rows={4}
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-800 outline-none focus:border-fuchsia-300"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editRow(activeRow)}
                      disabled={activeRow.status === 'editing' || activeRow.status === 'applying' || watermarkingRowId === activeRow.rowId}
                      className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-black text-white transition hover:bg-fuchsia-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {activeRow.status === 'editing' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                      {activeRow.editedDataUrl ? 'Reintentar con prompt' : 'Editar con IA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWatermarkToRow(activeRow)}
                      disabled={activeRow.status === 'editing' || activeRow.status === 'applying' || watermarkingRowId === activeRow.rowId}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-black text-white transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {watermarkingRowId === activeRow.rowId ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
                      Marca/logo auto
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRow(activeRow)}
                      disabled={!activeRow.editedDataUrl || activeRow.status === 'editing' || activeRow.status === 'applying' || watermarkingRowId === activeRow.rowId}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle size={14} />
                      Aprobar y guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreRow(activeRow)}
                      disabled={activeRow.status === 'editing' || activeRow.status === 'applying' || watermarkingRowId === activeRow.rowId}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {activeRow.status === 'applied' ? <Undo2 size={14} /> : <RotateCcw size={14} />}
                      {activeRow.status === 'applied' ? 'Restaurar original' : 'Volver en cola'}
                    </button>
                    {activeRow.status === 'error' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                        <XCircle size={14} />
                        {activeRow.message}
                      </span>
                    ) : null}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
