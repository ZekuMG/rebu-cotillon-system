import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areDuplicatePricesEqual,
  mergeDuplicateEntries,
} from '../src/utils/excelImportDuplicates.js';

const createEntry = (overrides = {}) => ({
  rowNumber: 2,
  quantity: 2,
  originalQuantity: 2,
  quantityInput: '2',
  lotCost: 1800,
  lotSalePrice: 3500,
  cost: 1800,
  costInput: '1800',
  salePrice: 3500,
  salePriceInput: '3500',
  multiplier: 1,
  ...overrides,
});

test('suma cantidades duplicadas sin sumar costo ni precio de venta', () => {
  const merged = mergeDuplicateEntries([
    createEntry(),
    createEntry({ rowNumber: 5, quantity: 3, originalQuantity: 3, quantityInput: '3' }),
  ]);

  assert.equal(merged.rowNumber, '2, 5');
  assert.equal(merged.quantity, 5);
  assert.equal(merged.originalQuantity, 5);
  assert.equal(merged.quantityInput, '5');
  assert.equal(merged.lotCost, 1800);
  assert.equal(merged.cost, 1800);
  assert.equal(merged.costInput, '1800');
  assert.equal(merged.lotSalePrice, 3500);
  assert.equal(merged.salePrice, 3500);
  assert.equal(merged.salePriceInput, '3500');
  assert.equal(merged.duplicateMerged, true);
});

test('solo permite sumar filas cuando costo y venta coinciden', () => {
  const base = createEntry();

  assert.equal(areDuplicatePricesEqual([base, createEntry({ rowNumber: 3 })]), true);
  assert.equal(areDuplicatePricesEqual([base, createEntry({ cost: 1900 })]), false);
  assert.equal(areDuplicatePricesEqual([base, createEntry({ salePrice: 3600 })]), false);
});

test('no modifica las filas originales al consolidarlas', () => {
  const entries = [createEntry(), createEntry({ rowNumber: 3, quantity: 1 })];
  const snapshot = structuredClone(entries);

  mergeDuplicateEntries(entries);

  assert.deepEqual(entries, snapshot);
});
