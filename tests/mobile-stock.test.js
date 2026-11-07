import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STOCK, previewStock, priceLabel, stockLabel } from '../mobile/src/stock.js';

test('mobile stock supports receipts, recounts, zero stock and grams', () => {
  assert.deepEqual(previewStock({ stock: 5 }, 'add', '12'), { quantity: 12, before: 5, after: 17, delta: 12 });
  assert.deepEqual(previewStock({ stock: 5 }, 'set', '0'), { quantity: 0, before: 5, after: 0, delta: -5 });
  assert.equal(previewStock({ stock: 1500, product_type: 'weight' }, 'add', '500').after, 2000);
  assert.equal(stockLabel({ stock: 1500, product_type: 'weight' }), '1.500 g');
  assert.match(priceLabel({ price: 10, product_type: 'weight' }), /10.000/);
});

test('mobile stock rejects invalid input instead of silently coercing it', () => {
  for (const value of ['', ' ', '-1', '1.5', '1,5', '1e3', 'Infinity', 'NaN', '12g', String(MAX_STOCK + 1)]) {
    assert.throws(() => previewStock({ stock: 5 }, 'add', value), undefined, value);
  }
  assert.throws(() => previewStock({ stock: 5 }, 'add', '0'));
  assert.throws(() => previewStock({ stock: 5 }, 'set', '5'));
  assert.throws(() => previewStock({ stock: MAX_STOCK }, 'add', '1'));
  assert.throws(() => previewStock({ stock: NaN }, 'set', '1'));
  assert.throws(() => previewStock({ stock: null }, 'set', '1'));
  assert.equal(stockLabel({ stock: null }), 'Sin dato');
  assert.equal(priceLabel({ price: null }), 'Sin precio');
});
