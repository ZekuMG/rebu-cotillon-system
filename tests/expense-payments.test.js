import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getExpenseCashAmount,
  getExpensePaymentBreakdown,
  getExpensePaymentError,
  getExpensePaymentMethod,
  getExpensePaymentTotals,
} from '../src/utils/expensePayments.js';

test('los gastos anteriores imputan todo a su método original', () => {
  assert.deepEqual(getExpensePaymentBreakdown({ amount: '1250.50', payment_method: 'MercadoPago' }), [
    { method: 'MercadoPago', amount: 1250.5 },
  ]);
  assert.equal(getExpenseCashAmount({ amount: 100 }), 100);
  assert.equal(getExpenseCashAmount({ amount: 100, paymentMethod: 'Debito' }), 0);
  assert.equal(getExpenseCashAmount({ amount: 100, paymentMethod: 'Efectivo', payment_breakdown: [] }), 100);
});

test('un gasto mixto descuenta de caja solo la parte en efectivo', () => {
  const expense = {
    amount: 10000,
    payment_breakdown: [{ method: 'Efectivo', amount: 3500 }, { method: 'MercadoPago', amount: 6500 }],
  };
  assert.equal(getExpenseCashAmount(expense), 3500);
  assert.equal(getExpensePaymentMethod(expense), 'Efectivo + MercadoPago');
  assert.deepEqual(getExpensePaymentTotals(expense), { Efectivo: 3500, MercadoPago: 6500 });
  assert.equal(getExpensePaymentError(getExpensePaymentBreakdown(expense), expense.amount), '');
});

test('los gastos con crédito conservan el importe final sin recargo', () => {
  const expense = { amount: 1000, paymentBreakdown: [{ method: 'Credito', amount: 1000 }] };
  assert.deepEqual(getExpensePaymentTotals(expense), { Credito: 1000 });
  assert.equal(getExpenseCashAmount(expense), 0);
});

test('la suma usa centavos para admitir 0,10 + 0,20 sin diferencias de flotantes', () => {
  const lines = [{ method: 'Efectivo', amount: 0.1 }, { method: 'Debito', amount: 0.2 }];
  assert.equal(getExpensePaymentError(lines, 0.3), '');
  assert.notEqual(getExpensePaymentError(lines, 0.31), '');
});

test('rechaza reparto incompleto, excesivo, duplicado o con importes inválidos', () => {
  const cases = [
    [{ method: 'Efectivo', amount: 60 }, { method: 'Debito', amount: 30 }],
    [{ method: 'Efectivo', amount: 60 }, { method: 'Debito', amount: 50 }],
    [{ method: 'Efectivo', amount: 60 }, { method: 'Efectivo', amount: 40 }],
    [{ method: 'Efectivo', amount: 100 }, { method: 'Debito', amount: 0 }],
    [{ method: 'Efectivo', amount: 110 }, { method: 'Debito', amount: -10 }],
    [{ method: 'Efectivo', amount: 100 }, { method: 'Debito', amount: '' }],
    [{ method: 'Efectivo', amount: NaN }],
    [{ method: 'Efectivo', amount: Infinity }],
    [{ method: 'Desconocido', amount: 100 }],
    [],
    null,
  ];
  for (const lines of cases) assert.notEqual(getExpensePaymentError(lines, 100), '');
  assert.notEqual(getExpensePaymentError([{ method: 'Efectivo', amount: 100 }], Infinity), '');
});

test('al volver a un método único se reemplaza el reparto anterior', () => {
  const expense = {
    amount: 100,
    payment_method: 'Efectivo + MercadoPago',
    paymentBreakdown: [{ method: 'Efectivo', amount: 40 }, { method: 'MercadoPago', amount: 60 }],
    payment_breakdown: [{ method: 'Debito', amount: 100 }],
  };
  assert.equal(getExpensePaymentMethod(expense), 'Debito');
  assert.equal(getExpenseCashAmount(expense), 0);
  assert.deepEqual(getExpensePaymentTotals(expense), { Debito: 100 });
});
