import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGrossMarginPricing,
  DEFAULT_GROSS_MARGIN_PREFERENCES,
  loadGrossMarginPreferences,
  saveGrossMarginPreferences,
} from '../src/utils/grossMarginPricing.js';

test('calcula costo real y los margenes del ejemplo de referencia', () => {
  const expectedSales = new Map([
    [40, 18420],
    [50, 22100],
    [60, 27630],
    [70, 36840],
  ]);

  for (const [marginPercent, expectedSale] of expectedSales) {
    const pricing = calculateGrossMarginPricing({ cost: 10000, marginPercent });
    assert.equal(pricing.isValid, true);
    assert.equal(pricing.realCost, 11050);
    assert.equal(pricing.salePrice, expectedSale);
  }
});

test('no vuelve a sumar IVA cuando el costo ya lo incluye', () => {
  const pricing = calculateGrossMarginPricing({
    cost: 11050,
    costIncludesVat: true,
    marginPercent: 50,
  });

  assert.equal(pricing.realCost, 11050);
  assert.equal(pricing.salePrice, 22100);
});

test('redondea el costo real hacia arriba a un peso entero', () => {
  const pricing = calculateGrossMarginPricing({
    cost: 680.16,
    costIncludesVat: true,
    marginPercent: 50,
  });

  assert.equal(pricing.rawRealCost, 680.16);
  assert.equal(pricing.realCost, 681);
  assert.equal(pricing.salePrice, 1370);
});

test('acepta la tasa de IVA del contrato como porcentaje o proporcion', () => {
  assert.equal(calculateGrossMarginPricing({ cost: 10000, vatRate: 10.5 }).realCost, 11050);
  assert.equal(calculateGrossMarginPricing({ cost: 10000, vatRate: 0.105 }).realCost, 11050);
});

test('rechaza costos y margenes que no producen un precio valido', () => {
  assert.equal(calculateGrossMarginPricing({ cost: 0, marginPercent: 50 }).isValid, false);
  assert.equal(calculateGrossMarginPricing({ cost: 100, marginPercent: -1 }).isValid, false);
  assert.equal(calculateGrossMarginPricing({ cost: 100, marginPercent: 100 }).isValid, false);
});

test('guarda y normaliza la preferencia compartida', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.deepEqual(loadGrossMarginPreferences(storage), DEFAULT_GROSS_MARGIN_PREFERENCES);
  assert.equal(saveGrossMarginPreferences(storage, {
    marginPercent: 60,
    bulkCostIncludesVat: false,
  }), true);
  assert.deepEqual(loadGrossMarginPreferences(storage), {
    marginPercent: 60,
    bulkCostIncludesVat: false,
  });
});
