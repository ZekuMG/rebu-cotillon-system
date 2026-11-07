import { previewStock } from './stock.js';

export const PENDING_PREFIX = 'rebu-stock-operation-v2:';
const LEGACY_KEY = 'rebu-stock-pending-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validPending(value, userId) {
  if (!value || value.userId !== userId || !uuid.test(value.id || '') || !/^\d+$/.test(String(value.product?.id || '')) || typeof value.reason !== 'string' || value.reason.trim().length < 3 || value.reason.length > 300) return false;
  try {
    const preview = previewStock(value.product, value.mode, String(value.quantity));
    return preview.before === value.before && preview.after === value.after;
  } catch { return false; }
}
export function persistPending(operation, storage) {
  storage ||= globalThis.localStorage;
  if (!validPending(operation, operation.userId)) throw new Error('El movimiento pendiente no es válido.');
  const key = `${PENDING_PREFIX}${operation.userId}:${operation.id}`;
  storage.setItem(key, JSON.stringify(operation));
  if (storage.getItem(key) !== JSON.stringify(operation)) throw new Error('No se pudo conservar la confirmación pendiente.');
}
export function readPending(userId, storage, legacy) {
  try {
    storage ||= globalThis.localStorage;
    legacy ||= globalThis.sessionStorage;
    try {
      const old = JSON.parse(legacy.getItem(LEGACY_KEY));
      if (validPending(old, userId)) { persistPending(old, storage); legacy.removeItem(LEGACY_KEY); }
    } catch { /* A corrupt legacy entry must not hide valid durable receipts. */ }
    const entries = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(`${PENDING_PREFIX}${userId}:`)) continue;
      try { const entry = JSON.parse(storage.getItem(key)); if (validPending(entry, userId)) entries.push(entry); } catch { /* Ignore malformed local data, never send it. */ }
    }
    return entries.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0] || null;
  } catch { return null; }
}
export function clearPending(operation, storage) {
  storage ||= globalThis.localStorage;
  storage.removeItem(`${PENDING_PREFIX}${operation.userId}:${operation.id}`);
}
