const WEIGHT_COST_FACTOR = 1000;
const FLOAT_NOISE = 1e-6;

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

/**
 * Product costs are finalized in whole pesos, rounded upward. Calculations may
 * keep their full precision until this boundary.
 */
export const normalizeFinalPurchaseCost = (value) =>
  // Mismo motivo que en finalSalePrice: 8.06 * 1000 = 8060.000000000001 y un
  // `ceil` seco lo convertia en 8061. La base es `numeric` y no redondea asi.
  Math.max(0, Math.ceil(toFiniteNumber(value) - FLOAT_NOISE));

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
