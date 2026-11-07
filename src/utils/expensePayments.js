import { PAYMENT_METHODS } from '../data/paymentMethods.js';

const toCents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);

// Expense amounts are final outflows: never apply the sales credit surcharge.
export const getExpensePaymentBreakdown = (expense = {}) => {
  const lines = expense.payment_breakdown ?? expense.paymentBreakdown;
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((line) => ({
      method: line.method || line.payment_method || 'Efectivo',
      amount: toCents(line.amount || 0) / 100,
    }));
  }
  return [{
    method: expense.payment_method || expense.paymentMethod || 'Efectivo',
    amount: toCents(expense.amount || 0) / 100,
  }];
};

export const getExpensePaymentError = (lines, total) => {
  if (!Number.isFinite(Number(total)) || toCents(total) <= 0) {
    return 'Ingresá un monto mayor a cero.';
  }
  if (!Array.isArray(lines) || lines.length === 0) return 'Elegí un método de pago.';
  if (lines.some((line) => !PAYMENT_METHODS.some((method) => method.id === line.method))) {
    return 'Elegí un método de pago válido.';
  }
  if (new Set(lines.map((line) => line.method)).size !== lines.length) {
    return 'Usá una sola fila por método de pago.';
  }
  if (lines.some((line) => !Number.isFinite(Number(line.amount)) || toCents(line.amount) <= 0)) {
    return 'Ingresá un importe mayor a cero para cada método.';
  }
  if (lines.reduce((sum, line) => sum + toCents(line.amount), 0) !== toCents(total)) {
    return 'La suma de los métodos debe coincidir con el monto del gasto.';
  }
  return '';
};

export const getExpensePaymentMethod = (expense) =>
  getExpensePaymentBreakdown(expense).map((line) => line.method).join(' + ');

export const getExpensePaymentTotals = (expense) =>
  getExpensePaymentBreakdown(expense).reduce((totals, line) => {
    totals[line.method] = (toCents(totals[line.method] || 0) + toCents(line.amount)) / 100;
    return totals;
  }, {});

export const getExpenseCashAmount = (expense) => getExpensePaymentTotals(expense).Efectivo || 0;
