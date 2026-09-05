import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPercentageToSalePrice,
  DEFAULT_SALE_ROUNDING_MODE,
  normalizeFinalSalePrice,
  normalizeSaleRoundingMode,
  SALE_ROUNDING_MODES,
} from '../src/utils/finalSalePrice.js';

test('sin elegir nada sigue redondeando a decena como siempre', () => {
  assert.equal(DEFAULT_SALE_ROUNDING_MODE, 'decena');
  assert.equal(normalizeFinalSalePrice(3501), 3500);
  assert.equal(normalizeFinalSalePrice(3502), 3500);
  assert.equal(normalizeFinalSalePrice(3503), 3510);
  assert.equal(normalizeFinalSalePrice(3500), 3500);
});

test('centena para arriba: cualquier resto sube al siguiente $100', () => {
  const modo = 'centenaArriba';
  assert.equal(normalizeFinalSalePrice(3501, modo), 3600);
  assert.equal(normalizeFinalSalePrice(3502, modo), 3600);
  assert.equal(normalizeFinalSalePrice(3599, modo), 3600);
  assert.equal(normalizeFinalSalePrice(3401, modo), 3500);
});

test('centena para arriba NO mueve lo que ya cae justo', () => {
  const modo = 'centenaArriba';
  assert.equal(normalizeFinalSalePrice(3600, modo), 3600, '3600 no puede saltar a 3700');
  assert.equal(normalizeFinalSalePrice(100, modo), 100);
  assert.equal(normalizeFinalSalePrice(12300, modo), 12300);
});

test('centena comercial: hasta $2 por encima baja', () => {
  const modo = 'centena';
  assert.equal(normalizeFinalSalePrice(3501, modo), 3500);
  assert.equal(normalizeFinalSalePrice(3502, modo), 3500);
  assert.equal(normalizeFinalSalePrice(3503, modo), 3600);
  assert.equal(normalizeFinalSalePrice(3500, modo), 3500);
});

test('la coma flotante no empuja un precio ya justo al escalon siguiente', () => {
  // Un 3500 que la coma flotante deja en 3500.0000000000005 NO puede irse a 3600
  // solo por el ruido: es el caso que motivo FLOAT_NOISE.
  assert.equal(normalizeFinalSalePrice(3500.0000000000005, 'centenaArriba'), 3500);
  assert.equal(normalizeFinalSalePrice(3500.0000000000005, 'decena'), 3500);
  // En cambio 80 centavos de verdad SI hacen subir en modo centena arriba.
  assert.equal(normalizeFinalSalePrice(3200 * 1.094, 'centenaArriba'), 3600, '3500,80 sube');
  assert.equal(normalizeFinalSalePrice(3200 * 1.094, 'decena'), 3500, 'pero en decena baja por la tolerancia');
  assert.equal(normalizeFinalSalePrice(8.06 * 1000, 'decena'), 8060, 'el ruido de 8060,000000000001 no sube');
});

test('cero y negativos dan cero en todos los modos', () => {
  for (const modo of Object.keys(SALE_ROUNDING_MODES)) {
    assert.equal(normalizeFinalSalePrice(0, modo), 0);
    assert.equal(normalizeFinalSalePrice(-50, modo), 0);
    assert.equal(normalizeFinalSalePrice(null, modo), 0);
    assert.equal(normalizeFinalSalePrice('no es un numero', modo), 0);
  }
});

test('precios chicos: la tolerancia de $2 los baja, salvo en centena arriba', () => {
  // Ojo: con la regla comercial vigente, $1 y $2 caen al escalon 0. Eso no es
  // nuevo de los modos, es la tolerancia de siempre.
  assert.equal(normalizeFinalSalePrice(1, 'decena'), 0);
  assert.equal(normalizeFinalSalePrice(1, 'centena'), 0);
  assert.equal(normalizeFinalSalePrice(1, 'centenaArriba'), 100, 'aca sube al primer escalon');
  assert.equal(normalizeFinalSalePrice(3, 'decena'), 10, 'de $3 para arriba ya sube');
});

test('un modo inventado cae en decena en vez de romper', () => {
  assert.equal(normalizeSaleRoundingMode('cualquiera'), 'decena');
  assert.equal(normalizeSaleRoundingMode(''), 'decena');
  assert.equal(normalizeSaleRoundingMode(null), 'decena');
  assert.equal(normalizeSaleRoundingMode(undefined), 'decena');
  assert.equal(normalizeFinalSalePrice(3501, 'cualquiera'), 3500);
});

test('normalizeSaleRoundingMode acepta los tres modos reales', () => {
  assert.equal(normalizeSaleRoundingMode('decena'), 'decena');
  assert.equal(normalizeSaleRoundingMode('centena'), 'centena');
  assert.equal(normalizeSaleRoundingMode('centenaArriba'), 'centenaArriba');
});

