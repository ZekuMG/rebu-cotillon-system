import test from 'node:test';
import assert from 'node:assert/strict';

import {
  doesCloudLoadCoverRequest,
  fetchCloudPayloadWithMutationGuard,
  fetchCloudPayloadWithRetries,
  getIncrementalSyncCutoff,
  getLatestCloudRecordTimestamp,
  getProductSnapshotScope,
  mergeCloudRecordsById,
  PRODUCT_SNAPSHOT_SCOPE_FULL,
  PRODUCT_SNAPSHOT_SCOPE_PARTIAL,
  recordCloudSourceMutations,
  resolveCoveredCloudLoadResult,
  shouldUseIncrementalProductSync,
  summarizeCloudResults,
} from '../src/utils/cloudLoadControl.js';
import {
  fetchAllCloudRowsByIdCursorWithSelectFallback,
  fetchAllCloudRowsWithSelectFallback,
  runSelectWithSchemaFallback,
  sortCloudRowsNewestFirst,
} from '../src/utils/supabaseSchemaFallback.js';

const recoverableNetworkError = Object.assign(new Error('Failed to fetch'), { code: 'NETWORK' });

test('el corte incremental solapa unos minutos y rechaza fechas invalidas o futuras', () => {
  const now = Date.parse('2026-08-25T15:00:00.000Z');

  assert.equal(
    getIncrementalSyncCutoff('2026-08-25T14:55:00.000Z', { now }),
    '2026-08-25T14:50:00.000Z',
  );
  assert.equal(getIncrementalSyncCutoff('fecha-invalida', { now }), null);
  assert.equal(getIncrementalSyncCutoff('2026-08-25T15:10:01.000Z', { now }), null);
  assert.equal(getIncrementalSyncCutoff('2026-08-24T14:59:59.000Z', { now }), null);
});

test('la fusion incremental reemplaza cambios y elimina productos desactivados', () => {
  const merged = mergeCloudRecordsById(
    [
      { id: 1, title: 'Vela', isActive: true, price: 10 },
      { id: 2, title: 'Globo', isActive: true, price: 20 },
    ],
    [
      { id: 1, title: 'Vela', isActive: true, price: 12 },
      { id: 2, title: 'Globo', isActive: false, price: 20 },
      { id: 3, title: 'Bengala', isActive: true, price: 30 },
    ],
    {
      keepRecord: (record) => record.isActive !== false,
      compareRecords: (left, right) => left.title.localeCompare(right.title),
    },
  );

  assert.deepEqual(merged, [
    { id: 3, title: 'Bengala', isActive: true, price: 30 },
    { id: 1, title: 'Vela', isActive: true, price: 12 },
  ]);
});

test('productos solo sincroniza incrementalmente sobre un inventario completo y reciente', () => {
  const now = Date.parse('2026-08-25T15:00:00.000Z');
  const validState = {
    inventoryScope: PRODUCT_SNAPSHOT_SCOPE_FULL,
    inventoryCount: 2838,
    productsSyncedThrough: '2026-08-25T14:30:00.000Z',
    productsFullSyncedAt: '2026-08-25T12:00:00.000Z',
    now,
  };

  assert.equal(shouldUseIncrementalProductSync(validState), true);
  assert.equal(shouldUseIncrementalProductSync({ ...validState, inventoryScope: PRODUCT_SNAPSHOT_SCOPE_PARTIAL }), false);
  assert.equal(shouldUseIncrementalProductSync({ ...validState, inventoryCount: 0 }), false);
  assert.equal(shouldUseIncrementalProductSync({ ...validState, productsSyncedThrough: null }), false);
  assert.equal(shouldUseIncrementalProductSync({ ...validState, productsFullSyncedAt: '2026-08-24T14:59:59.000Z' }), false);
  assert.equal(shouldUseIncrementalProductSync({ ...validState, force: true }), false);
});

test('un snapshot legacy no declara inventario completo ni habilita deltas', () => {
  assert.equal(
    getProductSnapshotScope({ inventory: [{ id: 1 }] }),
    PRODUCT_SNAPSHOT_SCOPE_PARTIAL,
  );
  assert.equal(
    getProductSnapshotScope({ inventory: [{ id: 1 }], inventoryScope: PRODUCT_SNAPSHOT_SCOPE_FULL }),
    PRODUCT_SNAPSHOT_SCOPE_FULL,
  );
});

