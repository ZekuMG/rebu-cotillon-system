import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getStoredProductSalePrice,
  getVisibleProductSalePrice,
  normalizeFinalSalePrice,
  normalizeStoredProductSalePrice,
} from '../src/utils/finalSalePrice.js';

test('rounds only the final sale price upward to the next ten pesos', () => {
  assert.equal(normalizeFinalSalePrice(680.16), 690);
  assert.equal(normalizeFinalSalePrice('1497,3'.replace(',', '.')), 1500);
  assert.equal(normalizeFinalSalePrice(4023), 4030);
  assert.equal(normalizeFinalSalePrice(680), 680);
  assert.equal(normalizeFinalSalePrice(-10), 0);
  assert.equal(normalizeFinalSalePrice('invalid'), 0);
});

test('keeps weight storage precise while the commercial price per kilo is whole', () => {
  assert.equal(getVisibleProductSalePrice(1.2543, 'weight'), 1260);
  assert.equal(getStoredProductSalePrice(1254.01, 'weight'), 1.26);
  assert.equal(normalizeStoredProductSalePrice(1.2543, 'weight'), 1.26);
  assert.equal(normalizeStoredProductSalePrice(680.16, 'quantity'), 690);
});

test('inventory hydration normalizes sale price and current purchase cost independently', async () => {
  const mapperSource = await readFile(
    new URL('../src/utils/cloudMappers.js', import.meta.url),
    'utf8',
  );

  assert.match(mapperSource, /price: normalizeStoredProductSalePrice\(product\.price, product\.product_type\)/);
  assert.match(mapperSource, /purchasePrice: normalizeStoredProductPurchaseCost\(/);
});

test('database migration protects products, offers and the web catalog only', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260831140415_normalize_final_sale_prices_to_whole_pesos.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /trg_products_final_sale_price/);
  assert.match(migration, /trg_offers_final_sale_price/);
  assert.match(migration, /trg_web_catalog_final_sale_price/);
  assert.match(migration, /ceil\(new\.price \* 1000\) \/ 1000/);
  assert.doesNotMatch(migration, /update\s+public\.sale_items/i);
  assert.doesNotMatch(migration, /update\s+public\.sales/i);
});

test('incremental migration changes the database guard to commercial tens', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260831143217_round_final_sale_prices_to_tens.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /ceil\(new\.price \/ 10\) \* 10/);
  assert.match(migration, /ceil\(new\.offer_price \/ 10\) \* 10/);
  assert.match(migration, /ceil\(new\.web_price \/ 10\) \* 10/);
  assert.doesNotMatch(migration, /update\s+public\.sale_items/i);
  assert.doesNotMatch(migration, /update\s+public\.sales/i);
});

test('integer FancyPrice values omit the artificial cents label', async () => {
  const componentSource = await readFile(
    new URL('../src/components/FancyPrice.jsx', import.meta.url),
    'utf8',
  );
  assert.match(componentSource, /parts\[1\] === '00'/);
});
