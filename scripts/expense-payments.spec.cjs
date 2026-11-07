const { test, expect } = require('playwright/test');
const { build } = require('esbuild');

// Exercise the actual component, mapper and metrics without writing live expenses.
let harness;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ExpenseModal } from './src/components/modals/ExpenseModal.jsx';
        import { mapExpenseRecords } from './src/utils/cloudMappers.js';
        import { buildSalesDataset, filterExpensesForSales } from './src/utils/salesMetricsCore.js';
        import * as payments from './src/utils/expensePayments.js';
        const root = createRoot(document.getElementById('root'));
        let instance = 0;
        window.expenseModel = { mapExpenseRecords, buildSalesDataset, filterExpensesForSales, ...payments };
        window.configureExpense = (props = {}) => {
          const state = window.expenseState = { calls: [], closes: 0, prevented: [] };
          root.render(React.createElement(ExpenseModal, {
            key: ++instance,
            isOpen: true,
            ...props,
            onClose: () => { state.closes++; },
            onSave: (payload) => {
              state.calls.push(payload);
              return new Promise((resolve) => { window.finishExpenseSave = (success) => resolve(success ? payload : null); });
            },
          }));
        };
        document.addEventListener('submit', (event) => {
          window.expenseState.prevented.push(event.defaultPrevented);
          // Keep a broken submit from navigating away so the regression is visible.
          event.preventDefault();
        });
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  harness = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('http://expense-check.local/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="root"></div><script src="/harness.js"></script></body></html>',
  }));
  await page.route('http://expense-check.local/harness.js', (route) => route.fulfill({
    contentType: 'text/javascript', body: harness,
  }));
  await page.goto('http://expense-check.local/', { waitUntil: 'networkidle' });
});

