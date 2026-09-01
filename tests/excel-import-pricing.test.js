import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExcelImportUnitPricing,
  repriceExcelImportEntryForMargin,
  repriceExcelImportEntryForMultiplier,
  repriceExcelImportEntryForRealCost,
} from '../src/utils/excelImportPricing.js';

test('Excel interpreta Costo sin IVA y conserva Venta como referencia', () => {
  const pricing = calculateExcelImportUnitPricing({
    lotCost: 1800,
    lotSalePrice: 3500,
    multiplier: 1,
    marginPercent: 50,
  });

  assert.equal(pricing.baseCost, 1800);
  assert.equal(pricing.realCost, 1989);
  assert.equal(pricing.salePrice, 3980);
  assert.equal(pricing.excelSalePrice, 3500);
});

test('cambiar margen conserva una venta ajustada manualmente', () => {
  const automatic = repriceExcelImportEntryForMargin({ cost: 1989, salePrice: 3980 }, 60);
  const manual = repriceExcelImportEntryForMargin({
    cost: 1989,
    salePrice: 4100,
    salePriceEdited: true,
  }, 60);

  assert.equal(automatic.salePrice, 4980);
  assert.equal(manual.salePrice, 4100);
});

test('editar costo real recalcula solo ventas automaticas', () => {
  const automatic = repriceExcelImportEntryForRealCost({ salePrice: 3980 }, 2000, 50);
  const manual = repriceExcelImportEntryForRealCost({
    salePrice: 4100,
    salePriceEdited: true,
  }, 2000, 50);

  assert.equal(automatic.salePrice, 4000);
  assert.equal(manual.salePrice, 4100);
});

test('editar un costo con centavos lo finaliza hacia arriba al peso entero', () => {
  const updated = repriceExcelImportEntryForRealCost({ salePrice: 1370 }, 680.16, 50);

  assert.equal(updated.cost, 681);
  assert.equal(updated.salePrice, 1370);
});

test('cambiar multiplicador reinicia costo y venta sugerida manual', () => {
  const entry = repriceExcelImportEntryForMultiplier({
    lotCost: 1800,
    lotSalePrice: 3500,
    salePrice: 4100,
    salePriceEdited: true,
    costEdited: true,
  }, 2, 50);

  assert.equal(entry.baseCost, 900);
  assert.equal(entry.cost, 995);
  assert.equal(entry.salePrice, 1990);
  assert.equal(entry.excelSalePrice, 1750);
  assert.equal(entry.costEdited, false);
  assert.equal(entry.salePriceEdited, false);
});
