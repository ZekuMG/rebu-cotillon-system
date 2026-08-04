import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDashboardTransactionSummary } from '../src/utils/dashboardAggregations.js';

test('los medios de pago se normalizan una sola vez por venta', () => {
  let paymentResolverCalls = 0;
  const summary = buildDashboardTransactionSummary({
    transactions: [
      { id: 1, items: [{ id: 'item-1' }] },
      { id: 2, items: [{ id: 'item-2' }] },
    ],
    paymentMethods: [{ label: 'Efectivo' }, { label: 'Tarjeta' }],
    resolvePaymentTotals: (transaction) => {
      paymentResolverCalls += 1;
      return transaction.id === 1
        ? { Efectivo: 100, Tarjeta: 25 }
        : { Efectivo: 50, Tarjeta: 75 };
    },
    resolveRankingItem: (item) => ({ id: item.id }),
  });

  assert.equal(paymentResolverCalls, 2);
  assert.deepEqual(summary.paymentTotals, { Efectivo: 150, Tarjeta: 100 });
  assert.deepEqual(summary.rankingItems, [{ id: 'item-1' }, { id: 'item-2' }]);
});

test('los descuentos se pueden excluir durante el mismo recorrido de agregacion', () => {
  const summary = buildDashboardTransactionSummary({
    transactions: [{
      metricItems: [
        { id: 'product-1' },
        { id: 'discount-1', isDiscount: true },
      ],
    }],
    resolveRankingItem: (item) => (item.isDiscount ? null : item),
  });

  assert.deepEqual(summary.rankingItems, [{ id: 'product-1' }]);
});
