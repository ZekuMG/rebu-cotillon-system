import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExcelImportUnitPricing,
  repriceExcelImportEntryForMargin,
  repriceExcelImportEntryForMultiplier,
  repriceExcelImportEntryForRealCost,
} from '../src/utils/excelImportPricing.js';

test('con el costo marcado SIN IVA, se lo suma y conserva Venta como referencia', () => {
  const pricing = calculateExcelImportUnitPricing({
    lotCost: 1800,
    lotSalePrice: 3500,
    multiplier: 1,
    marginPercent: 50,
    costIncludesVat: false,
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

  // Con la interpretacion nueva (el costo del Excel ya trae IVA) el costo por
  // unidad es la mitad del bulto, sin sumarle nada.
  assert.equal(entry.baseCost, 900);
  assert.equal(entry.cost, 900);
  assert.equal(entry.salePrice, 1800);
  assert.equal(entry.excelSalePrice, 1750);
  assert.equal(entry.costEdited, false);
  assert.equal(entry.salePriceEdited, false);
});

test('el costo del Excel se puede interpretar como que YA trae IVA', () => {
  // Fila real del pedido 3567588: precio sin IVA 594,72; el proveedor ya le sumo
  // el 10,5% en la columna Costo (657,1656) y su venta es ese costo x 2.
  const yaConIva = calculateExcelImportUnitPricing({
    lotCost: 657.1656,
    lotSalePrice: 1314.3312,
    multiplier: 1,
    marginPercent: 50,
  });
  assert.equal(yaConIva.realCost, 658);
  assert.equal(yaConIva.salePrice, 1320);
  assert.equal(yaConIva.excelSalePrice, 1315);

  // Y si el costo viniera sin IVA, se lo suma (es el comportamiento viejo).
  const sinIva = calculateExcelImportUnitPricing({
    lotCost: 657.1656,
    lotSalePrice: 1314.3312,
    multiplier: 1,
    marginPercent: 50,
    costIncludesVat: false,
  });
  assert.equal(sinIva.realCost, 727);
  assert.equal(sinIva.salePrice, 1460);
});

test('la equivalencia por bulto respeta la interpretacion del IVA', () => {
  const porBulto = repriceExcelImportEntryForMultiplier(
    { lotCost: 1314.3312, lotSalePrice: 2628.6624 },
    2,
    50,
    true,
  );
  assert.equal(porBulto.cost, 658);
  assert.equal(porBulto.salePrice, 1320);
});
