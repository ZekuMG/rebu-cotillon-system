import test from 'node:test';
import assert from 'node:assert/strict';

import { describeSupplierCostDrift } from '../src/utils/supplierCostDrift.js';

test('avisa cuando el costo de Rebu se aparto del que sale del proveedor', () => {
  const drift = describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 10, status: 'approved' });
  assert.equal(drift.direction, 'down', 'el costo de Rebu quedo por debajo');
  assert.equal(drift.delta, -990);
  assert.equal(Math.round(drift.percent), -99);
});

test('tambien cuando el costo de Rebu quedo mas alto', () => {
  const drift = describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 9999, status: 'reviewed' });
  assert.equal(drift.direction, 'up');
  assert.equal(drift.delta, 8999);
});

test('no avisa nada si los numeros coinciden', () => {
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 1000, status: 'approved' }), null);
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 1000.5, status: 'approved' }), null,
    'medio peso es redondeo, no un desvio');
});

test('solo aplica a las filas ya resueltas: el resto ya lo dice su estado', () => {
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 10, status: 'changed' }), null);
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 10, status: 'unchecked' }), null);
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 10, status: 'ignored' }).direction, 'down');
});

test('sin datos comparables no inventa un aviso', () => {
  assert.equal(describeSupplierCostDrift({ estimatedCost: 0, currentCost: 1000, status: 'approved' }), null);
  assert.equal(describeSupplierCostDrift({ estimatedCost: 1000, currentCost: 0, status: 'approved' }), null);
  assert.equal(describeSupplierCostDrift({}), null);
});
