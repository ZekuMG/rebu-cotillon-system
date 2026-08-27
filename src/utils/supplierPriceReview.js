import {
  buildCasaAlbertoEstimatedCost,
  buildCasaAlbertoGroupKey,
  getCasaAlbertoLink,
  getCasaAlbertoPriceTracking,
  getProductActiveState,
  productHasCasaAlbertoLink,
} from './productLifecycle.js';

const COST_EPSILON = 0.01;
const NOTICE_DISMISS_STORAGE_PREFIX = 'rebu_supplier_notice_dismissed_v1';
const ERROR_STATUSES = new Set(['error', 'login_required']);
const ATTENTION_STATUSES = new Set([
  'changed',
  'price_down',
  'review_required',
  'dubious_link',
  'suggested_link',
  ...ERROR_STATUSES,
]);
const ARCHIVED_STATUSES = new Set(['approved', 'ignored', 'reviewed']);

export const normalizeSupplierReviewStatus = (status) =>
  String(status || '').trim().toLowerCase();

const getSupplierNoticeUserScope = (user = {}) =>
  String(
    typeof user === 'string'
      ? user
      : user?.id || user?.authUserId || user?.auth_user_id || user?.username || user?.name || ''
  ).trim();

export const getSupplierNoticeDismissStorageKey = (user = {}) => {
  const scope = getSupplierNoticeUserScope(user);
  return scope ? `${NOTICE_DISMISS_STORAGE_PREFIX}:${scope}` : '';
};

const resolveNoticeStorage = (storage) => {
  if (storage) return storage;
  try {
    return globalThis?.localStorage;
  } catch {
    return null;
  }
};

export const loadSupplierNoticeDismissal = (user = {}, storage) => {
  const storageKey = getSupplierNoticeDismissStorageKey(user);
  if (!storageKey) return '';
  try {
    return String(resolveNoticeStorage(storage)?.getItem?.(storageKey) || '');
  } catch {
    return '';
  }
};

export const saveSupplierNoticeDismissal = (user = {}, noticeKey = '', storage) => {
  const storageKey = getSupplierNoticeDismissStorageKey(user);
  if (!storageKey || !noticeKey) return false;
  try {
    const targetStorage = resolveNoticeStorage(storage);
    if (typeof targetStorage?.setItem !== 'function') return false;
    targetStorage.setItem(storageKey, String(noticeKey));
    return true;
  } catch {
    return false;
  }
};

export const isSupplierPriceErrorStatus = (status) =>
  ERROR_STATUSES.has(normalizeSupplierReviewStatus(status));

export const isSupplierPriceAttentionStatus = (status) =>
  ATTENTION_STATUSES.has(normalizeSupplierReviewStatus(status));

export const isSupplierPriceArchivedStatus = (status) =>
  ARCHIVED_STATUSES.has(normalizeSupplierReviewStatus(status));

export const matchesSupplierPriceFilter = (status, filter) => {
  const normalizedStatus = normalizeSupplierReviewStatus(status) || 'unchecked';
  const normalizedFilter = String(filter || 'attention').trim().toLowerCase();

  if (normalizedFilter === 'all' || normalizedFilter === 'selected') return true;
  if (normalizedFilter === 'attention') return isSupplierPriceAttentionStatus(normalizedStatus);
  if (normalizedFilter === 'error') return isSupplierPriceErrorStatus(normalizedStatus);
  if (normalizedFilter === 'archive') return isSupplierPriceArchivedStatus(normalizedStatus);
  if (normalizedFilter === 'notice') {
    return ['price_down', 'review_required', 'dubious_link', 'suggested_link'].includes(normalizedStatus);
  }
  return normalizedStatus === normalizedFilter;
};

