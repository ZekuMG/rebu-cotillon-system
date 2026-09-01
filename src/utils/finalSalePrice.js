const WEIGHT_PRICE_FACTOR = 1000;
const COMMERCIAL_ROUNDING_STEP = 10;
const FLOAT_NOISE = 1e-6;

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
  // El `- FLOAT_NOISE` no es cosmetico: 8.06 * 1000 da 8060.000000000001 en
  // coma flotante y 3500 * 1.094 da 3500.0000000000005, asi que un `ceil` seco
  // empujaba al escalon siguiente ($8.070, $3.510) sobre valores que ya estaban
  // justos. La base guarda `numeric` (exacto) y no hace eso: sin esto la app
  // muestra un precio distinto del que queda guardado.
  const steps = Math.ceil((toFiniteNumber(value) / COMMERCIAL_ROUNDING_STEP) - FLOAT_NOISE);
  return Math.max(0, steps * COMMERCIAL_ROUNDING_STEP);
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
