export const SUPPLIER_CALCULATION_MODE_UNITS = 'units';
export const SUPPLIER_CALCULATION_MODE_WEIGHT = 'weight';

export const normalizeSupplierCalculationMode = (value, fallback = SUPPLIER_CALCULATION_MODE_UNITS) => (
  value === SUPPLIER_CALCULATION_MODE_WEIGHT
    ? SUPPLIER_CALCULATION_MODE_WEIGHT
    : value === SUPPLIER_CALCULATION_MODE_UNITS
      ? SUPPLIER_CALCULATION_MODE_UNITS
      : fallback
);

export const normalizeSupplierWeightGrams = (value, fallback = 1000) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallback;
  return Math.max(1, Math.round(numericValue));
};

export const calculateSupplierComparablePrice = ({
  rawSupplierPrice = 0,
  calculationMode = SUPPLIER_CALCULATION_MODE_UNITS,
  unitDivisor = 1,
  supplierWeightGrams = 1000,
} = {}) => {
  const rawPrice = Number(rawSupplierPrice);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;

  if (normalizeSupplierCalculationMode(calculationMode) === SUPPLIER_CALCULATION_MODE_WEIGHT) {
    const weightGrams = normalizeSupplierWeightGrams(supplierWeightGrams);
    return Number(((rawPrice * 1000) / weightGrams).toFixed(2));
  }

  const divisor = Number(unitDivisor);
  const safeDivisor = Number.isFinite(divisor) && divisor > 0 ? Math.max(1, Math.round(divisor)) : 1;
  return Number((rawPrice / safeDivisor).toFixed(2));
};
