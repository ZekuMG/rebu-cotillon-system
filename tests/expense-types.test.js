import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBusinessResult,
  classifyExpenseCategory,
  EXPENSE_CATEGORY_OPTIONS,
} from '../src/utils/expenseTypes.js';

test('cada categoría del gasto cae en su tipo', () => {
  assert.equal(classifyExpenseCategory('Proveedores'), 'merchandise');
  assert.equal(classifyExpenseCategory('Sueldos'), 'salaries');
  assert.equal(classifyExpenseCategory('Servicios/Operativos'), 'fixed');
  assert.equal(classifyExpenseCategory('Retiros de Socios'), 'withdrawals');
  assert.equal(classifyExpenseCategory('Otros'), 'other');
  assert.equal(classifyExpenseCategory(''), 'other');
  assert.equal(classifyExpenseCategory(null), 'other');
  // tolera mayúsculas y espacios de cargas viejas
  assert.equal(classifyExpenseCategory('  proveedores '), 'merchandise');
});

test('"Sueldos" está entre las opciones para cargar un gasto', () => {
  assert.ok(EXPENSE_CATEGORY_OPTIONS.includes('Sueldos'));
  assert.ok(EXPENSE_CATEGORY_OPTIONS.includes('Retiros de Socios'));
  assert.equal(EXPENSE_CATEGORY_OPTIONS[0], 'Proveedores');
});

test('las tres cifras cierran entre sí (mes real 14/9 al 13/10)', () => {
  const result = buildBusinessResult({
    revenue: 8011587,
    cost: 4094281,
    expenses: [
      { category: 'Proveedores', amount: 5180000 },
      { category: 'Sueldos', amount: 1510000 },
      { category: 'Servicios/Operativos', amount: 880000 },
      { category: 'Retiros de Socios', amount: 2350000 },
    ],
  });

  assert.equal(result.grossMargin, 8011587 - 4094281);
  assert.equal(result.businessProfit, result.grossMargin - 1510000 - 880000);
  assert.equal(result.afterWithdrawals, result.businessProfit - 2350000);
  assert.equal(result.stockGap, 5180000 - 4094281);
  // lo que bajó la caja = después de retiros − mercadería comprada de más
  assert.equal(result.cashResult, 8011587 - (5180000 + 1510000 + 880000 + 2350000));
  assert.equal(result.cashResult, result.afterWithdrawals - result.stockGap);
});

test('"Otros" cuenta como gasto del negocio, no como retiro', () => {
  const result = buildBusinessResult({
    revenue: 1000,
    cost: 400,
    expenses: [{ category: 'Otros', amount: 100 }],
  });
  assert.equal(result.byType.other, 100);
  assert.equal(result.operatingExpenses, 100);
  assert.equal(result.businessProfit, 500);
  assert.equal(result.withdrawals, 0);
});

test('los descuentos se restan de lo cobrado', () => {
  const result = buildBusinessResult({ revenue: 1000, cost: 400, discountImpact: 50, expenses: [] });
  assert.equal(result.collected, 950);
  assert.equal(result.grossMargin, 550);
  assert.equal(result.cashResult, 950);
});
