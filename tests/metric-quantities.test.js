import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addQuantity,
  emptyQuantity,
  formatMetricQuantity,
  formatQuantityForType,
  isLowStockProduct,
  LOW_STOCK_GRAMS,
  LOW_STOCK_UNITS,
} from '../src/utils/metricQuantities.js';

test('los gramos no se suman con las unidades', () => {
  let total = emptyQuantity();
  total = addQuantity(total, 3, 'quantity');
  total = addQuantity(total, 250, 'weight');
  total = addQuantity(total, 5, 'quantity');
  total = addQuantity(total, 500, 'weight');

  assert.deepEqual(total, { units: 8, grams: 750 });
});

test('la cantidad combinada se lee como unidades + kilos', () => {
  assert.equal(formatMetricQuantity({ units: 128, grams: 4300 }), '128 u. + 4,3 kg');
  assert.equal(formatMetricQuantity({ units: 3813, grams: 29590 }), '3.813 u. + 29,59 kg');
});

test('si solo hay un tipo se muestra solo ese', () => {
  assert.equal(formatMetricQuantity({ units: 12, grams: 0 }), '12 u.');
  assert.equal(formatMetricQuantity({ units: 0, grams: 350 }), '350 g');
  assert.equal(formatMetricQuantity({ units: 0, grams: 1250 }), '1,25 kg');
  assert.equal(formatMetricQuantity({ units: 0, grams: 0 }), '0 u.');
});

test('cada fila de producto muestra su propia unidad', () => {
  assert.equal(formatQuantityForType(4745, 'weight'), '4,75 kg');
  assert.equal(formatQuantityForType(21, 'quantity'), '21 u.');
  assert.equal(formatQuantityForType(21, undefined), '21 u.');
});

test('bajo stock: 200 g para los de peso, 10 unidades para el resto', () => {
  assert.equal(LOW_STOCK_GRAMS, 200);
  assert.equal(LOW_STOCK_UNITS, 10);

  assert.equal(isLowStockProduct({ product_type: 'weight', stock: 50 }), true);
  assert.equal(isLowStockProduct({ product_type: 'weight', stock: 199 }), true);
  assert.equal(isLowStockProduct({ product_type: 'weight', stock: 200 }), false);
  assert.equal(isLowStockProduct({ product_type: 'weight', stock: 9 }), true);

  assert.equal(isLowStockProduct({ product_type: 'quantity', stock: 9 }), true);
  assert.equal(isLowStockProduct({ product_type: 'quantity', stock: 10 }), false);

  // sin stock no cuenta como "bajo": va en su propia lista
  assert.equal(isLowStockProduct({ product_type: 'weight', stock: 0 }), false);
  assert.equal(isLowStockProduct({ stock: 0 }), false);
});
