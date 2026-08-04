import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDashboardPeriodView } from '../src/utils/dashboardPeriodAvailability.js';

test('semana incompleta muestra hoy cuando ya existen datos del dia', () => {
  assert.deepEqual(resolveDashboardPeriodView({
    requestedFilter: 'week',
    isPeriodDataComplete: false,
    hasTodayData: true,
  }), {
    requestedFilter: 'week',
    requestedLabel: 'Semana',
    effectiveFilter: 'day',
    isExpandedPeriod: true,
    isIncomplete: true,
    isShowingDayFallback: true,
  });
});

test('mes completo usa el periodo solicitado', () => {
  const view = resolveDashboardPeriodView({
    requestedFilter: 'month',
    isPeriodDataComplete: true,
    hasTodayData: true,
  });

  assert.equal(view.effectiveFilter, 'month');
  assert.equal(view.isIncomplete, false);
  assert.equal(view.isShowingDayFallback, false);
});

test('sin datos de hoy conserva la vista solicitada pero la marca incompleta', () => {
  const view = resolveDashboardPeriodView({
    requestedFilter: 'year',
    isPeriodDataComplete: false,
    hasTodayData: false,
  });

  assert.equal(view.effectiveFilter, 'year');
  assert.equal(view.isIncomplete, true);
  assert.equal(view.isShowingDayFallback, false);
});

test('el filtro diario nunca requiere fallback', () => {
  const view = resolveDashboardPeriodView({
    requestedFilter: 'day',
    isPeriodDataComplete: false,
    hasTodayData: true,
  });

  assert.equal(view.effectiveFilter, 'day');
  assert.equal(view.isIncomplete, false);
});
