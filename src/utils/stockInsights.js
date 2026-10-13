// Cruza el stock actual con lo vendido en el rango de Métricas: cuánto dura cada producto,
// qué reponer primero y qué no se movió. Las cantidades de peso están en gramos tanto en el
// stock como en lo vendido, así que el ritmo y los días salen bien sin convertir.
import { isTestRecord } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const toNumber = (value) => Number(value) || 0;

export const DEFAULT_RESTOCK_DAYS = 14;

// firstSaleDate se usa cuando el rango es "Todo el historial" (sin inicio).
export const getRangeDays = (range = {}, firstSaleDate = null) => {
  const end = range.end || new Date();
  const start = range.start || firstSaleDate;
  if (!start) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
};

const isActiveProduct = (product) =>
  product && product.is_active !== false && !product.isTest && !isTestRecord(product);

export const buildStockInsights = ({
  inventory = [],
  productStats = [],
  rangeDays = 0,
  restockDays = DEFAULT_RESTOCK_DAYS,
} = {}) => {
  const soldByKey = new Map(productStats.map((row) => [String(row.key), row]));
  const coverage = [];
  const unsold = [];

  inventory.filter(isActiveProduct).forEach((product) => {
    const key = String(product.id);
    const sold = soldByKey.get(key);
    const stock = Math.max(0, toNumber(product.stock));
    const type = product.product_type === 'weight' ? 'weight' : 'quantity';
    const unitCost = toNumber(product.purchasePrice);

    if (!sold || toNumber(sold.qty) <= 0) {
      if (stock > 0) {
        unsold.push({ id: product.id, title: product.title, stock, type, capital: stock * unitCost });
      }
      return;
    }

    if (rangeDays <= 0) return;
    const dailyRate = toNumber(sold.qty) / rangeDays;
    coverage.push({
      id: product.id,
      title: product.title,
      stock,
      type,
      soldQty: toNumber(sold.qty),
      dailyRate,
      daysOfStock: stock / dailyRate,
      revenue: toNumber(sold.revenue),
    });
  });

  // A igual duración (por ejemplo, todos los agotados) va primero lo que más plata movió.
  coverage.sort((a, b) => (a.daysOfStock - b.daysOfStock) || (b.revenue - a.revenue));
  unsold.sort((a, b) => b.capital - a.capital);

  const weightRanking = productStats
    .filter((row) => row.type === 'weight' && toNumber(row.qty) > 0)
    .map((row) => ({ ...row, kilos: toNumber(row.qty) / 1000 }))
    .sort((a, b) => b.kilos - a.kilos);

  return {
    coverage,
    restock: coverage.filter((row) => row.daysOfStock <= restockDays),
    unsold,
    unsoldCapital: unsold.reduce((sum, row) => sum + row.capital, 0),
    weightRanking,
    restockDays,
  };
};
