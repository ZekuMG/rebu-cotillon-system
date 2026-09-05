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
 * Como se redondea el precio final. El escalon de $10 con tolerancia hacia abajo
 * es el de siempre; el de centena hacia arriba sirve para listas donde se quiere
 * todo en numeros redondos y nunca por debajo del calculo.
 */
export const SALE_ROUNDING_MODES = Object.freeze({
  decena: { step: 10, alwaysUp: false, label: 'Decena', hint: 'A $10. Hasta $2 por encima baja (3501 y 3502 -> 3500).' },
  centena: { step: 100, alwaysUp: false, label: 'Centena', hint: 'A $100. Hasta $2 por encima baja (3501 -> 3500).' },
  centenaArriba: { step: 100, alwaysUp: true, label: 'Centena ↑', hint: 'A $100 SIEMPRE para arriba (3501 -> 3600).' },
});

export const DEFAULT_SALE_ROUNDING_MODE = 'decena';

export const normalizeSaleRoundingMode = (mode) => (
  Object.prototype.hasOwnProperty.call(SALE_ROUNDING_MODES, String(mode || ''))
    ? String(mode)
    : DEFAULT_SALE_ROUNDING_MODE
);

/**
 * Commercial sale prices never use cents. Calculations may keep their full
 * precision until this final boundary, where the value is rounded to the
 * commercial step configured for the context.
 */
export const normalizeFinalSalePrice = (value, mode = DEFAULT_SALE_ROUNDING_MODE) => {
  const monto = toFiniteNumber(value);
  if (monto <= 0) return 0;

  const { step, alwaysUp } = SALE_ROUNDING_MODES[normalizeSaleRoundingMode(mode)];
  const escalon = Math.floor(monto / step) * step;
  const resto = monto - escalon;

  // Un valor que ya cae justo en el escalon no se mueve NUNCA, ni siquiera en
  // modo "siempre para arriba": 3600 tiene que quedar en 3600, no saltar a 3700.
  if (resto <= FLOAT_NOISE) return escalon;
  if (alwaysUp) return escalon + step;

  // Hasta $2 por encima del escalon se baja (3501 y 3502 quedan en 3500); de
  // ahi para arriba se sube (3503 va a 3510). El FLOAT_NOISE cubre la coma
  // flotante: 8.06 * 1000 da 8060.000000000001 y 3200 * 1.094 da
  // 3500.0000000000005, valores que ya estaban justos y no deben moverse.
  return resto <= DOWNWARD_TOLERANCE + FLOAT_NOISE ? escalon : escalon + step;
};

/**
 * Aumento (o descuento) por porcentaje sobre un precio de venta ya visible.
 * Devuelve el MISMO valor que va a quedar guardado: si el porcentaje cae entre
 * dos escalones comerciales, sube al siguiente multiplo de diez. Antes el
 * editor masivo mostraba `Math.round`, asi que la grilla decia un numero y la
 * base guardaba otro.
 */
export const applyPercentageToSalePrice = (visiblePrice, percentage, mode = DEFAULT_SALE_ROUNDING_MODE) =>
  normalizeFinalSalePrice(toFiniteNumber(visiblePrice) * (1 + (toFiniteNumber(percentage) / 100)), mode);

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
