import { getProductActiveState, productHasCasaAlbertoLink } from './productLifecycle.js';

export const SUPPLIER_LINK_SUGGESTION_STATUS_PENDING = 'pending';
export const SUPPLIER_LINK_SUGGESTION_STATUS_DISMISSED = 'dismissed';

// Solo estos campos del resultado de busqueda se guardan. El resto de lo que
// devuelve el scraping no lo usa la pantalla y engordaria la tabla al pedo.
const PERSISTED_RESULT_FIELDS = [
  'casaAlbertoId',
  'estimatedCost',
  'foundTitle',
  'imageUrl',
  'priceText',
  'productUrl',
  'rawSupplierPrice',
  'searchedQuery',
  'sourceUrl',
  'supplierCode',
  'supplierPrice',
  'titleSimilarity',
  'unitDivisor',
  'unitSupplierPrice',
];

const toTrimmedString = (value) => String(value ?? '').trim();

export const getSupplierLinkSuggestionKey = (suggestion = {}) => {
  const productId = toTrimmedString(suggestion?.product?.id ?? suggestion?.productId);
  const casaAlbertoId = toTrimmedString(
    suggestion?.result?.casaAlbertoId ?? suggestion?.casaAlbertoId,
  );
  return productId && casaAlbertoId ? `${productId}:${casaAlbertoId}` : '';
};

export const upsertSupplierLinkSuggestion = (suggestions = [], suggestion = null) => {
  if (!suggestion?.product?.id || !suggestion?.result) return Array.isArray(suggestions) ? suggestions : [];

  const current = Array.isArray(suggestions) ? suggestions : [];
  const productId = String(suggestion.product.id);
  const casaAlbertoId = String(suggestion.result.casaAlbertoId || '');
  const existingIndex = current.findIndex((entry) => (
    String(entry?.product?.id || '') === productId
    && String(entry?.result?.casaAlbertoId || '') === casaAlbertoId
  ));

  if (existingIndex === -1) return [...current, suggestion];

  const next = [...current];
  next[existingIndex] = suggestion;
  return next;
};

export const getVisibleSupplierLinkSuggestions = (suggestions = [], limit = 20) => (
  (Array.isArray(suggestions) ? suggestions : []).slice(0, Math.max(0, Number(limit) || 0))
);

/** Sugerencia en memoria -> fila lista para guardar. Devuelve null si no sirve. */
export const buildSupplierLinkSuggestionRow = (suggestion = {}) => {
  const productId = Number(suggestion?.product?.id);
  const casaAlbertoId = toTrimmedString(suggestion?.result?.casaAlbertoId);
  if (!Number.isFinite(productId) || productId <= 0 || !casaAlbertoId) return null;

  // Un 0 o un texto vacio no aportan nada: al leerlos de vuelta el codigo los
  // trata igual que si no estuvieran (`Number(x || 0)`), asi que no se guardan.
  const payload = {};
  for (const field of PERSISTED_RESULT_FIELDS) {
    const value = suggestion?.result?.[field];
    if (value === undefined || value === null || value === '' || value === 0) continue;
    payload[field] = typeof value === 'number' ? value : String(value);
  }
  payload.casaAlbertoId = casaAlbertoId;

  return {
    product_id: productId,
    casa_alberto_id: casaAlbertoId,
    matched_by: toTrimmedString(suggestion?.matchedBy) || 'title_search',
    status: SUPPLIER_LINK_SUGGESTION_STATUS_PENDING,
    payload,
  };
};

/** Fila guardada -> sugerencia con su producto. Devuelve null si el producto ya no aplica. */
export const parseSupplierLinkSuggestionRow = (row = {}, productsById = new Map()) => {
  const productId = toTrimmedString(row?.product_id);
  const casaAlbertoId = toTrimmedString(row?.casa_alberto_id);
  if (!productId || !casaAlbertoId) return null;

  const product = productsById instanceof Map
    ? productsById.get(productId)
    : productsById?.[productId];
  if (!product) return null;

  const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : {};

  return {
    product,
    result: { ...payload, casaAlbertoId },
    matchedBy: toTrimmedString(row?.matched_by) || 'title_search',
    createdAt: Date.parse(row?.created_at || '') || Date.now(),
    persisted: true,
  };
};

/**
 * Una sugerencia guardada deja de valer si el producto se borro, se desactivo o
 * ya quedo enlazado por otro camino. Se filtran al cargar para no mostrar
 * fantasmas de corridas viejas.
 */
export const filterLiveSupplierLinkSuggestions = (suggestions = []) => (
  (Array.isArray(suggestions) ? suggestions : []).filter((suggestion) => {
    const product = suggestion?.product;
    if (!product) return false;
    if (productHasCasaAlbertoLink(product)) return false;
    return getProductActiveState(product);
  })
);

/** Filas guardadas -> sugerencias vivas, sin duplicados y ordenadas por antiguedad. */
export const buildSupplierLinkSuggestionsFromRows = (rows = [], productsById = new Map()) => {
  const seen = new Set();
  const parsed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (toTrimmedString(row?.status) === SUPPLIER_LINK_SUGGESTION_STATUS_DISMISSED) continue;
    const suggestion = parseSupplierLinkSuggestionRow(row, productsById);
    if (!suggestion) continue;
    const key = getSupplierLinkSuggestionKey(suggestion);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push(suggestion);
  }
  return filterLiveSupplierLinkSuggestions(parsed)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
};

/**
 * Productos que ya tienen una sugerencia guardada (pendiente o descartada): no
 * hay que volver a consultarlos al proveedor. Lo pendiente ya esta en pantalla y
 * lo descartado se descarto a proposito.
 */
export const getSupplierLinkSuggestionProductIds = (rows = []) => {
  const ids = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const productId = toTrimmedString(row?.product_id);
    if (productId) ids.add(productId);
  }
  return ids;
};
