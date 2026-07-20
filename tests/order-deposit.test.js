import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderPaymentEntry,
  createOrderPaymentLine,
  replaceOrderDepositPaymentHistory,
} from '../src/utils/paymentBreakdown.js';

const totalHistory = (history) =>
  history.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

test('replaces the initial deposit and preserves later payments', () => {
  const history = [
    createOrderPaymentEntry({
      id: 'deposit-1',
      entryType: 'deposit',
      amount: 40,
      lines: [createOrderPaymentLine({ method: 'Efectivo', amount: 40 })],
    }),
    createOrderPaymentEntry({
      id: 'payment-1',
      entryType: 'payment',
      amount: 20,
      lines: [createOrderPaymentLine({ method: 'Debito', amount: 20 })],
    }),
  ];
  const nextDepositEntry = createOrderPaymentEntry({
    entryType: 'deposit',
    amount: 55,
    lines: [createOrderPaymentLine({ method: 'MercadoPago', amount: 55 })],
  });

  const nextHistory = replaceOrderDepositPaymentHistory(history, {
    currentDepositAmount: 40,
    nextDepositEntry,
    fallbackPaidTotal: 60,
  });

  assert.equal(nextHistory.length, 2);
  assert.equal(nextHistory[0].id, 'deposit-1');
  assert.equal(nextHistory[0].amount, 55);
  assert.equal(nextHistory[0].lines[0].method, 'MercadoPago');
  assert.equal(nextHistory[1].id, 'payment-1');
  assert.equal(totalHistory(nextHistory), 75);
});

test('can clear the deposit without deleting later payments', () => {
  const history = [
    createOrderPaymentEntry({
      entryType: 'deposit',
      amount: 30,
      lines: [createOrderPaymentLine({ amount: 30 })],
    }),
    createOrderPaymentEntry({
      id: 'payment-2',
      entryType: 'payment',
      amount: 15,
      lines: [createOrderPaymentLine({ method: 'Debito', amount: 15 })],
    }),
  ];

  const nextHistory = replaceOrderDepositPaymentHistory(history, {
    currentDepositAmount: 30,
    nextDepositEntry: null,
    fallbackPaidTotal: 45,
  });

  assert.equal(nextHistory.length, 1);
  assert.equal(nextHistory[0].id, 'payment-2');
  assert.equal(totalHistory(nextHistory), 15);
});

test('splits a legacy aggregate into corrected deposit and additional paid amount', () => {
  const legacyLines = [
    createOrderPaymentLine({ method: 'Efectivo', amount: 50 }),
    createOrderPaymentLine({ method: 'Debito', amount: 50 }),
  ];
  const nextDepositEntry = createOrderPaymentEntry({
    entryType: 'deposit',
    amount: 25,
    lines: [createOrderPaymentLine({ method: 'Efectivo', amount: 25 })],
  });

  const nextHistory = replaceOrderDepositPaymentHistory(legacyLines, {
    currentDepositAmount: 40,
    nextDepositEntry,
    fallbackPaidTotal: 100,
  });

  assert.equal(nextHistory[0].entryType, 'deposit');
  assert.equal(nextHistory[0].amount, 25);
  assert.equal(nextHistory[1].entryType, 'legacy');
  assert.equal(nextHistory[1].amount, 60);
  assert.equal(totalHistory(nextHistory), 85);
});
