import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  getStoredProductPurchaseCost,
  getVisibleProductPurchaseCost,
  normalizeFinalPurchaseCost,
  normalizeStoredProductPurchaseCost,
} from '../src/utils/finalPurchaseCost.js';

test('rounds a finalized purchase cost upward to one whole peso', () => {
  assert.equal(normalizeFinalPurchaseCost(680.16), 681);
  assert.equal(normalizeFinalPurchaseCost(680), 680);
  assert.equal(normalizeFinalPurchaseCost(680.01), 681);
  assert.equal(normalizeFinalPurchaseCost(-10), 0);
  assert.equal(normalizeFinalPurchaseCost('invalid'), 0);
});

test('keeps weight storage precise while cost per kilo is a whole peso', () => {
  assert.equal(getVisibleProductPurchaseCost(1.2543, 'weight'), 1255);
  assert.equal(getStoredProductPurchaseCost(1254.01, 'weight'), 1.255);
  assert.equal(normalizeStoredProductPurchaseCost(1.2543, 'weight'), 1.255);
  assert.equal(normalizeStoredProductPurchaseCost(680.16, 'quantity'), 681);
});

test('inventory hydration normalizes current purchase costs', async () => {
  const mapperSource = await readFile(
    new URL('../src/utils/cloudMappers.js', import.meta.url),
    'utf8',
  );

  assert.match(mapperSource, /purchasePrice: normalizeStoredProductPurchaseCost\(/);
});

test('database guard rounds current product costs without changing sale history', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260831160000_round_purchase_costs_to_whole_pesos.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /trg_products_purchase_cost/);
  assert.match(migration, /ceil\(new\."purchasePrice"\)/);
  assert.match(migration, /ceil\(new\."purchasePrice" \* 1000\) \/ 1000/);
  assert.doesNotMatch(migration, /update\s+public\.sale_items/i);
  assert.doesNotMatch(migration, /update\s+public\.sales/i);
});

test('el costo no se infla por coma flotante', () => {
  // Reportado el 1-sep: al aplicar un porcentaje quedaba 3501 en vez de 3500.
  assert.equal(normalizeFinalPurchaseCost(3500 * 1.0000000000000002), 3500);
  assert.equal(getVisibleProductPurchaseCost(8.06, 'weight'), 8060);
  // Un centavo de mas sigue redondeando hacia arriba.
  assert.equal(normalizeFinalPurchaseCost(3500.01), 3501);
});