test('un gasto anterior abre en solo lectura sin permitir cambios', async ({ page }) => {
  await page.evaluate(() => window.configureExpense({
    mode: 'edit', readOnly: true,
    initialExpense: { id: 1, amount: 1250.5, payment_method: 'MercadoPago', expense_date: '2026-11-01' },
  }));
  const dialog = page.getByRole('dialog', { name: 'Detalle de Gasto' });
  await expect(dialog.getByLabel('Monto del Gasto *')).toHaveValue('1250.5');
  await expect(dialog.getByLabel('Método de pago 1', { exact: true })).toHaveValue('MercadoPago');
  await expect(dialog.getByLabel('Método de pago 1', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Agregar método' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
});

test('quitar un método vuelve al pago único y usa el total actualizado', async ({ page }) => {
  await page.evaluate(() => window.configureExpense({
    mode: 'edit',
    initialExpense: {
      id: 2, amount: 10000, expenseDate: '2026-11-01',
      paymentBreakdown: [{ method: 'Efectivo', amount: 4000 }, { method: 'MercadoPago', amount: 6000 }],
    },
  }));
  const dialog = page.getByRole('dialog', { name: 'Editar Gasto' });
  await dialog.getByRole('button', { name: 'Quitar método de pago 1', exact: true }).click();
  await dialog.getByLabel('Monto del Gasto *').fill('12000.25');
  await expect(dialog.getByLabel('Importe del método 1')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  const saved = await page.evaluate(() => window.expenseState.calls[0]);
  expect(saved.paymentBreakdown).toEqual([{ method: 'MercadoPago', amount: 12000.25 }]);
  expect(saved.paymentMethod).toBe('MercadoPago');
});

test('los cuatro métodos respetan el total con centavos y crédito no agrega recargo', async ({ page }) => {
  await page.evaluate(() => window.configureExpense());
  const dialog = page.getByRole('dialog', { name: 'Registrar Gasto' });
  await dialog.getByLabel('Monto del Gasto *').fill('100.03');
  for (let index = 0; index < 3; index++) {
    await dialog.getByRole('button', { name: 'Agregar método' }).click();
  }
  const amounts = ['10.01', '20.01', '30.01', '40.00'];
  for (let index = 0; index < amounts.length; index++) {
    await dialog.getByLabel(`Importe del método ${index + 1}`, { exact: true }).fill(amounts[index]);
  }
  await expect(dialog.getByRole('button', { name: 'Agregar método' })).toHaveCount(0);
  const save = dialog.getByRole('button', { name: 'Confirmar Gasto' });
  await expect(save).toBeEnabled();
  await dialog.getByLabel('Monto del Gasto *').fill('100.04');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Monto del Gasto *').fill('100.03');
  await dialog.getByLabel('Importe del método 4', { exact: true }).fill('-40');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Importe del método 4', { exact: true }).fill('0');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Importe del método 4', { exact: true }).fill('40.00');
  await save.click();
  const payload = await page.evaluate(() => window.expenseState.calls[0]);
  expect(payload.amount).toBe(100.03);
  expect(payload.paymentBreakdown).toEqual([
    { method: 'Efectivo', amount: 10.01 }, { method: 'MercadoPago', amount: 20.01 },
    { method: 'Debito', amount: 30.01 }, { method: 'Credito', amount: 40 },
  ]);
});

test('el doble envío se cancela y todos los controles se bloquean durante el guardado', async ({ page }) => {
  await page.evaluate(() => window.configureExpense());
  const dialog = page.getByRole('dialog', { name: 'Registrar Gasto' });
  await dialog.getByLabel('Monto del Gasto *').fill('100');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    form.requestSubmit();
    form.requestSubmit();
  });
  expect(await page.evaluate(() => window.expenseState.calls.length)).toBe(1);
  expect(await page.evaluate(() => window.expenseState.prevented)).toEqual([true, true]);
  await expect(dialog.getByLabel('Monto del Gasto *')).toBeDisabled();
  await expect(dialog.locator('textarea')).toBeDisabled();
  await expect(dialog.getByRole('combobox').first()).toBeDisabled();
  await expect(dialog.locator('button[aria-haspopup="dialog"]')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cerrar gasto' })).toBeDisabled();
  await page.evaluate(() => window.finishExpenseSave(false));
  await expect(dialog.getByLabel('Monto del Gasto *')).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Confirmar Gasto' })).toBeEnabled();
});

test('un formulario nuevo limpia el reparto y la nota del gasto anterior', async ({ page }) => {
  await page.evaluate(() => window.configureExpense({
    mode: 'edit', initialExpense: {
      id: 4, amount: 300, description: 'Proveedor anterior', expenseDate: '2026-11-01',
      paymentBreakdown: [{ method: 'Efectivo', amount: 100 }, { method: 'MercadoPago', amount: 200 }],
    },
  }));
  await expect(page.getByLabel('Importe del método 2', { exact: true })).toHaveValue('200');
  await page.evaluate(() => window.configureExpense());
  const dialog = page.getByRole('dialog', { name: 'Registrar Gasto' });
  await expect(dialog.getByLabel('Monto del Gasto *')).toHaveValue('');
  await expect(dialog.getByLabel('Método de pago 1', { exact: true })).toHaveValue('Efectivo');
  await expect(dialog.getByLabel('Método de pago 2', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('textarea')).toHaveValue('');
});

test('un guardado fallido conserva el reparto y el reintento guarda una sola vez', async ({ page }) => {
  await page.evaluate(() => window.configureExpense());
  const dialog = page.getByRole('dialog', { name: 'Registrar Gasto' });
  await dialog.getByLabel('Monto del Gasto *').fill('0.30');
  await dialog.getByRole('button', { name: 'Agregar método' }).click();
  await dialog.getByLabel('Importe del método 1', { exact: true }).fill('0.10');
  await dialog.getByLabel('Importe del método 2', { exact: true }).fill('0.20');
  await dialog.getByRole('button', { name: 'Confirmar Gasto' }).click();
  await page.evaluate(() => window.finishExpenseSave(false));
  expect(await page.evaluate(() => window.expenseState.closes)).toBe(0);
  await expect(dialog.getByLabel('Importe del método 1', { exact: true })).toHaveValue('0.10');
  await expect(dialog.getByLabel('Importe del método 2', { exact: true })).toHaveValue('0.20');
  await dialog.getByRole('button', { name: 'Confirmar Gasto' }).click();
  await page.evaluate(() => window.finishExpenseSave(true));
  expect(await page.evaluate(() => window.expenseState.closes)).toBe(1);
  const calls = await page.evaluate(() => window.expenseState.calls);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[1].paymentBreakdown).toEqual([{ method: 'Efectivo', amount: 0.1 }, { method: 'MercadoPago', amount: 0.2 }]);
});

test('al recargar y recuperar caché mantiene el reparto sin duplicar el gasto en métricas', async ({ page }) => {
  const result = await page.evaluate(() => {
    const model = window.expenseModel;
    const [expense] = model.mapExpenseRecords([{
      id: 3, created_at: '2026-11-01T15:00:00Z', expense_date: '2026-11-01',
      amount: '10000', description: 'Proveedor', category: 'Proveedores',
      payment_method: 'Efectivo + Credito',
      payment_breakdown: [{ method: 'Efectivo', amount: 2500.5 }, { method: 'Credito', amount: 7499.5 }],
    }]);
    const cached = JSON.parse(JSON.stringify(expense));
    const range = { start: new Date('2026-11-01T00:00:00'), end: new Date('2026-11-01T23:59:59') };
    const dataset = model.buildSalesDataset({ transactions: [], expenses: [cached], range, filters: {} });
    return {
      cash: model.getExpenseCashAmount(cached),
      payments: model.getExpensePaymentTotals(cached),
      expenseTotal: dataset.stats.expenses,
      count: dataset.filteredExpenses.length,
      matchesCredit: model.filterExpensesForSales({ expenses: [cached], range, filters: { payment: 'Credito' } }).length,
      excludesDebit: model.filterExpensesForSales({ expenses: [cached], range, filters: { payment: 'Debito' } }).length,
    };
  });
  expect(result).toEqual({
    cash: 2500.5, payments: { Efectivo: 2500.5, Credito: 7499.5 },
    expenseTotal: 10000, count: 1, matchesCredit: 1, excludesDebit: 0,
  });
});
