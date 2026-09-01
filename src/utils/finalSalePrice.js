const WEIGHT_PRICE_FACTOR = 1000;
const COMMERCIAL_ROUNDING_STEP = 10;

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

/**
 * Commercial sale prices never use cents. Calculations may keep their full
 * precision until this final boundary, where the value is rounded upward to
 * the next commercial multiple of ten pesos.
 */
export const normalizeFinalSalePrice = (value) =>
  Math.max(
    0,
    Math.ceil(toFiniteNumber(value) / COMMERCIAL_ROUNDING_STEP) * COMMERCIAL_ROUNDING_STEP,
  );

export const getVisibleProductSalePrice = (storedPrice, productType = 'quantity') => (
  productType === 'weight'
    ? normalizeFinalSalePrice(toFiniteNumber(storedPrice) * WEIGHT_PRICE_FACTOR)
    : normalizeFinalSalePrice(storedPrice)
);

export const getStoredProductSalePrice = (visiblePrice, productType = 'quantity') => (
  productType === 'weight'
    ? normalizeFinalSalePrice(visiblePrice) / WEIGHT_PRICE_FACTOR
    : normalizeFinalSalePrice(visiblePrice)
);

export const normalizeStoredProductSalePrice = (storedPrice, productType = 'quantity') =>
  getStoredProductSalePrice(
    productType === 'weight' ? toFiniteNumber(storedPrice) * WEIGHT_PRICE_FACTOR : storedPrice,
    productType,
  );
