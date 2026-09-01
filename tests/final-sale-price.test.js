import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getStoredProductSalePrice,
  getVisibleProductSalePrice,
  normalizeFinalSalePrice,
  normalizeStoredProductSalePrice,
  applyPercentageToSalePrice,
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

test('un aumento por porcentaje deja el mismo precio que se va a guardar', () => {
  // El editor masivo mostraba el resultado con Math.round (pesos enteros) pero al
  // guardar se aplica la regla comercial de $10: la grilla decia 1094 y quedaba 1100.
  assert.equal(applyPercentageToSalePrice(1000, 9.4), 1100);
  assert.equal(applyPercentageToSalePrice(1000, 9.4), getStoredProductSalePrice(applyPercentageToSalePrice(1000, 9.4), 'quantity'));
  assert.equal(applyPercentageToSalePrice(2500, 0), 2500);
  assert.equal(applyPercentageToSalePrice(1000, -12), 880);
  assert.equal(applyPercentageToSalePrice(0, 20), 0);
});

test('el aumento por porcentaje respeta los productos por peso', () => {
  // 8,06 por gramo = $8.060 el kilo; +10% = 8.866 -> el escalon comercial es 8.870
  assert.equal(applyPercentageToSalePrice(getVisibleProductSalePrice(8.06, 'weight'), 10), 8870);
});

test('la coma flotante no empuja un valor justo al escalon siguiente', () => {
  // Reportado el 1-sep: un porcentaje sobre $3.500 mostraba $3.510 (y el costo $3.501).
  assert.equal(applyPercentageToSalePrice(3500, 0), 3500);
  assert.equal(normalizeFinalSalePrice(3500 * 1.094 / 1.094), 3500);
  assert.equal(normalizeFinalSalePrice(0.1 + 0.2 + 3499.7), 3500);
  // Productos por peso: 8,06 por gramo son $8.060 el kilo exactos, no $8.070.
  assert.equal(getVisibleProductSalePrice(8.06, 'weight'), 8060);
  assert.equal(getVisibleProductSalePrice(4.03, 'weight'), 4030);
  // Y un peso de mas sigue subiendo el escalon, como corresponde.
  assert.equal(normalizeFinalSalePrice(3500.01), 3510);
});
