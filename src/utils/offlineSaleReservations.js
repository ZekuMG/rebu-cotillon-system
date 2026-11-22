import { isOfflineActionOpen } from './offlineActionQueue.js';

export const getPendingOfflineSales = (entries) => entries
  .filter((entry) => entry.type === 'offlineSale' && isOfflineActionOpen(entry))
  .map((entry) => entry.args[0]);

export const buildOfflineReservedStockDelta = (entries, currentDelta) => {
  const total = {};
  for (const delta of [...getPendingOfflineSales(entries).map((attempt) => attempt.request.stockDeltaByProduct || {}), currentDelta]) {
    for (const [id, quantity] of Object.entries(delta)) total[id] = (total[id] || 0) + Number(quantity);
  }
  return total;
};

export const getLatestOfflineClientAttempt = (entries, clientId) => clientId == null ? null
  : getPendingOfflineSales(entries).filter((attempt) => String(attempt.request.salePayload.client_id) === String(clientId)).at(-1) || null;

export const getLatestOfflineCouponUpdate = (entries, clientId) => clientId == null ? null
  : getPendingOfflineSales(entries).filter((attempt) => String(attempt.request.salePayload.client_id) === String(clientId) && attempt.couponUpdate).at(-1)?.couponUpdate || null;

export const hasPendingOfflineCoupon = (entries, clientId, codes) => clientId != null && codes.length > 0
  && getPendingOfflineSales(entries).some((attempt) => String(attempt.request.salePayload.client_id) === String(clientId)
    && ([...(attempt.logDetails?.couponCodes || []), ...(attempt.logDetails?.items || []).map((item) => item.couponCode || '')]
      .some((code) => codes.includes(String(code).toUpperCase()))));
