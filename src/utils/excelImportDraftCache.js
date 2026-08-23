export const EXCEL_IMPORT_DRAFT_STORAGE_KEY = 'rebu_excel_import_draft_v2';
export const EXCEL_IMPORT_DRAFT_LEGACY_STORAGE_KEY = 'rebu_excel_import_draft_v1';
export const EXCEL_IMPORT_DRAFT_VERSION = 2;
export const EXCEL_IMPORT_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const MAX_CACHED_ROWS = 5000;
const LOCAL_STORAGE_ROW_LIMIT = 250;
const DB_NAME = 'rebu_excel_import_drafts';
const DB_STORE_NAME = 'drafts';
const DB_VERSION = 1;
const memoryDrafts = new Map();

const normalizeScope = (scope) => String(scope || '').trim().slice(0, 180);

export const getExcelImportDraftStorageKey = (scope) => {
  const normalizedScope = normalizeScope(scope);
  return normalizedScope
    ? `${EXCEL_IMPORT_DRAFT_STORAGE_KEY}:${encodeURIComponent(normalizedScope)}`
    : '';
};

const getCachedProduct = (product) => {
  if (!product || typeof product !== 'object') return null;
  return {
    id: product.id,
    title: product.title || '',
    barcode: product.barcode || '',
    category: product.category || '',
    stock: Number(product.stock || 0),
    purchasePrice: Number(product.purchasePrice || 0),
    price: Number(product.price || 0),
    product_type: product.product_type || 'unit',
    supplierLinks: product.supplierLinks || product.supplier_links || {},
    supplier_links: product.supplier_links || product.supplierLinks || {},
    isActive: product.isActive !== false && product.is_active !== false,
    is_active: product.isActive !== false && product.is_active !== false,
  };
};

const normalizeCachedRow = (row, index) => {
  if (!row || typeof row !== 'object' || !row.entry || typeof row.entry !== 'object') return null;
  return {
    ...row,
    id: String(row.id || `excel-cache-${index}`),
    entry: { ...row.entry },
    product: getCachedProduct(row.product),
    approvals: {
      stock: Boolean(row.approvals?.stock),
      cost: Boolean(row.approvals?.cost),
      price: Boolean(row.approvals?.price),
    },
    reviewedProductState:
      row.reviewedProductState && typeof row.reviewedProductState === 'object'
        ? { ...row.reviewedProductState }
        : null,
    reviewInvalidated: Boolean(row.reviewInvalidated),
    duplicateOptions: Array.isArray(row.duplicateOptions) ? row.duplicateOptions : null,
    errors: Array.isArray(row.errors) ? row.errors.map(String) : [],
  };
};

export const createExcelImportDraftSnapshot = (draft = {}, now = Date.now()) => ({
  version: EXCEL_IMPORT_DRAFT_VERSION,
  updatedAt: now,
  fileName: String(draft.fileName || '').slice(0, 260),
  rows: (Array.isArray(draft.rows) ? draft.rows : [])
    .slice(0, MAX_CACHED_ROWS)
    .map(normalizeCachedRow)
    .filter(Boolean),
  activeTargetBySource:
    draft.activeTargetBySource && typeof draft.activeTargetBySource === 'object'
      ? draft.activeTargetBySource
      : {},
  activeSourceRowId: String(draft.activeSourceRowId || ''),
  resultFilter: String(draft.resultFilter || 'all'),
  searchTerm: String(draft.searchTerm || '').slice(0, 200),
  lastApplyBatch:
    draft.lastApplyBatch && typeof draft.lastApplyBatch === 'object'
      ? draft.lastApplyBatch
      : null,
});

const normalizeDraft = (draft, now) => {
  const isExpired = now - Number(draft?.updatedAt || 0) > EXCEL_IMPORT_DRAFT_MAX_AGE_MS;
  if (
    draft?.version !== EXCEL_IMPORT_DRAFT_VERSION
    || isExpired
    || !Array.isArray(draft?.rows)
    || draft.rows.length === 0
    || draft.rows.length > MAX_CACHED_ROWS
  ) return null;

  const rows = draft.rows.map(normalizeCachedRow).filter(Boolean);
  if (rows.length === 0) return null;
  return {
    ...draft,
    rows,
    fileName: String(draft.fileName || '').slice(0, 260),
    activeTargetBySource:
      draft.activeTargetBySource && typeof draft.activeTargetBySource === 'object'
        ? draft.activeTargetBySource
        : {},
    activeSourceRowId: String(draft.activeSourceRowId || ''),
    resultFilter: String(draft.resultFilter || 'all'),
    searchTerm: String(draft.searchTerm || '').slice(0, 200),
    lastApplyBatch:
      draft.lastApplyBatch && typeof draft.lastApplyBatch === 'object'
        ? draft.lastApplyBatch
        : null,
  };
};

const removeStorageItem = (storage, key) => {
  try {
    if (key) storage?.removeItem?.(key);
  } catch {
    // El importador sigue funcionando aunque el almacenamiento local no este disponible.
  }
};