test('la marca de productos avanza solo con timestamps recibidos del servidor', () => {
  assert.equal(
    getLatestCloudRecordTimestamp([
      { id: 1, updated_at: '2026-08-25T14:20:00.000Z' },
      { id: 2, updated_at: '2026-08-25T14:40:00.000Z' },
    ], { fallback: '2026-08-25T14:30:00.000Z' }),
    '2026-08-25T14:40:00.000Z',
  );
  assert.equal(
    getLatestCloudRecordTimestamp([], { fallback: '2026-08-25T14:30:00.000Z' }),
    '2026-08-25T14:30:00.000Z',
  );
});

test('una carga activa cubre otra solicitud si ya incluye todo su alcance', () => {
  assert.equal(
    doesCloudLoadCoverRequest(
      { full: true, includeTransactions: true },
      { full: false, includeTransactions: true },
      ['full', 'includeTransactions'],
    ),
    true,
  );
  assert.equal(
    doesCloudLoadCoverRequest(
      { full: false, includeTransactions: true },
      { full: true, includeTransactions: true },
      ['full', 'includeTransactions'],
    ),
    false,
  );
  assert.equal(
    doesCloudLoadCoverRequest(
      { full: true, includeTransactions: false },
      { full: true, includeTransactions: true },
      ['full', 'includeTransactions'],
    ),
    false,
  );
});

test('quien exige nube recibe fallo aunque la carga compartida conserve el cache', () => {
  assert.equal(resolveCoveredCloudLoadResult({
    loaded: true,
    requireCloud: true,
    cloudRefreshFailed: true,
  }), false);
  assert.equal(resolveCoveredCloudLoadResult({
    loaded: true,
    requireCloud: false,
    cloudRefreshFailed: true,
  }), true);
});

