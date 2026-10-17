import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExcelImportConsolidation,
  getExcelImportProductConflicts,
} from '../src/utils/excelImportProductConflicts.js';

const product = { id: 7, title: 'Globos', barcode: '779123', stock: 10, purchasePrice: 100, price: 200 };
const makeRow = (id, rowNumber, quantity, multiplier = 1, approvals = { stock: true }) => ({
  id,
  product,
  entry: { rowNumber, description: `Compra ${rowNumber}`, quantity, multiplier, cost: 110 + rowNumber, salePrice: 220 + rowNumber },
  approvals,
});

test('detecta solo filas aplicables para un mismo producto, incluso si una solo vincula', () => {
  const rows = [
    makeRow('a', 2, 2),
    makeRow('b', 3, 0, 1, { stock: false, cost: false, price: false }),
    { ...makeRow('c', 4, 3), excludedFromApply: true },
    { ...makeRow('d', 5, 1), product: { ...product, id: 8 } },
  ];
  const conflicts = getExcelImportProductConflicts(rows, (row) => !row.excludedFromApply);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].rows.map((row) => row.entry.rowNumber), [2, 3]);
});

test('consolida solo stock aprobado y conserva la elección explícita de costo y venta', () => {
  const a = makeRow('a', 2, 2, 3);
  const b = makeRow('b', 3, 4, 2);
  const c = makeRow('c', 4, 99, 1, { stock: false, cost: true, price: true });
  const plan = buildExcelImportConsolidation(
    { productId: '7', product, rows: [a, b, c] },
    { leaderId: 'a', costRowId: 'c', priceRowId: 'keep' },
  );
  assert.equal(plan.stockDelta, 14);
  assert.equal(plan.cost.value, c.entry.cost);
  assert.equal(plan.price.value, product.price);
  assert.equal(plan.price.approved, false);
});

test('rechaza una consolidación sin dos compras aprobadas o con valores inválidos', () => {
  const a = makeRow('a', 2, 2);
  const b = makeRow('b', 3, 4, 1, { stock: false, cost: true });
  const conflict = { productId: '7', product, rows: [a, b] };
  assert.throws(() => buildExcelImportConsolidation(conflict, {
    leaderId: 'a', costRowId: 'a', priceRowId: 'b',
  }), /al menos dos filas/);
  const expensive = { ...b, approvals: { stock: true }, entry: { ...b.entry, cost: 500 } };
  assert.throws(() => buildExcelImportConsolidation({ ...conflict, rows: [a, expensive] }, {
    leaderId: 'a', costRowId: 'b', priceRowId: 'keep',
  }), /venta elegida es menor/);
  const huge = { ...b, approvals: { stock: true }, entry: { ...b.entry, quantity: Number.MAX_SAFE_INTEGER } };
  assert.throws(() => buildExcelImportConsolidation({ ...conflict, rows: [a, huge] }, {
    leaderId: 'a', costRowId: 'keep', priceRowId: 'keep',
  }), /fuera de rango/);
});
