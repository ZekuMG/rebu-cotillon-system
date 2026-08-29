import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  formatLocalDateInputValue,
  isFutureExpenseDate,
  normalizeExpenseDateValue,
  parseExpenseDateValue,
} from '../src/utils/expenseDates.js';
import { CLOUD_SELECTS } from '../src/utils/cloudSelects.js';

test('la fecha operativa del gasto conserva el dia local', () => {
  const parsedDate = parseExpenseDateValue('2026-08-15');

  assert.equal(formatLocalDateInputValue(parsedDate), '2026-08-15');
  assert.equal(normalizeExpenseDateValue('2026-08-15'), '2026-08-15');
  assert.equal(parseExpenseDateValue('2026-02-31'), null);
});

test('no permite imputar gastos en una fecha futura', () => {
  const now = new Date(2026, 7, 28, 18, 30);

  assert.equal(isFutureExpenseDate('2026-08-28', now), false);
  assert.equal(isFutureExpenseDate('2026-08-29', now), true);
});

test('el mapper y las metricas priorizan expense_date sobre created_at', async () => {
  const [mapperSource, metricsSource] = await Promise.all([
    readFile(new URL('../src/utils/cloudMappers.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/salesMetricsCore.js', import.meta.url), 'utf8'),
  ]);

  assert.match(mapperSource, /expense\.expense_date \|\| expense\.expenseDate \|\| createdAt/);
  assert.match(mapperSource, /expense_date: expenseDate,[\s\S]+?metricDate,/);
  assert.match(metricsSource, /record\?\.metricDate \|\|[\s\S]+?record\?\.expense_date \|\|[\s\S]+?record\?\.createdAt/);
});

test('la carga y la migracion incluyen la fecha del gasto', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260829023518_add_expense_date.sql', import.meta.url),
    'utf8',
  );

  assert.ok(CLOUD_SELECTS.expenses.split(',').includes('expense_date'));
  assert.match(migration, /add column if not exists expense_date date/i);
  assert.match(migration, /alter column expense_date set not null/i);
});
