import { getCasaAlbertoLink, getCasaAlbertoProductId } from './productLifecycle.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const IMAGE_IMPORT_SEARCHABLE_STATUSES = ['pending', 'error', 'login_required'];

export const IMAGE_IMPORT_SORT_OPTIONS = [
  { value: 'newest', label: 'Más nuevos' },
  { value: 'oldest', label: 'Más viejos' },
  { value: 'name', label: 'Nombre A-Z' },
];

export const IMAGE_IMPORT_AGE_OPTIONS = [
  { value: 'all', label: 'Cualquiera' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];

export const DEFAULT_IMAGE_IMPORT_FILTERS = {
  ageDays: 'all',
  categories: [],
  stock: 'all',
  code: 'all',
  link: 'all',
};

export const getProductCreatedTime = (product = {}) => {
  const time = new Date(product?.created_at || product?.createdAt || 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
};

export const getProductImageCategories = (product = {}) => {
  const raw = Array.isArray(product?.categories) && product.categories.length > 0
    ? product.categories
    : String(product?.category || '').split(',');
  return [...new Set(raw.map((category) => String(category || '').trim()).filter(Boolean))];
};

// Datos del producto que necesita la cola de fotos para ordenar, filtrar e ir
// directo a la ficha de Casa Alberto cuando ya existe el enlace.
export const getImageImportProductFields = (product = {}) => {
  const link = getCasaAlbertoLink(product);
  const casaAlbertoId = getCasaAlbertoProductId(link);
  const casaAlbertoUrl = String(link.productUrl || '').trim();
  return {
    createdAt: getProductCreatedTime(product),
    stock: Number(product?.stock || 0),
    categories: getProductImageCategories(product),
    casaAlbertoId,
    casaAlbertoUrl,
    hasCasaAlbertoLink: Boolean(casaAlbertoId || casaAlbertoUrl),
  };
};

export const hasActiveImageImportFilters = (filters = DEFAULT_IMAGE_IMPORT_FILTERS) => (
  filters.ageDays !== 'all'
  || (filters.categories || []).length > 0
  || filters.stock !== 'all'
  || filters.code !== 'all'
  || filters.link !== 'all'
);

export const matchesImageImportFilters = (row = {}, filters = DEFAULT_IMAGE_IMPORT_FILTERS, now = Date.now()) => {
  const ageDays = Number(filters.ageDays);
  if (filters.ageDays !== 'all' && ageDays > 0) {
    if (!row.createdAt || row.createdAt < now - ageDays * DAY_MS) return false;
  }
  const categories = filters.categories || [];
  if (categories.length > 0 && !(row.categories || []).some((category) => categories.includes(category))) {
    return false;
  }
  if (filters.stock === 'with' && !(Number(row.stock) > 0)) return false;
  if (filters.code === 'with' && !row.barcode) return false;
  if (filters.code === 'without' && row.barcode) return false;
  if (filters.link === 'linked' && !row.hasCasaAlbertoLink) return false;
  if (filters.link === 'unlinked' && row.hasCasaAlbertoLink) return false;
  return true;
};

const compareByName = (left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'es', { sensitivity: 'base' });

// Sin fecha de alta quedan al final en los dos sentidos; el ID solo desempata.
const compareByCreated = (left, right, direction) => {
  const leftTime = Number(left.createdAt || 0);
  const rightTime = Number(right.createdAt || 0);
  if (leftTime !== rightTime) {
    if (!leftTime) return 1;
    if (!rightTime) return -1;
    return direction * (leftTime - rightTime);
  }
  const leftId = Number(left.productId);
  const rightId = Number(right.productId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return direction * (leftId - rightId);
  }
  return compareByName(left, right);
};

export const sortImageImportRows = (rows = [], sort = 'newest') => {
  const sorted = [...rows];
  if (sort === 'name') return sorted.sort(compareByName);
  const direction = sort === 'oldest' ? 1 : -1;
  return sorted.sort((left, right) => compareByCreated(left, right, direction));
};

export const selectImageImportBatch = (rows = [], {
  filters = DEFAULT_IMAGE_IMPORT_FILTERS,
  sort = 'newest',
  limit = null,
  now = Date.now(),
} = {}) => {
  const searchable = rows.filter((row) => (
    IMAGE_IMPORT_SEARCHABLE_STATUSES.includes(row.status)
    && matchesImageImportFilters(row, filters, now)
  ));
  const ordered = sortImageImportRows(searchable, sort);
  return limit ? ordered.slice(0, limit) : ordered;
};

// "Segura" = el codigo del producto aparece tal cual en Casa Alberto. El codigo
// recortado, el enlace guardado y el parecido por nombre siempre se revisan a mano.
export const isSafeImageImportMatch = (row = {}) => (
  row.status === 'found'
  && !row.approved
  && Boolean(row.imageDataUrl)
  && row.matchQuality === 'barcode_exact'
  && row.fallbackSearch !== 'trimmed_barcode'
);

export const getImageImportMatchLabel = (candidate = {}, row = {}) => {
  if (candidate.matchQuality === 'casa_alberto_link') {
    return {
      label: candidate.titleSimilarity ? `Enlace guardado · ${candidate.titleSimilarity}%` : 'Enlace guardado',
      tone: 'sky',
    };
  }
  if (candidate.matchQuality === 'title_similarity') {
    return {
      label: candidate.titleSimilarity ? `Por nombre · ${candidate.titleSimilarity}%` : 'Por nombre',
      tone: 'amber',
    };
  }
  if (row.fallbackSearch === 'trimmed_barcode') return { label: 'Código sin último dígito', tone: 'amber' };
  return { label: 'Código exacto', tone: 'emerald' };
};

export const getImageImportCategoryOptions = (rows = []) => {
  const counts = new Map();
  rows.forEach((row) => {
    (row.categories || []).forEach((category) => counts.set(category, (counts.get(category) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, 'es', { sensitivity: 'base' }));
};
