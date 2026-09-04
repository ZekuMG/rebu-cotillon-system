import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasPendingSupplierEdit,
  sortSupplierGroupsForReview,
  SUPPLIER_STATUS_WEIGHT,
} from '../src/utils/supplierPendingEdits.js';

test('una fila esta editada si tiene algo pendiente de aplicar', () => {
  const overrides = {
    a: { unitDivisor: 6 },
    b: {},
    c: { finalSalePrices: {} },
    d: { finalSalePrices: { '10': 1200 } },
  };
  assert.equal(hasPendingSupplierEdit(overrides, 'a'), true);
  assert.equal(hasPendingSupplierEdit(overrides, 'b'), false, 'un objeto vacio no es una edicion');
  assert.equal(hasPendingSupplierEdit(overrides, 'c'), false, 'precios finales vacios tampoco');
  assert.equal(hasPendingSupplierEdit(overrides, 'd'), true);
  assert.equal(hasPendingSupplierEdit(overrides, 'z'), false);
  assert.equal(hasPendingSupplierEdit(undefined, 'a'), false);
});

test('lo que estas editando queda primero, y lo ultimo editado arriba de todo', () => {
  const groups = [
    { key: 'a', status: 'changed', supplierTitle: 'AAA' },
    { key: 'b', status: 'reviewed', supplierTitle: 'BBB' },
    { key: 'c', status: 'ignored', supplierTitle: 'CCC' },
  ];
  const ordenado = sortSupplierGroupsForReview(groups, {
    overrides: { b: { unitDivisor: 6 }, c: { supplierPrice: 100 } },
    editedAt: { b: 1000, c: 2000 },
  });
  assert.deepEqual(ordenado.map((group) => group.key), ['c', 'b', 'a'], 'c se edito despues que b');
});

test('sin ediciones, ordena por estado como siempre', () => {
  const groups = [
    { key: 'x', status: 'ignored', supplierTitle: 'XXX' },
    { key: 'y', status: 'changed', supplierTitle: 'YYY' },
  ];
  const ordenado = sortSupplierGroupsForReview(groups, { overrides: {}, editedAt: {} });
  assert.deepEqual(ordenado.map((group) => group.key), ['y', 'x']);
  assert.ok(SUPPLIER_STATUS_WEIGHT.changed < SUPPLIER_STATUS_WEIGHT.ignored);
});

test('no muta la lista original', () => {
  const groups = [{ key: 'a', status: 'ignored' }, { key: 'b', status: 'changed' }];
  const copia = [...groups];
  sortSupplierGroupsForReview(groups, { overrides: {}, editedAt: {} });
  assert.deepEqual(groups, copia);
});
