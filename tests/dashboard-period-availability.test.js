import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dashboardWidgetsShareSources,
  getDashboardWidgetDataState,
  isDashboardSourceStale,
} from '../src/utils/dashboardPeriodAvailability.js';

const freshSources = {
  transactions: { loading: false, stale: false },
  expenses: { loading: false, stale: false },
  inventory: { loading: false, stale: false },
};

test('hoy queda visible con una carga reciente aunque el historial completo no exista', () => {
  const state = getDashboardWidgetDataState({
    widgetKey: 'revenue',
    filter: 'day',
    sourceState: freshSources,
    periodCoverage: { transactions: false, expenses: false },
  });

  assert.equal(state.needsAttention, false);
  assert.equal(state.periodLabel, 'Hoy');
});

test('semana marca el KPI de ventas hasta completar transacciones', () => {
  const state = getDashboardWidgetDataState({
    widgetKey: 'sales',
    filter: 'week',
    sourceState: freshSources,
    periodCoverage: { transactions: false, expenses: true },
  });

  assert.equal(state.isStale, true);
  assert.deepEqual(state.staleSources, ['transactions']);
});

test('gastos no dependen de completar el historial de ventas', () => {
  const state = getDashboardWidgetDataState({
    widgetKey: 'expenses',
    filter: 'month',
    sourceState: freshSources,
    periodCoverage: { transactions: false, expenses: true },
  });

  assert.equal(state.needsAttention, false);
});

test('ganancia neta exige ventas y gastos completos', () => {
  const state = getDashboardWidgetDataState({
    widgetKey: 'net',
    filter: 'year',
    sourceState: freshSources,
    periodCoverage: { transactions: true, expenses: false },
  });

  assert.equal(state.needsAttention, true);
  assert.deepEqual(state.staleSources, ['expenses']);
});

test('los widgets inferiores no reciben el tratamiento de cobertura', () => {
  const state = getDashboardWidgetDataState({
    widgetKey: 'lowStock',
    filter: 'year',
    sourceState: {
      ...freshSources,
      inventory: { loading: true, stale: false },
    },
    periodCoverage: { transactions: false, expenses: false },
  });

  assert.equal(state.needsAttention, false);
  assert.deepEqual(state.sources, []);
});

test('un fallo cloud conserva el dato cacheado pero mantiene visible la recarga', () => {
  assert.equal(isDashboardSourceStale({
    status: 'loaded',
    dirty: false,
    cloudRefreshFailed: true,
    snapshotComplete: true,
  }), true);
});

test('una carga parcial correcta alcanza para hoy sin marcarla como fallida', () => {
  assert.equal(isDashboardSourceStale({
    status: 'loaded',
    dirty: true,
    cloudRefreshFailed: false,
    snapshotComplete: false,
  }), false);
});

test('una recarga dirigida anima solo el KPI elegido y bloquea los que comparten fuente', () => {
  const salesState = getDashboardWidgetDataState({
    widgetKey: 'sales',
    filter: 'day',
    sourceState: {
      ...freshSources,
      transactions: { loading: true, stale: true },
    },
    targetedWidgetKeys: ['sales'],
  });
  const revenueState = getDashboardWidgetDataState({
    widgetKey: 'revenue',
    filter: 'day',
    sourceState: {
      ...freshSources,
      transactions: { loading: true, stale: true },
    },
    targetedWidgetKeys: ['sales'],
  });

  assert.equal(salesState.isLoading, true);
  assert.equal(revenueState.isLoading, false);
  assert.equal(revenueState.isRefreshBlocked, true);
  assert.equal(dashboardWidgetsShareSources('revenue', ['sales']), true);
  assert.equal(dashboardWidgetsShareSources('expenses', ['sales']), false);
});

test('una carga ajena a la recarga dirigida sigue animando su KPI', () => {
  const expensesState = getDashboardWidgetDataState({
    widgetKey: 'expenses',
    sourceState: {
      ...freshSources,
      transactions: { loading: true, stale: false },
      expenses: { loading: true, stale: false },
    },
    targetedWidgetKeys: ['sales'],
  });

  assert.equal(expensesState.isLoading, true);
  assert.equal(expensesState.isRefreshBlocked, false);
});
