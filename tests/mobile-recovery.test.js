import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPending, persistPending, readPending, validPending } from '../mobile/src/pending.js';
import { boundedFetch, withDeadline } from '../mobile/src/async.js';

class Storage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index]; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
const make = (id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') => ({ id, userId: 'owner', product: { id: '123', stock: 3 }, mode: 'add', quantity: 2, before: 3, after: 5, reason: 'Ingreso proveedor' });
test('pending receipts survive closing the tab and do not overwrite other tabs or users', () => {
  const storage = new Storage();
  const first = make();
  const second = { ...make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), createdAt: 1 };
  persistPending(first, storage); persistPending(second, storage);
  assert.equal(readPending('owner', storage, new Storage()).id, first.id);
  assert.equal(readPending('someone-else', storage, new Storage()), null);
  clearPending(first, storage);
  assert.equal(readPending('owner', storage, new Storage()).id, second.id);
});
test('legacy session recovery migrates safely and invalid local data is never sent', () => {
  const storage = new Storage(), legacy = new Storage();
  legacy.setItem('rebu-stock-pending-v1', JSON.stringify(make()));
  assert.equal(readPending('owner', storage, legacy).id, make().id);
  assert.equal(legacy.getItem('rebu-stock-pending-v1'), null);
  legacy.setItem('rebu-stock-pending-v1', '{broken');
  assert.equal(readPending('owner', storage, legacy).id, make().id);
  assert.equal(validPending({ ...make(), after: 100 }, 'owner'), false);
  assert.equal(validPending({ ...make(), quantity: 1.5 }, 'owner'), false);
  assert.throws(() => persistPending({ ...make(), id: 'broken' }, storage));
});
test('storage failure prevents a new receipt from being sent without a recovery key', () => {
  const storage = new Storage();
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => persistPending(make(), storage), /quota/);
});
test('deadlines and caller cancellation terminate network work', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 10), /tardó demasiado/);
  const original = globalThis.fetch;
  globalThis.fetch = (_input, { signal }) => new Promise((_, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))); if (signal.aborted) reject(new Error('aborted')); });
  try {
    await assert.rejects(boundedFetch('https://example.invalid', {}, 10), /aborted/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(boundedFetch('https://example.invalid', { signal: controller.signal }, 100), /aborted/);
  } finally { globalThis.fetch = original; }
});
