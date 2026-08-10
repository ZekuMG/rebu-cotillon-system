import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderPoints,
  getFinalizationPointsToCredit,
  getOrderPointsDelta,
  buildOrderOperationKey,
  ORDER_POINT_AMOUNT,
} from '../src/utils/orderPoints.js';

test('acredita un punto por cada tramo completo abonado', () => {
  assert.equal(ORDER_POINT_AMOUNT, 500);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 499, totalAmount: 2_000 }), 0);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 500, totalAmount: 2_000 }), 1);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 1_499.99, totalAmount: 2_000 }), 2);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 1_500, totalAmount: 2_000 }), 3);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 2_500, totalAmount: 2_000 }), 4);
});

test('suma solamente los puntos nuevos al registrar otro pago', () => {
  assert.deepEqual(
    getOrderPointsDelta(
      { memberId: 10, paidTotal: 900, totalAmount: 2_000 },
      { memberId: 10, paidTotal: 1_100, totalAmount: 2_000 },
    ),
    { previousPoints: 1, nextPoints: 2, delta: 1 },
  );
});

test('revierte puntos al reducir la seña o cancelar el pedido', () => {
  assert.equal(
    getOrderPointsDelta(
      { memberId: 10, paidTotal: 1_400, totalAmount: 2_000 },
      { memberId: 10, paidTotal: 400, totalAmount: 2_000 },
    ).delta,
    -2,
  );
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 1_400, totalAmount: 2_000, status: 'Cancelado' }), 0);
  assert.equal(calculateOrderPoints({ memberId: 10, paidTotal: 1_400, totalAmount: 2_000, isActive: false }), 0);
});

test('no acredita puntos cuando el presupuesto no está vinculado a un socio', () => {
  assert.equal(calculateOrderPoints({ paidTotal: 10_000, totalAmount: 10_000 }), 0);
});

test('la venta final no vuelve a sumar puntos ya acreditados por el pedido', () => {
  assert.equal(getFinalizationPointsToCredit({ pointsCredited: 3, pointsAccountingMode: 'incremental' }, 3), 0);
  assert.equal(getFinalizationPointsToCredit({ pointsCredited: 0, pointsAccountingMode: 'incremental' }, 3), 0);
  assert.equal(getFinalizationPointsToCredit({ pointsCredited: 3, pointsAccountingMode: 'legacy' }, 3), 3);
  assert.equal(getFinalizationPointsToCredit({ pointsCredited: null }, 3), 3);
});

test('la clave idempotente cambia con la versiÃ³n y conserva el reintento', () => {
  const first = buildOrderOperationKey('payment', 'abc', 2, 'entry-1');
  assert.equal(first, buildOrderOperationKey('payment', 'abc', 2, 'entry-1'));
  assert.notEqual(first, buildOrderOperationKey('payment', 'abc', 3, 'entry-1'));
  assert.ok(first.length <= 180);
});
