const HISTORY_DATABASE_NAME = 'rebu-offline-history';
const HISTORY_DATABASE_VERSION = 1;
const HISTORY_SNAPSHOT_STORE = 'snapshots';
const FULL_TRANSACTIONS_KEY = 'transactions-full';

export const TRANSACTION_HISTORY_CACHE_VERSION = 1;
export const TRANSACTION_HISTORY_MAX_TRUST_AGE_MS = 24 * 60 * 60 * 1000;
export const RECENT_TRANSACTION_SNAPSHOT_LIMIT = 200;

let historyDatabasePromise = null;

const getIndexedDbFactory = () => globalThis?.indexedDB || null;

const openHistoryDatabase = () => {
  const indexedDb = getIndexedDbFactory();
  if (!indexedDb) return Promise.resolve(null);
  if (historyDatabasePromise) return historyDatabasePromise;

  historyDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(HISTORY_DATABASE_NAME, HISTORY_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HISTORY_SNAPSHOT_STORE)) {
        database.createObjectStore(HISTORY_SNAPSHOT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el historial local.'));
    request.onblocked = () => reject(new Error('El historial local esta bloqueado por otra ventana.'));
  }).catch((error) => {
    historyDatabasePromise = null;
    throw error;
  });

  return historyDatabasePromise;
};

const runSnapshotRequest = async (mode, operation) => {
  const database = await openHistoryDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(HISTORY_SNAPSHOT_STORE, mode);
    const store = transaction.objectStore(HISTORY_SNAPSHOT_STORE);
    let result = null;

    try {
      const request = operation(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error || new Error('Fallo una operacion del historial local.'));
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo actualizar el historial local.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se cancelo la actualizacion del historial local.'));
  });
};

export const normalizeTransactionHistorySnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.transactions)) return null;
  if (snapshot.transactionsScope !== 'full') return null;

  const savedAt = String(snapshot.savedAt || '').trim();
  if (!savedAt || Number.isNaN(Date.parse(savedAt))) return null;

  return {
    savedAt,
    transactions: snapshot.transactions,
    transactionsScope: 'full',
  };
};

export const normalizeStoredTransactionHistorySnapshot = (record) => {
  if (Number(record?.cacheVersion) !== TRANSACTION_HISTORY_CACHE_VERSION) return null;
  return normalizeTransactionHistorySnapshot(record);
};

export const isTransactionHistorySnapshotFresh = (
  snapshot,
  { now = Date.now(), maxAgeMs = TRANSACTION_HISTORY_MAX_TRUST_AGE_MS } = {},
) => {
  const normalized = normalizeTransactionHistorySnapshot(snapshot);
  if (!normalized) return false;
  const age = Number(now) - Date.parse(normalized.savedAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
};

export const loadTransactionHistorySnapshot = async () => {
  const record = await runSnapshotRequest('readonly', (store) => store.get(FULL_TRANSACTIONS_KEY));
  return normalizeStoredTransactionHistorySnapshot(record);
};

export const saveTransactionHistorySnapshot = async (snapshot) => {
  const normalized = normalizeTransactionHistorySnapshot(snapshot);
  if (!normalized) return false;

  const result = await runSnapshotRequest('readwrite', (store) => store.put({
    key: FULL_TRANSACTIONS_KEY,
    cacheVersion: TRANSACTION_HISTORY_CACHE_VERSION,
    ...normalized,
  }));
  return result !== null;
};

export const buildRecentTransactionSnapshot = (
  snapshot,
  { maxTransactions = RECENT_TRANSACTION_SNAPSHOT_LIMIT } = {},
) => {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.transactions)) return null;
  const normalizedLimit = Math.max(0, Number(maxTransactions) || 0);

  return {
    ...snapshot,
    transactions: snapshot.transactions.slice(0, normalizedLimit),
    // El historial completo vive en IndexedDB; localStorage solo acelera el primer render.
    transactionsScope: 'partial',
  };
};

const scheduleDuringIdle = (task, { timeoutMs = 1500 } = {}) => {
  if (typeof globalThis.requestIdleCallback === 'function') {
    return globalThis.requestIdleCallback(() => task(), { timeout: timeoutMs });
  }
  return globalThis.setTimeout(task, 0);
};

export const createTransactionSnapshotPersistence = ({
  saveFullSnapshot = saveTransactionHistorySnapshot,
  saveRecentSnapshot,
  saveFallbackSnapshot = saveRecentSnapshot,
  scheduleTask = scheduleDuringIdle,
  maxRecentTransactions = RECENT_TRANSACTION_SNAPSHOT_LIMIT,
} = {}) => {
  if (typeof saveRecentSnapshot !== 'function') {
    throw new TypeError('saveRecentSnapshot debe ser una funcion.');
  }

  let pendingSnapshot = null;
  let isScheduled = false;
  let isSaving = false;

  const requestFlush = () => {
    if (isScheduled || isSaving || !pendingSnapshot) return;
    isScheduled = true;
    scheduleTask(async () => {
      isScheduled = false;
      try {
        return await flush();
      } catch (error) {
        console.warn('No se pudo actualizar la copia local de transacciones:', error);
        return false;
      }
    });
  };

  const flush = async () => {
    if (isSaving || !pendingSnapshot) return false;

    isSaving = true;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;

    try {
      const recentSnapshot = buildRecentTransactionSnapshot(snapshot, {
        maxTransactions: maxRecentTransactions,
      });
      if (recentSnapshot) saveRecentSnapshot(recentSnapshot);

      if (snapshot.transactionsScope === 'full' && typeof saveFullSnapshot === 'function') {
        let savedInIndexedDb = false;
        try {
          savedInIndexedDb = await saveFullSnapshot(snapshot);
        } catch (error) {
          console.warn('No se pudo guardar el historial completo en IndexedDB:', error);
        }

        if (!savedInIndexedDb && typeof saveFallbackSnapshot === 'function') {
          saveFallbackSnapshot(snapshot);
        }
      }

      return true;
    } finally {
      isSaving = false;
      requestFlush();
    }
  };

  return {
    schedule(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.transactions)) return;
      pendingSnapshot = snapshot;
      requestFlush();
    },
    flush,
  };
};
