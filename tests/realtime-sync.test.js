import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRealtimeIdBatcher,
  createSingleFlightTask,
  reconcileRealtimeHeartbeatState,
  reconcileRealtimePayload,
} from '../src/utils/realtimeSync.js';

test('un heartbeat sano recupera una degradacion de heartbeat si el canal seguia suscripto', () => {
  const result = reconcileRealtimeHeartbeatState({
    status: 'HEARTBEAT_TIMEOUT',
    channelStatus: 'SUBSCRIBED',
    degradedSource: 'heartbeat',
    lastError: 'demora transitoria',
  }, {
    status: 'ok',
    latency: 38,
    observedAt: 1234,
  });

  assert.equal(result.status, 'SUBSCRIBED');
  assert.equal(result.degradedSource, null);
  assert.equal(result.lastError, '');
  assert.equal(result.heartbeatStatus, 'ok');
  assert.equal(result.heartbeatLatencyMs, 38);
  assert.equal(result.lastHeartbeatAt, 1234);
});

test('un heartbeat sano no oculta una degradacion propia del canal', () => {
  const result = reconcileRealtimeHeartbeatState({
    status: 'CHANNEL_ERROR',
    channelStatus: 'CHANNEL_ERROR',
    degradedSource: 'channel',
    lastError: 'fallo la suscripcion',
  }, {
    status: 'ok',
    latency: 42,
    observedAt: 5678,
  });

  assert.equal(result.status, 'CHANNEL_ERROR');
  assert.equal(result.degradedSource, 'channel');
  assert.equal(result.lastError, 'fallo la suscripcion');
  assert.equal(result.heartbeatStatus, 'ok');
});

test('un timeout de heartbeat no reemplaza el diagnostico de un canal degradado', () => {
  const result = reconcileRealtimeHeartbeatState({
    status: 'TIMED_OUT',
    channelStatus: 'TIMED_OUT',
    degradedSource: 'channel',
    lastError: 'timeout del canal',
  }, {
    status: 'timeout',
    observedAt: 9012,
  });

  assert.equal(result.status, 'TIMED_OUT');
  assert.equal(result.degradedSource, 'channel');
  assert.equal(result.lastError, 'timeout del canal');
  assert.equal(result.heartbeatStatus, 'timeout');
  assert.equal(result.lastHeartbeatFailureAt, 9012);
});

test('un heartbeat sano no declara suscripto un canal que nunca conecto', () => {
  const result = reconcileRealtimeHeartbeatState({
    status: 'HEARTBEAT_TIMEOUT',
    channelStatus: 'CONNECTING',
    degradedSource: 'heartbeat',
  }, {
    status: 'ok',
    observedAt: 3456,
  });

  assert.equal(result.status, 'HEARTBEAT_TIMEOUT');
  assert.equal(result.degradedSource, 'heartbeat');
});

test('Realtime actualiza una fila antigua por id sin depender de created_at', () => {
  const current = [
    { id: 1, amount: 100, created_at: '2026-07-01T10:00:00Z' },
    { id: 2, amount: 200, created_at: '2026-07-18T10:00:00Z' },
  ];

  const result = reconcileRealtimePayload(current, {
    eventType: 'UPDATE',
    new: { id: 1, amount: 175, created_at: '2026-07-01T10:00:00Z' },
    old: { id: 1 },
  });

  assert.equal(result.applied, true);
  assert.equal(result.records[0].amount, 175);
  assert.equal(result.records[1].id, 2);
});

test('Realtime elimina una fila por id aunque solo llegue la clave anterior', () => {
  const result = reconcileRealtimePayload(
    [{ id: 'sale-1' }, { id: 'sale-2' }],
    { eventType: 'DELETE', old: { id: 'sale-1' } },
  );

  assert.deepEqual(result.records, [{ id: 'sale-2' }]);
  assert.equal(result.applied, true);
});

test('Realtime inserta una fila nueva una sola vez y respeta el limite', () => {
  const payload = { eventType: 'INSERT', new: { id: 3, value: 'nuevo' } };
  const first = reconcileRealtimePayload([{ id: 2 }, { id: 1 }], payload, { maxItems: 2 });
  const repeated = reconcileRealtimePayload(first.records, payload, { maxItems: 2 });

  assert.deepEqual(first.records.map((record) => record.id), [3, 2]);
  assert.deepEqual(repeated.records.map((record) => record.id), [3, 2]);
});

test('Realtime retira productos que pasan a estado inactivo', () => {
  const result = reconcileRealtimePayload(
    [{ id: 1, is_active: true }, { id: 2, is_active: true }],
    { eventType: 'UPDATE', new: { id: 1, is_active: false }, old: { id: 1 } },
    { keepRecord: (record) => record.is_active !== false },
  );

  assert.deepEqual(result.records, [{ id: 2, is_active: true }]);
  assert.equal(result.applied, true);
});

test('un payload sin id no modifica datos existentes', () => {
  const current = [{ id: 1, amount: 100 }];
  const result = reconcileRealtimePayload(current, {
    eventType: 'UPDATE',
    new: { amount: 200 },
  });

  assert.equal(result.applied, false);
  assert.equal(result.records, current);
});

test('una reconexion comparte la reconciliacion que ya esta en curso', async () => {
  let calls = 0;
  let releaseTask;
  const blockedTask = new Promise((resolve) => {
    releaseTask = resolve;
  });
  const runOnce = createSingleFlightTask(async () => {
    calls += 1;
    await blockedTask;
    return 'ok';
  });

  const first = runOnce();
  const repeated = runOnce();

  assert.equal(first, repeated);
  await Promise.resolve();
  assert.equal(calls, 1);

  releaseTask();
  assert.equal(await first, 'ok');
  assert.equal(await runOnce(), 'ok');
  assert.equal(calls, 2);
});

test('una rafaga de ids se agrupa y elimina duplicados', async () => {
  const batches = [];
  const batcher = createRealtimeIdBatcher({
    delayMs: 5,
    onFlush: async (ids) => {
      batches.push(ids);
    },
  });

  batcher.enqueue('sale-1');
  batcher.enqueue(['sale-1', 'sale-2']);
  await new Promise((resolve) => setTimeout(resolve, 25));
  batcher.dispose();

  assert.deepEqual(batches, [['sale-1', 'sale-2']]);
});

test('los eventos recibidos durante una consulta forman una segunda tanda', async () => {
  const batches = [];
  let releaseFirstBatch;
  const firstBatchBlocked = new Promise((resolve) => {
    releaseFirstBatch = resolve;
  });
  const batcher = createRealtimeIdBatcher({
    delayMs: 5,
    onFlush: async (ids) => {
      batches.push(ids);
      if (batches.length === 1) await firstBatchBlocked;
    },
  });

  batcher.enqueue('sale-1');
  await new Promise((resolve) => setTimeout(resolve, 12));
  batcher.enqueue('sale-2');
  releaseFirstBatch();
  await new Promise((resolve) => setTimeout(resolve, 25));
  batcher.dispose();

  assert.deepEqual(batches, [['sale-1'], ['sale-2']]);
});
