import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_EXCEL_COLUMNS,
  getMissingExcelColumns,
  resolveExcelRowValues,
} from '../src/utils/excelImportColumns.js';

test('solo el codigo y el precio son obligatorios', () => {
  assert.deepEqual(REQUIRED_EXCEL_COLUMNS, ['codigo', 'precio']);
  assert.deepEqual(getMissingExcelColumns(['Codigo', 'Precio']), []);
  assert.deepEqual(getMissingExcelColumns(['Código', 'precio ']), [], 'ignora tildes, mayusculas y espacios');
  assert.deepEqual(getMissingExcelColumns(['Descripcion', 'Precio']), ['codigo']);
  assert.deepEqual(getMissingExcelColumns(['Codigo']), ['precio']);
});

test('sin columna Costo, el precio hace de costo', () => {
  const valores = resolveExcelRowValues({ Codigo: '779', Precio: 594.72 });
  assert.equal(valores.lotCost, 594.72);
  assert.equal(valores.providerPrice, 594.72);
  assert.equal(valores.costFromProviderPrice, true);
});

test('con columna Costo manda el costo', () => {
  const valores = resolveExcelRowValues({ Codigo: '779', Precio: 594.72, 'costo ': 657.1656 });
  assert.equal(valores.lotCost, 657.1656);
  assert.equal(valores.costFromProviderPrice, false);
});

test('lo que falta toma un valor neutro y no inventa stock', () => {
  const valores = resolveExcelRowValues({ Codigo: '779', Precio: 100 });
  assert.equal(valores.quantity, 0, 'sin Cantidad no suma stock');
  assert.equal(valores.discount, 0);
  assert.equal(valores.lotSalePrice, 0, 'sin Venta no hay referencia del proveedor');
  assert.equal(valores.description, '');
  assert.equal(valores.category, '');
});

test('un costo vacio en la fila tambien cae al precio', () => {
  const valores = resolveExcelRowValues({ Codigo: '779', Precio: 100, Costo: '', Cantidad: 3 });
  assert.equal(valores.lotCost, 100);
  assert.equal(valores.quantity, 3);
});

test('sin columna Cantidad se marca como ausente, no como error', () => {
  assert.equal(resolveExcelRowValues({ Codigo: '779', Precio: 100 }).quantityMissing, true);
  assert.equal(resolveExcelRowValues({ Codigo: '779', Precio: 100, Cantidad: 0 }).quantityMissing, false);
  assert.equal(resolveExcelRowValues({ Codigo: '779', Precio: 100, Cantidad: 5 }).quantityMissing, false);
});
