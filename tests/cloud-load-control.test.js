import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchCloudPayloadWithRetries,
  summarizeCloudResults,
} from '../src/utils/cloudLoadControl.js';
import { fetchAllCloudRowsWithSelectFallback } from '../src/utils/supabaseSchemaFallback.js';

const recoverableNetworkError = Object.assign(new Error('Failed to fetch'), { code: 'NETWORK' });

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
