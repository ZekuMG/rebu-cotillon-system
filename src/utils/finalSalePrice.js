const WEIGHT_PRICE_FACTOR = 1000;
const COMMERCIAL_ROUNDING_STEP = 10;
const FLOAT_NOISE = 1e-6;
// Cuanto puede estar un precio por encima del escalon y aun asi bajar a el.
const DOWNWARD_TOLERANCE = 2;

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

/**
 * Commercial sale prices never use cents. Calculations may keep their full
 * precision until this final boundary, where the value is rounded upward to
 * the next commercial multiple of ten pesos.
 */
export const normalizeFinalSalePrice = (value) => {
  const monto = toFiniteNumber(value);
  if (monto <= 0) return 0;

  const escalon = Math.floor(monto / COMMERCIAL_ROUNDING_STEP) * COMMERCIAL_ROUNDING_STEP;
  const resto = monto - escalon;

  // Hasta $2 por encima del escalon se baja (3501 y 3502 quedan en 3500); de
  // ahi para arriba se sube (3503 va a 3510). El FLOAT_NOISE cubre la coma
  // flotante: 8.06 * 1000 da 8060.000000000001 y 3200 * 1.094 da
  // 3500.0000000000005, valores que ya estaban justos y no deben moverse.
  return resto <= DOWNWARD_TOLERANCE + FLOAT_NOISE
    ? escalon
    : escalon + COMMERCIAL_ROUNDING_STEP;
};

/**
 * Aumento (o descuento) por porcentaje sobre un precio de venta ya visible.
 * Devuelve el MISMO valor que va a quedar guardado: si el porcentaje cae entre
 * dos escalones comerciales, sube al siguiente multiplo de diez. Antes el
 * editor masivo mostraba `Math.round`, asi que la grilla decia un numero y la
 * base guardaba otro.
 */
export const applyPercentageToSalePrice = (visiblePrice, percentage) =>
  normalizeFinalSalePrice(toFiniteNumber(visiblePrice) * (1 + (toFiniteNumber(percentage) / 100)));

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
