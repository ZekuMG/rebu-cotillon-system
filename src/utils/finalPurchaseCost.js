const WEIGHT_COST_FACTOR = 1000;

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

/**
 * Product costs are finalized in whole pesos, rounded upward. Calculations may
 * keep their full precision until this boundary.
 */
export const normalizeFinalPurchaseCost = (value) =>
  Math.max(0, Math.ceil(toFiniteNumber(value)));

export const getVisibleProductPurchaseCost = (storedCost, productType = 'quantity') => (
  productType === 'weight'
    ? normalizeFinalPurchaseCost(toFiniteNumber(storedCost) * WEIGHT_COST_FACTOR)
    : normalizeFinalPurchaseCost(storedCost)
);

export const getStoredProductPurchaseCost = (visibleCost, productType = 'quantity') => (
  productType === 'weight'
    ? normalizeFinalPurchaseCost(visibleCost) / WEIGHT_COST_FACTOR
    : normalizeFinalPurchaseCost(visibleCost)
);

export const normalizeStoredProductPurchaseCost = (storedCost, productType = 'quantity') =>
  getStoredProductPurchaseCost(
    productType === 'weight' ? toFiniteNumber(storedCost) * WEIGHT_COST_FACTOR : storedCost,
    productType,
  );
