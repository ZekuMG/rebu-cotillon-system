import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRecentTransactionSnapshot,
  createTransactionSnapshotPersistence,
  isTransactionHistorySnapshotFresh,
  loadTransactionHistorySnapshot,
  normalizeTransactionHistorySnapshot,
  saveTransactionHistorySnapshot,
} from '../src/utils/transactionHistoryCache.js';

const savedAt = '2026-08-03T12:00:00.000Z';

test('solo un snapshot completo y fechado puede respaldar el historial', () => {
  const valid = normalizeTransactionHistorySnapshot({
    savedAt,
    transactionsScope: 'full',
    transactions: [{ id: 'sale-1' }],
  });

  assert.deepEqual(valid, {
    savedAt,
    transactionsScope: 'full',
    transactions: [{ id: 'sale-1' }],
  });
  assert.equal(normalizeTransactionHistorySnapshot({ ...valid, transactionsScope: 'partial' }), null);
  assert.equal(normalizeTransactionHistorySnapshot({ ...valid, savedAt: 'invalid' }), null);
});

test('un historial local completo solo se confia durante la ventana definida', () => {
  const snapshot = {
    savedAt,
    transactionsScope: 'full',
    transactions: [],
  };

  assert.equal(isTransactionHistorySnapshotFresh(snapshot, {
    now: Date.parse(savedAt) + 60_000,
    maxAgeMs: 120_000,
  }), true);
  assert.equal(isTransactionHistorySnapshotFresh(snapshot, {
    now: Date.parse(savedAt) + 180_000,
    maxAgeMs: 120_000,
  }), false);
});

test('sin IndexedDB la cache se desactiva sin afectar la carga de datos', async () => {
  assert.equal(await loadTransactionHistorySnapshot(), null);
  assert.equal(await saveTransactionHistorySnapshot({
    savedAt,
    transactionsScope: 'full',
    transactions: [{ id: 'sale-1' }],
  }), false);
});

test('localStorage recibe solo una copia reciente marcada como parcial', () => {
  const snapshot = buildRecentTransactionSnapshot({
    savedAt,
    transactionsScope: 'full',
    transactions: [
      { id: 'sale-3' },
      { id: 'sale-2' },
      { id: 'sale-1' },
    ],
  }, { maxTransactions: 2 });

  assert.deepEqual(snapshot, {
    savedAt,
    transactionsScope: 'partial',
    transactions: [{ id: 'sale-3' }, { id: 'sale-2' }],
  });
});

test('el guardado completo va a IndexedDB y el reciente queda para arranque rapido', async () => {
  const queuedTasks = [];
  const recentSnapshots = [];
  const fullSnapshots = [];
  const fallbackSnapshots = [];
  const persistence = createTransactionSnapshotPersistence({
    scheduleTask: (task) => queuedTasks.push(task),
    maxRecentTransactions: 1,
    saveRecentSnapshot: (snapshot) => recentSnapshots.push(snapshot),
    saveFullSnapshot: async (snapshot) => {
      fullSnapshots.push(snapshot);
      return true;
    },
    saveFallbackSnapshot: (snapshot) => fallbackSnapshots.push(snapshot),
  });
  const fullSnapshot = {
    savedAt,
    transactionsScope: 'full',
    transactions: [{ id: 'sale-2' }, { id: 'sale-1' }],
  };

  persistence.schedule(fullSnapshot);
  assert.equal(queuedTasks.length, 1);
  await queuedTasks[0]();
  await persistence.flush();

  assert.deepEqual(recentSnapshots, [{
    savedAt,
    transactionsScope: 'partial',
    transactions: [{ id: 'sale-2' }],
  }]);
  assert.deepEqual(fullSnapshots, [fullSnapshot]);
  assert.deepEqual(fallbackSnapshots, []);
});

test('si IndexedDB no esta disponible se conserva el snapshot completo como fallback', async () => {
  const queuedTasks = [];
  const fallbackSnapshots = [];
  const persistence = createTransactionSnapshotPersistence({
    scheduleTask: (task) => queuedTasks.push(task),
    saveRecentSnapshot: () => {},
    saveFullSnapshot: async () => false,
    saveFallbackSnapshot: (snapshot) => fallbackSnapshots.push(snapshot),
  });
  const fullSnapshot = {
    savedAt,
    transactionsScope: 'full',
    transactions: [{ id: 'sale-1' }],
  };

  persistence.schedule(fullSnapshot);
  await queuedTasks[0]();

  assert.deepEqual(fallbackSnapshots, [fullSnapshot]);
});

test('varios guardados pendientes se consolidan usando el snapshot mas nuevo', async () => {
  const queuedTasks = [];
  const recentSnapshots = [];
  const persistence = createTransactionSnapshotPersistence({
    scheduleTask: (task) => queuedTasks.push(task),
    saveRecentSnapshot: (snapshot) => recentSnapshots.push(snapshot),
  });

  persistence.schedule({ savedAt: '2026-08-03T12:00:00.000Z', transactionsScope: 'partial', transactions: [{ id: 1 }] });
  persistence.schedule({ savedAt: '2026-08-03T12:01:00.000Z', transactionsScope: 'partial', transactions: [{ id: 2 }] });
  assert.equal(queuedTasks.length, 1);

  await queuedTasks[0]();
  await persistence.flush();

  assert.equal(recentSnapshots.length, 1);
  assert.equal(recentSnapshots[0].savedAt, '2026-08-03T12:01:00.000Z');
  assert.deepEqual(recentSnapshots[0].transactions, [{ id: 2 }]);
});
