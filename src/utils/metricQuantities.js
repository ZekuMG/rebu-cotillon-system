// Cantidades de Métricas: los productos por peso guardan la cantidad en GRAMOS,
// así que nunca se pueden sumar con las unidades. Todo total lleva las dos por separado.
import { formatNumber } from './helpers.js';

// Mismos umbrales que la pantalla de venta (POSView: rojo con 200 g o 5 u.).
export const LOW_STOCK_GRAMS = 200;
export const LOW_STOCK_UNITS = 10;

const toNumber = (value) => Number(value) || 0;

export const isWeightType = (productType) => productType === 'weight';

export const emptyQuantity = () => ({ units: 0, grams: 0 });

export const addQuantity = (total = emptyQuantity(), qty = 0, productType = 'quantity') => (
  isWeightType(productType)
    ? { units: toNumber(total.units), grams: toNumber(total.grams) + toNumber(qty) }
    : { units: toNumber(total.units) + toNumber(qty), grams: toNumber(total.grams) }
);

export const mergeQuantity = (a = emptyQuantity(), b = emptyQuantity()) => ({
  units: toNumber(a.units) + toNumber(b.units),
  grams: toNumber(a.grams) + toNumber(b.grams),
});

const trimDecimals = (value, maxDecimals) => {
  const rounded = Number(value.toFixed(maxDecimals));
  const decimals = Number.isInteger(rounded) ? 0 : String(rounded).split('.')[1].length;
  return formatNumber(rounded, Math.min(decimals, maxDecimals));
};

export const formatGrams = (grams = 0) => {
  const g = toNumber(grams);
  if (Math.abs(g) < 1000) return `${formatNumber(Math.round(g))} g`;
  return `${trimDecimals(g / 1000, 2)} kg`;
};

export const formatUnits = (units = 0) => `${formatNumber(toNumber(units))} u.`;

export const formatQuantityForType = (qty = 0, productType = 'quantity') =>
  isWeightType(productType) ? formatGrams(qty) : formatUnits(qty);

export const formatMetricQuantity = ({ units = 0, grams = 0 } = {}) => {
  const hasUnits = toNumber(units) !== 0;
  const hasGrams = toNumber(grams) !== 0;
  if (hasUnits && hasGrams) return `${formatUnits(units)} + ${formatGrams(grams)}`;
  if (hasGrams) return formatGrams(grams);
  return formatUnits(units);
};

export const isLowStockProduct = (product = {}) => {
  const stock = toNumber(product.stock);
  if (stock <= 0) return false;
  return stock < (isWeightType(product.product_type) ? LOW_STOCK_GRAMS : LOW_STOCK_UNITS);
};
