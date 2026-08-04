import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DASHBOARD_SNAPSHOT_SCOPE_FULL,
  DASHBOARD_SNAPSHOT_SCOPE_PARTIAL,
  getDashboardSnapshotScope,
  needsDashboardFullBackfill,
  shouldUseIncrementalDashboardSync,
} from '../src/utils/dashboardSync.js';

test('un snapshot anterior del Dashboard se considera parcial', () => {
  assert.equal(
    getDashboardSnapshotScope({ dailyLogs: [], expenses: [], pastClosures: [] }),
    DASHBOARD_SNAPSHOT_SCOPE_PARTIAL,
  );
});

test('solo un snapshot completo y valido habilita la sincronizacion incremental', () => {
  const snapshotScope = getDashboardSnapshotScope({
    dailyLogs: [],
    expenses: [],
    pastClosures: [],
    dashboardScope: DASHBOARD_SNAPSHOT_SCOPE_FULL,
  });

  assert.equal(
    shouldUseIncrementalDashboardSync({
      hasExistingDashboardData: true,
      snapshotScope,
    }),
    true,
  );
});

test('una recarga anual nunca usa un snapshot incremental', () => {
  assert.equal(
    shouldUseIncrementalDashboardSync({
      fullRequested: true,
      hasExistingDashboardData: true,
      snapshotScope: DASHBOARD_SNAPSHOT_SCOPE_FULL,
    }),
    false,
  );
});

test('el backfill continua mientras Dashboard o ventas sean parciales', () => {
  assert.equal(
    needsDashboardFullBackfill({ dashboardScope: 'partial', transactionScope: 'full' }),
    true,
  );
  assert.equal(
    needsDashboardFullBackfill({ dashboardScope: 'full', transactionScope: 'partial' }),
    true,
  );
  assert.equal(
    needsDashboardFullBackfill({ dashboardScope: 'full', transactionScope: 'full' }),
    false,
  );
});
