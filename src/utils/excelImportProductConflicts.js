import { calculateExcelImportStockDelta, isSafeExcelImportNumber } from './excelImportNumbers.js';

export const getExcelImportProductConflicts = (rows = [], isApplicable = () => false) => {
  const byProduct = new Map();
  rows.forEach((row) => {
    if (row?.product?.id === undefined || row?.product?.id === null || !isApplicable(row)) return;
    const productId = String(row.product.id);
    const group = byProduct.get(productId) || { productId, product: row.product, rows: [] };
    group.rows.push(row);
    byProduct.set(productId, group);
  });
  return [...byProduct.values()].filter((group) => group.rows.length > 1);
};

export const buildExcelImportConsolidation = (conflict, { leaderId, costRowId, priceRowId } = {}) => {
  const sourceRows = conflict?.rows || [];
  const leader = sourceRows.find((row) => String(row.id) === String(leaderId));
  if (!leader) throw new Error('Elegí la fila principal de la compra.');
  if (!costRowId || !priceRowId) throw new Error('Elegí qué costo y venta conservar.');

  const stockRows = sourceRows.filter((row) => row.approvals?.stock);
  if (stockRows.length < 2) {
    throw new Error('Para consolidar, al menos dos filas deben tener el stock aprobado.');
  }
  const stockDelta = stockRows.reduce((sum, row) => sum + calculateExcelImportStockDelta(row.entry), 0);
  if (!isSafeExcelImportNumber(stockDelta, { min: Number.MIN_VALUE }) || stockDelta <= 0) {
    throw new Error('La suma de stock queda fuera de rango.');
  }
  const currentStock = Number(leader.product.stock || 0);
  if (!isSafeExcelImportNumber(currentStock + stockDelta, { min: 0 })) {
    throw new Error('El stock resultante queda fuera de rango.');
  }

  const findChoice = (rowId, field, current) => {
    if (rowId === 'keep') return { value: Number(current || 0), approved: false };
    const row = sourceRows.find((item) => String(item.id) === String(rowId));
    if (!row) throw new Error(`Elegí una fila válida para ${field === 'cost' ? 'costo' : 'venta'}.`);
    const value = Number(row.entry?.[field] || 0);
    if (!isSafeExcelImportNumber(value, { min: Number.MIN_VALUE }) || value <= 0) {
      throw new Error(`El ${field === 'cost' ? 'costo' : 'precio de venta'} elegido no es válido.`);
    }
    return { value, approved: value !== Number(current || 0) };
  };
  const cost = findChoice(costRowId, 'cost', leader.product.purchasePrice);
  const price = findChoice(priceRowId, 'salePrice', leader.product.price);
  if (cost.value > 0 && price.value > 0 && price.value < cost.value) {
    throw new Error('La venta elegida es menor que el costo.');
  }

  return { leader, sourceRows, stockDelta, cost, price };
};
