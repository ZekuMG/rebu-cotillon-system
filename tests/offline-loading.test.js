import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCloudPayloadWithRetries } from '../src/utils/cloudLoadControl.js';
import { createOfflineRealtimeLifecycle } from '../src/utils/offlineRealtimeLifecycle.js';

test('arrancar sin internet no crea consultas ni canales de reconexión', async () => {
  await assert.rejects(fetchCloudPayloadWithRetries({
    isOffline: () => true,
    fetchPayload: () => assert.fail('No debe consultar la nube'),
  }), { code: 'REBU_OFFLINE' });
  const lifecycle = createOfflineRealtimeLifecycle({
    isOffline: () => true,
    subscribe: () => assert.fail('No debe abrir un WebSocket'),
    unsubscribe: () => {}, disconnect: () => {},
  });
  assert.equal(lifecycle.resume(), false);
  lifecycle.dispose();
});

test('el corte aborta la lectura en curso y libera el estado sin esperar 30 segundos', async () => {
  const network = new EventTarget();
  let signal;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const task = fetchCloudPayloadWithRetries({
    offlineEventTarget: network,
    timeoutMs: 30000,
    retryCount: 4,
    isRecoverableError: () => true,
    fetchPayload: ({ signal: current }) => {
      signal = current;
      started();
      return new Promise(() => {});
    },
  });
  await ready;
  network.dispatchEvent(new Event('offline'));
  await assert.rejects(task, { code: 'REBU_OFFLINE' });
  assert.equal(signal.aborted, true);
});

test('un corte durante la espera de reintento impide volver a consultar', async () => {
  const network = new EventTarget();
  let calls = 0;
  const task = fetchCloudPayloadWithRetries({
    offlineEventTarget: network, retryDelayMs: 20, retryCount: 5,
    fetchPayload: async () => { calls++; throw new TypeError('Failed to fetch'); },
    isRecoverableError: () => true,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  network.dispatchEvent(new Event('offline'));
  await assert.rejects(task, { code: 'REBU_OFFLINE' });
  assert.equal(calls, 1);
});

test('el canal se retira al cortarse y se recrea una sola vez al reconectar', async () => {
  let offline = false;
  const resources = [];
  const removed = [];
  const callbacks = [];
  const cleanupState = { pending: null };
  const lifecycle = createOfflineRealtimeLifecycle({
    isOffline: () => offline,
    cleanupState,
    subscribe: (isCurrent) => { callbacks.push(isCurrent); const resource = { id: resources.length }; resources.push(resource); return resource; },
    unsubscribe: (resource) => removed.push(resource),
    disconnect: () => {},
  });
  assert.equal(lifecycle.resume(), true);
  assert.equal(lifecycle.resume(), false);
  assert.equal(callbacks[0](), true);
  offline = true;
  lifecycle.pause();
  assert.equal(callbacks[0](), false);
  assert.equal(lifecycle.resume(), false);
  assert.deepEqual(removed, [resources[0]]);
  offline = false;
  assert.equal(lifecycle.resume(), true);
  assert.equal(lifecycle.resume(), false);
  await cleanupState.pending;
  assert.equal(resources.length, 2);
  assert.equal(callbacks[0](), false);
  assert.equal(callbacks[1](), true);
  lifecycle.dispose();
  assert.equal(callbacks[1](), false);
  assert.equal(lifecycle.resume(), false);
});

test('el montaje de StrictMode espera la limpieza anterior antes de suscribir el mismo tema', async () => {
  const cleanupState = { pending: null };
  let finishRemoval;
  const channels = [];
  const options = {
    cleanupState,
    isOffline: () => false,
    subscribe: () => { const channel = {}; channels.push(channel); return channel; },
    unsubscribe: () => new Promise((resolve) => {
      finishRemoval = () => { channels.length = 0; resolve(); };
    }),
    disconnect: () => {},
  };
  const first = createOfflineRealtimeLifecycle(options);
  first.resume();
  first.dispose();
  const replacement = createOfflineRealtimeLifecycle(options);
  replacement.resume();
  replacement.resume();
  assert.equal(channels.length, 1);
  const removal = cleanupState.pending;
  finishRemoval();
  await removal;
  assert.equal(channels.length, 1, 'El canal nuevo sobrevive a la limpieza anterior');
  replacement.dispose();
  finishRemoval();
  await cleanupState.pending;
  assert.equal(channels.length, 0);
});

test('una lectura completada retira su listener y un corte posterior no altera la respuesta', async () => {
  const network = new EventTarget();
  let added = 0;
  let removed = 0;
  const add = network.addEventListener.bind(network);
  const remove = network.removeEventListener.bind(network);
  network.addEventListener = (...args) => { added++; add(...args); };
  network.removeEventListener = (...args) => { removed++; remove(...args); };
  const result = await fetchCloudPayloadWithRetries({
    offlineEventTarget: network,
    fetchPayload: async () => ({ hasCloudConnection: true, value: 'ok' }),
  });
  network.dispatchEvent(new Event('offline'));
  assert.equal(result.value, 'ok');
  assert.equal(added, removed);
});