export const getSupplierProductReviewState = (product = {}) => {
  if (!getProductActiveState(product) || !productHasCasaAlbertoLink(product)) return 'unlinked';

  const tracking = getCasaAlbertoPriceTracking(product);
  const storedStatus = normalizeSupplierReviewStatus(tracking.reviewStatus);
  if (isSupplierPriceErrorStatus(storedStatus)) return storedStatus;

  // Ignorar es una decisión explícita que permanece válida hasta que un nuevo
  // chequeo guarde otro estado para este producto.
  if (storedStatus === 'ignored') return 'ignored';

  const supplierPrice = Number(tracking.lastSupplierPrice || 0);
  const rawSupplierPrice = Number(tracking.rawSupplierPrice ?? supplierPrice ?? 0) || supplierPrice;
  const divisorCandidate = Number(tracking.unitDivisor || 1);
  const unitDivisor = Number.isFinite(divisorCandidate) && divisorCandidate > 0
    ? Math.max(1, Math.round(divisorCandidate))
    : 1;
  const unitSupplierPrice = Number(tracking.unitSupplierPrice || 0) ||
    (rawSupplierPrice > 0 ? rawSupplierPrice / unitDivisor : supplierPrice);
  const estimatedCost = Number(tracking.estimatedCost || tracking.approvedCost || 0) ||
    buildCasaAlbertoEstimatedCost(unitSupplierPrice, {
      costExtraRate: tracking.costExtraRate,
    });
  const currentCost = Number(product.purchasePrice ?? product.purchase_price ?? 0);
  const hasComparableCosts = Number.isFinite(estimatedCost) && estimatedCost > 0 && Number.isFinite(currentCost);

  // Una diferencia real siempre vuelve a abrir la revisión, salvo que haya sido
  // ignorada expresamente. Esto también repara estados antiguos inconsistentes.
  if (hasComparableCosts && estimatedCost - currentCost >= COST_EPSILON) return 'changed';
  if (hasComparableCosts && currentCost - estimatedCost >= COST_EPSILON) return 'price_down';

  if (storedStatus === 'approved' || tracking.approvedAt) return 'approved';
  if (['review_required', 'dubious_link', 'suggested_link'].includes(storedStatus)) return storedStatus;
  if (tracking.lastCheckedAt || storedStatus === 'reviewed') return 'reviewed';
  return 'unchecked';
};

const REVIEW_STATUS_PRIORITY = Object.freeze({
  login_required: 0,
  error: 1,
  changed: 2,
  price_down: 3,
  review_required: 4,
  dubious_link: 5,
  suggested_link: 6,
  unchecked: 7,
  approved: 8,
  ignored: 9,
  reviewed: 10,
  unlinked: 11,
});

const pickHigherPriorityStatus = (currentStatus, nextStatus) => {
  if (!currentStatus) return nextStatus;
  return (REVIEW_STATUS_PRIORITY[nextStatus] ?? 99) < (REVIEW_STATUS_PRIORITY[currentStatus] ?? 99)
    ? nextStatus
    : currentStatus;
};

const hashNoticeSignature = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const buildSupplierAttentionSummary = (products = []) => {
  const groups = new Map();

  (Array.isArray(products) ? products : [])
    .filter(getProductActiveState)
    .filter(productHasCasaAlbertoLink)
    .forEach((product) => {
      const groupKey = buildCasaAlbertoGroupKey(product);
      const link = getCasaAlbertoLink(product);
      const tracking = getCasaAlbertoPriceTracking(product);
      const status = getSupplierProductReviewState(product);
      const signature = [
        product.id,
        status,
        tracking.lastSupplierPrice,
        tracking.unitSupplierPrice,
        tracking.estimatedCost,
        product.purchasePrice ?? product.purchase_price,
        tracking.lastCheckedAt,
        link.casaAlbertoId || link.providerCode || link.productUrl,
      ].join(':');
      const previous = groups.get(groupKey);
      groups.set(groupKey, {
        status: pickHigherPriorityStatus(previous?.status, status),
        signatures: [...(previous?.signatures || []), signature],
      });
    });

  const actionableGroups = Array.from(groups.entries())
    .filter(([, group]) => isSupplierPriceAttentionStatus(group.status));
  const errors = actionableGroups.filter(([, group]) => isSupplierPriceErrorStatus(group.status)).length;
  const changes = actionableGroups.length - errors;
  const signature = actionableGroups
    .map(([groupKey, group]) => `${groupKey}:${group.status}:${group.signatures.sort().join(',')}`)
    .sort()
    .join('|');

  return {
    linked: groups.size,
    changes,
    errors,
    attention: actionableGroups.length,
    key: signature
      ? `${changes}-${errors}-${groups.size}-${hashNoticeSignature(signature)}`
      : 'clear',
  };
};