test('el porcentaje respeta el modo elegido', () => {
  // 1000 + 9% = 1090 exacto: en decena queda ahi, en centena arriba sube a 1100.
  assert.equal(applyPercentageToSalePrice(1000, 9), 1090, 'decena por defecto');
  assert.equal(applyPercentageToSalePrice(1000, 9, 'centenaArriba'), 1100);
  assert.equal(applyPercentageToSalePrice(1000, 0, 'centenaArriba'), 1000, 'sin cambio no se infla');
  assert.equal(applyPercentageToSalePrice(1000, 9.4, 'decena'), 1100, '1094 sube por la regla de $2');
});

test('cada modo declara su escalon y su direccion', () => {
  assert.equal(SALE_ROUNDING_MODES.decena.step, 10);
  assert.equal(SALE_ROUNDING_MODES.decena.alwaysUp, false);
  assert.equal(SALE_ROUNDING_MODES.centena.step, 100);
  assert.equal(SALE_ROUNDING_MODES.centenaArriba.step, 100);
  assert.equal(SALE_ROUNDING_MODES.centenaArriba.alwaysUp, true);
});

// --- Se aplica de punta a punta en Casa Alberto ---------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  calculateGrossMarginPricing,
  loadGrossMarginPreferences,
  roundSaleForMode,
  saveGrossMarginPreferences,
} from '../src/utils/grossMarginPricing.js';
import { buildSuggestedSalePriceFromMargin } from '../src/utils/productLifecycle.js';

test('el modo por defecto no cambia NADA del calculo historico', () => {
  // Antes la sugerencia subia siempre al proximo $10. Eso se conserva tal cual.
  assert.equal(roundSaleForMode(1091), 1100);
  assert.equal(roundSaleForMode(1090), 1090);
  assert.equal(roundSaleForMode(1091, 'decena'), 1100, 'no aplica la tolerancia de $2 en la sugerencia');
});

test('el calculo de margen respeta el escalon elegido', () => {
  const base = { cost: 1000, costIncludesVat: true, marginPercent: 50 };
  assert.equal(calculateGrossMarginPricing(base).salePrice, 2000);
  const conResto = { cost: 1007, costIncludesVat: true, marginPercent: 50 };
  assert.equal(calculateGrossMarginPricing(conResto).salePrice, 2020, 'decena');
  assert.equal(
    calculateGrossMarginPricing({ ...conResto, roundingMode: 'centenaArriba' }).salePrice,
    2100,
    'centena para arriba',
  );
});

test('la venta sugerida de Casa Alberto usa el escalon elegido', () => {
  const product = { price: 0 };
  const conDecena = buildSuggestedSalePriceFromMargin(product, 1000, { grossMarginPercent: 50 });
  const conCentena = buildSuggestedSalePriceFromMargin(product, 1000, {
    grossMarginPercent: 50,
    roundingMode: 'centenaArriba',
  });
  assert.ok(conCentena % 100 === 0, `${conCentena} tiene que terminar en 00`);
  assert.ok(conCentena >= conDecena, 'para arriba nunca da menos que el calculo');
});

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
};

test('el escalon elegido se recuerda entre sesiones', () => {
  const storage = memoryStorage();
  saveGrossMarginPreferences(storage, { marginPercent: 50, supplierSaleRoundingMode: 'centenaArriba' });
  assert.equal(loadGrossMarginPreferences(storage).supplierSaleRoundingMode, 'centenaArriba');
});

test('una preferencia vieja sin escalon arranca en decena', () => {
  const storage = memoryStorage();
  storage.setItem('rebu_gross_margin_pricing_v1', JSON.stringify({ marginPercent: 60 }));
  const loaded = loadGrossMarginPreferences(storage);
  assert.equal(loaded.supplierSaleRoundingMode, 'decena', 'nadie se despierta con otro redondeo');
  assert.equal(loaded.marginPercent, 60, 'y el margen guardado se respeta');
});

test('un escalon corrupto guardado no rompe la app', () => {
  const storage = memoryStorage();
  storage.setItem('rebu_gross_margin_pricing_v1', JSON.stringify({ supplierSaleRoundingMode: 'millar' }));
  assert.equal(loadGrossMarginPreferences(storage).supplierSaleRoundingMode, 'decena');
});

test('la pantalla de Casa Alberto ofrece los tres escalones', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/views/BulkEditorView.jsx', import.meta.url)),
    'utf8',
  );
  assert.match(source, /Redondeo de la venta/);
  assert.match(source, /Object\.entries\(SALE_ROUNDING_MODES\)\.map/);
  assert.match(source, /updateSupplierSaleRoundingMode\(modeKey\)/);
  assert.match(source, /roundingMode: pricingPreferences\.supplierSaleRoundingMode/);
});
