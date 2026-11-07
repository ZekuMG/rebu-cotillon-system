import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStock, formatWeight } from '../src/utils/helpers.js';

test('el peso en kilos conserva todos los gramos, incluso cerca del kilo siguiente', () => {
  for (const [grams, label] of [[1000, '1kg'], [1001, '1.001kg'], [1010, '1.01kg'], [1050, '1.05kg'], [1500, '1.5kg'], [1999, '1.999kg']]) {
    assert.equal(formatWeight(grams), label);
    assert.equal(formatStock({ product_type: 'weight', stock: grams }), label);
  }
});

test('gramos y stock por unidad conservan sus formatos', () => {
  assert.equal(formatWeight(333), '333g');
  assert.equal(formatStock({ product_type: 'weight', stock: 999 }), '999g');
  assert.equal(formatStock({ product_type: 'quantity', stock: 5 }), '5 u.');
  assert.equal(formatWeight(null), '0g');
});