const openDraftDatabase = (indexedDB) => new Promise((resolve, reject) => {
  if (!indexedDB?.open) {
    reject(new Error('IndexedDB no disponible.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DB_STORE_NAME)) database.createObjectStore(DB_STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
  request.onblocked = () => reject(new Error('IndexedDB esta bloqueado por otra ventana.'));
});

const runDraftTransaction = async (indexedDB, mode, operation) => {
  const database = await openDraftDatabase(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE_NAME, mode);
      const store = transaction.objectStore(DB_STORE_NAME);
      let operationResult;
      transaction.oncomplete = () => resolve(operationResult);
      transaction.onerror = () => reject(transaction.error || new Error('Fallo IndexedDB.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB cancelo la operacion.'));
      operation(store, (value) => { operationResult = value; }, reject);
    });
  } finally {
    database.close();
  }
};

const readIndexedDraft = (indexedDB, key) => runDraftTransaction(indexedDB, 'readonly', (store, setResult, reject) => {
  const request = store.get(key);
  request.onsuccess = () => setResult(request.result || null);
  request.onerror = () => reject(request.error || new Error('No se pudo leer el borrador.'));
});

const writeIndexedDraftIfNewer = (indexedDB, key, snapshot) => runDraftTransaction(indexedDB, 'readwrite', (store, setResult, reject) => {
  const readRequest = store.get(key);
  readRequest.onerror = () => reject(readRequest.error || new Error('No se pudo comparar el borrador.'));
  readRequest.onsuccess = () => {
    const current = readRequest.result;
    if (Number(current?.updatedAt || 0) > Number(snapshot.updatedAt || 0)) {
      setResult(false);
      return;
    }
    const writeRequest = store.put(snapshot, key);
    writeRequest.onsuccess = () => setResult(true);
    writeRequest.onerror = () => reject(writeRequest.error || new Error('No se pudo guardar el borrador.'));
  };
});

const deleteIndexedDraft = (indexedDB, key) => runDraftTransaction(indexedDB, 'readwrite', (store, setResult, reject) => {
  const request = store.delete(key);
  request.onsuccess = () => setResult(true);
  request.onerror = () => reject(request.error || new Error('No se pudo eliminar el borrador.'));
});

const readLocalDraft = (storage, key) => {
  const raw = storage?.getItem?.(key);
  return raw ? JSON.parse(raw) : null;
};

const writeLocalDraftIfNewer = (storage, key, snapshot) => {
  const current = readLocalDraft(storage, key);
  if (Number(current?.updatedAt || 0) > Number(snapshot.updatedAt || 0)) return false;
  storage?.setItem?.(key, JSON.stringify(snapshot));
  return true;
};

export const clearExcelImportDraft = async ({ storage, indexedDB, scope } = {}) => {
  const key = getExcelImportDraftStorageKey(scope);
  if (key) memoryDrafts.delete(key);
  removeStorageItem(storage, EXCEL_IMPORT_DRAFT_LEGACY_STORAGE_KEY);
  removeStorageItem(storage, key);
  if (!key || !indexedDB) return;
  try {
    await deleteIndexedDraft(indexedDB, key);
  } catch {
    // El borrador local ya fue removido; no bloqueamos el flujo por IndexedDB.
  }
};

export const saveExcelImportDraft = async ({ storage, indexedDB, scope } = {}, draft, now = Date.now()) => {
  const key = getExcelImportDraftStorageKey(scope);
  removeStorageItem(storage, EXCEL_IMPORT_DRAFT_LEGACY_STORAGE_KEY);
  if (!key) return { success: false, reason: 'missing-scope' };
  if (!Array.isArray(draft?.rows) || draft.rows.length === 0) {
    await clearExcelImportDraft({ storage, indexedDB, scope });
    return { success: true, backend: 'cleared' };
  }

  const snapshot = createExcelImportDraftSnapshot(draft, now);
  memoryDrafts.set(key, snapshot);
  let localStorageSaved = false;
  let localStorageError = null;
  if (snapshot.rows.length <= LOCAL_STORAGE_ROW_LIMIT) {
    try {
      writeLocalDraftIfNewer(storage, key, snapshot);
      localStorageSaved = true;
    } catch (error) {
      localStorageError = error;
    }
  } else {
    removeStorageItem(storage, key);
  }

  if (indexedDB) {
    try {
      await writeIndexedDraftIfNewer(indexedDB, key, snapshot);
      return { success: true, backend: 'indexeddb' };
    } catch {
      // El respaldo local ya se intento de forma sincronica.
    }
  }

  if (localStorageSaved) {
    return { success: true, backend: 'localstorage' };
  }
  return { success: false, reason: 'storage-unavailable', error: localStorageError };
};

export const loadExcelImportDraft = async ({ storage, indexedDB, scope } = {}, now = Date.now()) => {
  const key = getExcelImportDraftStorageKey(scope);
  removeStorageItem(storage, EXCEL_IMPORT_DRAFT_LEGACY_STORAGE_KEY);
  if (!key) return null;

  let rawDraft = memoryDrafts.get(key) || null;
  if (!rawDraft && indexedDB) {
    try {
      rawDraft = await readIndexedDraft(indexedDB, key);
    } catch {
      // Se intenta el respaldo local.
    }
  }

  if (!rawDraft) {
    try {
      rawDraft = readLocalDraft(storage, key);
    } catch {
      removeStorageItem(storage, key);
      return null;
    }
  }
  if (!rawDraft) return null;

  const draft = normalizeDraft(rawDraft, now);
  if (!draft) {
    await clearExcelImportDraft({ storage, indexedDB, scope });
    return null;
  }
  memoryDrafts.set(key, draft);
  return draft;
};