test('un timeout aborta la consulta y no inicia otra superpuesta', async () => {
  let calls = 0;
  let aborted = false;

  await assert.rejects(
    fetchCloudPayloadWithRetries({
      fetchPayload: ({ signal }) => {
        calls += 1;
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
      timeoutMs: 20,
      retryCount: 2,
      retryDelayMs: 1,
      isRecoverableError: () => true,
    }),
    (error) => error?.code === 'REBU_TIMEOUT',
  );

  assert.equal(calls, 1);
  assert.equal(aborted, true);
});

test('una respuesta posterior al timeout no cambia el resultado vencido', async () => {
  let resolveRequest;
  const request = fetchCloudPayloadWithRetries({
    fetchPayload: () => new Promise((resolve) => {
      resolveRequest = resolve;
    }),
    timeoutMs: 20,
    retryCount: 1,
    isRecoverableError: () => true,
  });

  await assert.rejects(request, (error) => error?.code === 'REBU_TIMEOUT');
  resolveRequest({ hasCloudConnection: true, value: 'late' });
  await new Promise((resolve) => setTimeout(resolve, 5));

  await assert.rejects(request, (error) => error?.code === 'REBU_TIMEOUT');
});

test('un error de red rapido se reintenta una sola vez', async () => {
  let calls = 0;
  const result = await fetchCloudPayloadWithRetries({
    fetchPayload: async () => {
      calls += 1;
      if (calls === 1) throw recoverableNetworkError;
      return { hasCloudConnection: true, value: 'ok' };
    },
    timeoutMs: 100,
    retryCount: 1,
    retryDelayMs: 1,
    isRecoverableError: (error) => error?.code === 'NETWORK',
  });

  assert.equal(calls, 2);
  assert.equal(result.value, 'ok');
});

test('un error permanente no se reintenta', async () => {
  let calls = 0;

  await assert.rejects(
    fetchCloudPayloadWithRetries({
      fetchPayload: async () => {
        calls += 1;
        throw Object.assign(new Error('permission denied'), { code: '42501' });
      },
      timeoutMs: 100,
      retryCount: 2,
      retryDelayMs: 1,
      isRecoverableError: () => false,
    }),
    /permission denied/,
  );

  assert.equal(calls, 1);
});

test('una mutacion durante la carga completa repite el snapshot una sola vez', async () => {
  const versions = { sales: 0, logs: 0 };
  let calls = 0;

  const result = await fetchCloudPayloadWithMutationGuard({
    getMutationVersions: () => versions,
    sources: ['sales', 'logs'],
    retryCount: 1,
    fetchPayload: async () => {
      calls += 1;
      if (calls === 1) recordCloudSourceMutations(versions, ['sales']);
      return { hasCloudConnection: true, transactions: [{ id: calls }] };
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.mutationConsistent, true);
  assert.deepEqual(result.concurrentMutationSources, []);
  assert.deepEqual(result.transactions, [{ id: 2 }]);
});

test('un snapshot que vuelve a mutar nunca se declara consistente', async () => {
  const versions = { expenses: 0 };
  let calls = 0;

  const result = await fetchCloudPayloadWithMutationGuard({
    getMutationVersions: () => versions,
    sources: ['expenses'],
    retryCount: 1,
    fetchPayload: async () => {
      calls += 1;
      recordCloudSourceMutations(versions, ['expenses']);
      return { hasCloudConnection: true, expenses: [{ id: calls }] };
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.mutationConsistent, false);
  assert.deepEqual(result.concurrentMutationSources, ['expenses']);
});

test('un fallo de conexion no se repite por la barrera de mutaciones', async () => {
  let calls = 0;
  const result = await fetchCloudPayloadWithMutationGuard({
    getMutationVersions: () => ({ sales: 0 }),
    sources: ['sales'],
    retryCount: 2,
    fetchPayload: async () => {
      calls += 1;
      return { hasCloudConnection: false, failedSources: ['ventas'] };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.mutationConsistent, true);
});

test('un fallo de conexion no permite restaurar cache sobre una mutacion concurrente', async () => {
  const versions = { expenses: 0 };
  let calls = 0;
  const result = await fetchCloudPayloadWithMutationGuard({
    getMutationVersions: () => versions,
    sources: ['expenses'],
    retryCount: 2,
    fetchPayload: async () => {
      calls += 1;
      recordCloudSourceMutations(versions, ['expenses']);
      return { hasCloudConnection: false, failedSources: ['gastos'] };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.mutationConsistent, false);
  assert.deepEqual(result.concurrentMutationSources, ['expenses']);
});

test('la consulta paginada recibe la misma AbortSignal del intento', async () => {
  const controller = new AbortController();
  let receivedSignal = null;
  const query = {
    abortSignal(signal) {
      receivedSignal = signal;
      return this;
    },
    async range() {
      return { data: [], error: null };
    },
  };

  const result = await fetchAllCloudRowsWithSelectFallback(
    () => query,
    'id,title',
    100,
    { signal: controller.signal },
  );

  assert.equal(result.error, null);
  assert.equal(receivedSignal, controller.signal);
});

test('una consulta simple con fallback recibe la AbortSignal del intento', async () => {
  const controller = new AbortController();
  let receivedSignal = null;
  const query = {
    abortSignal(signal) {
      receivedSignal = signal;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };

  const result = await runSelectWithSchemaFallback(
    () => query,
    'id,title',
    { signal: controller.signal },
  );

  assert.equal(result.error, null);
  assert.equal(receivedSignal, controller.signal);
});

test('la paginacion sigue hasta una pagina vacia aunque Supabase limite cada respuesta', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges = [];
  const query = {
    async range(from, to) {
      requestedRanges.push([from, to]);
      return { data: rows.slice(from, Math.min(from + 2, rows.length)), error: null };
    },
  };

  const result = await fetchAllCloudRowsWithSelectFallback(
    () => query,
    'id',
    5,
  );

  assert.deepEqual(result.data, rows);
  assert.deepEqual(requestedRanges, [[0, 4], [2, 6], [4, 8], [5, 9]]);
});

test('la paginacion historica avanza por cursor sin omitir filas', async () => {
  const rows = [
    { id: 5, created_at: '2026-08-05T10:00:00Z' },
    { id: 4, created_at: '2026-08-04T10:00:00Z' },
    { id: 3, created_at: '2026-08-03T10:00:00Z' },
    { id: 2, created_at: '2026-08-02T10:00:00Z' },
    { id: 1, created_at: '2026-08-01T10:00:00Z' },
  ];
  const requestedCursors = [];

  const result = await fetchAllCloudRowsByIdCursorWithSelectFallback(
    () => {
      let cursor = null;
      return {
        order() { return this; },
        limit() { return this; },
        lt(_column, value) { cursor = value; return this; },
        then(resolve, reject) {
          requestedCursors.push(cursor);
          const page = rows
            .filter((row) => cursor === null || row.id < cursor)
            .slice(0, 2);
          return Promise.resolve({ data: page, error: null }).then(resolve, reject);
        },
      };
    },
    'id,created_at',
    5,
  );

  assert.deepEqual(result.data, rows);
  assert.deepEqual(requestedCursors, [null, 4, 2, 1]);
});

test('la carga por cursor restaura el orden cronologico exacto al terminar', () => {
  const rows = [
    { id: 9, created_at: '2026-08-11T09:00:00Z' },
    { id: 12, created_at: '2026-08-10T09:00:00Z' },
    { id: 8, created_at: '2026-08-11T09:00:00Z' },
  ];

  assert.deepEqual(
    sortCloudRowsNewestFirst(rows).map((row) => row.id),
    [9, 8, 12],
  );
  assert.deepEqual(rows.map((row) => row.id), [9, 12, 8]);
});

test('la paginacion por cursor reinicia limpia al retirar una columna ausente', async () => {
  const rows = [
    { id: 3, created_at: '2026-08-03T10:00:00Z' },
    { id: 2, created_at: '2026-08-02T10:00:00Z' },
    { id: 1, created_at: '2026-08-01T10:00:00Z' },
  ];
  const requestedSelects = [];

  const result = await fetchAllCloudRowsByIdCursorWithSelectFallback(
    (selectColumns) => {
      requestedSelects.push(selectColumns);
      let cursor = null;
      return {
        order() { return this; },
        limit() { return this; },
        lt(_column, value) { cursor = value; return this; },
        then(resolve, reject) {
          if (selectColumns.includes('user_name')) {
            return Promise.resolve({
              data: null,
              error: { message: 'column user_name does not exist' },
            }).then(resolve, reject);
          }

          const page = rows
            .filter((row) => cursor === null || row.id < cursor)
            .slice(0, 2);
          return Promise.resolve({ data: page, error: null }).then(resolve, reject);
        },
      };
    },
    'id,created_at,user_name',
    5,
  );

  assert.deepEqual(result.data, rows);
  assert.equal(result.error, null);
  assert.equal(result.selectColumns, 'id,created_at');
  assert.deepEqual(requestedSelects, [
    'id,created_at,user_name',
    'id,created_at',
    'id,created_at',
    'id,created_at',
  ]);
});

test('una fuente opcional fallida no invalida los datos criticos', () => {
  const ok = { status: 'fulfilled', value: { data: [] } };
  const failed = { status: 'fulfilled', value: { error: new Error('missing table') } };
  const summary = summarizeCloudResults(
    [['productos', ok], ['caja', ok], ['agenda', failed]],
    { optionalSources: ['agenda', 'categorias'] },
  );

  assert.equal(summary.hasCloudConnection, true);
  assert.deepEqual(summary.optionalFailedSources, ['agenda']);
  assert.deepEqual(summary.criticalFailedSources, []);
  assert.equal(summary.isComplete, false);
});

test('una fuente critica fallida bloquea la carga cloud completa', () => {
  const ok = { status: 'fulfilled', value: { data: [] } };
  const failed = { status: 'rejected', reason: new Error('network') };
  const summary = summarizeCloudResults(
    [['productos', failed], ['caja', ok], ['agenda', ok]],
    { optionalSources: ['agenda'] },
  );

  assert.equal(summary.hasCloudConnection, false);
  assert.deepEqual(summary.criticalFailedSources, ['productos']);
});
