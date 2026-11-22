import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineActionQueue, completeOfflineSaleAction, confirmOfflineAction, OFFLINE_ACTIONS_KEY } from '../src/utils/offlineActionQueue.js';
import { OFFLINE_ACTION_CATALOG, projectOfflineTarget } from '../src/utils/offlineActionCatalog.js';
import { buildOfflineReservedStockDelta, getLatestOfflineClientAttempt, getLatestOfflineCouponUpdate, hasPendingOfflineCoupon } from '../src/utils/offlineSaleReservations.js';

const setup = () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let sequence = 0;
  const queue = createOfflineActionQueue({ storage, uuid: () => `action-${++sequence}` });
  return { queue, storage, data };
};
const command = (patch = {}) => ({ type: 'handleAddExpense', label: 'Registrar gasto', args: [{ amount: 2300, description: 'Flete' }], actor: { userId: 'cashier', userName: 'Caja' }, ...patch });
const options = (queue, entry, extra = {}) => ({ queue, id: entry.id, isOnline: () => true, authorize: async () => {}, loadTarget: async (target) => target.value, apply: async () => {}, ...extra });

test('el pendiente sobrevive al reinicio y congela los datos del formulario', () => {
  const { queue, storage } = setup();
  const input = command();
  const entry = queue.enqueue(input);
  input.args[0].amount = 9900;
  const restarted = createOfflineActionQueue({ storage });
  assert.equal(restarted.read()[0].args[0].amount, 2300);
  assert.equal(restarted.read()[0].id, entry.id);
  assert.equal(restarted.read()[0].status, 'pending');
});

test('sin conexión no envía, no cambia el estado y conserva el pendiente', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command());
  await assert.rejects(confirmOfflineAction(options(queue, entry, { isOnline: () => false, apply: () => assert.fail('No debe escribir') })), /Reconectá/);
  assert.equal(queue.read()[0].status, 'pending');
});

test('la reconexión por sí sola no ejecuta ninguna acción', () => {
  const { queue } = setup();
  queue.enqueue(command());
  queue.recoverInterrupted();
  assert.equal(queue.read()[0].status, 'pending');
});

test('los permisos se vuelven a verificar antes de leer o aplicar', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command());
  await assert.rejects(confirmOfflineAction(options(queue, entry, { authorize: async () => { throw new Error('Sin permiso'); }, loadTarget: () => assert.fail('No debe leer'), apply: () => assert.fail('No debe escribir') })), /Sin permiso/);
  assert.equal(queue.read()[0].status, 'pending');
});

test('detecta edición de otra PC y conserva el cambio sin sobrescribir', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command({ targets: [{ table: 'products', id: '8', label: 'Globos', value: { stock: 4, price: 1000 } }] }));
  const result = await confirmOfflineAction(options(queue, entry, { loadTarget: async () => ({ stock: 3, price: 1000 }), apply: () => assert.fail('No debe sobrescribir') }));
  assert.equal(result.status, 'conflict');
  assert.match(result.error, /Globos/);
  await assert.rejects(confirmOfflineAction(options(queue, result)), /Revisá/);
});

test('un registro eliminado se trata como conflicto', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command({ targets: [{ table: 'clients', id: '1', value: { name: 'Ana' } }] }));
  const result = await confirmOfflineAction(options(queue, entry, { loadTarget: async () => null }));
  assert.equal(result.status, 'conflict');
});

test('guarda applying antes de enviar, y una acción aplicada no se repite', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command());
  let calls = 0;
  const config = options(queue, entry, { apply: async () => { assert.equal(queue.read()[0].status, 'applying'); calls++; } });
  const result = await confirmOfflineAction(config);
  assert.equal(result.status, 'applied');
  await assert.rejects(confirmOfflineAction(config), /procesada/);
  assert.equal(calls, 1);
});

test('una respuesta perdida requiere revisar, sin repetir un gasto o una edición', async () => {
  const { queue, storage } = setup();
  const entry = queue.enqueue(command());
  let calls = 0;
  const result = await confirmOfflineAction(options(queue, entry, { apply: async () => { calls++; throw new TypeError('Failed to fetch'); } }));
  assert.equal(result.status, 'review');
  const restarted = createOfflineActionQueue({ storage });
  await assert.rejects(confirmOfflineAction(options(restarted, entry, { apply: () => calls++ })), /Revisá/);
  assert.equal(calls, 1);
});

test('un cobro con RPC idempotente puede reintentarse con el mismo pedido congelado', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command({ type: 'offlineSale', args: [{ request: { operationKey: 'sale-fixed', total: 2300 } }] }));
  const requests = [];
  const config = options(queue, entry, { retrySafe: true, apply: async (saved) => { requests.push(saved.args[0]); if (requests.length === 1) throw new Error('Network error'); } });
  assert.equal((await confirmOfflineAction(config)).status, 'pending');
  assert.equal((await confirmOfflineAction(config)).status, 'applied');
  assert.deepEqual(requests[0], requests[1]);
});

test('un cierre abrupto durante el envío se recupera como revisión, nunca como pendiente automático', () => {
  const { queue, storage } = setup();
  const entry = queue.enqueue(command());
  queue.patch(entry.id, { status: 'applying' });
  const restarted = createOfflineActionQueue({ storage });
  assert.equal(restarted.recoverInterrupted()[0].status, 'review');
});

test('no envía si no puede persistir la intención antes de escribir', async () => {
  const { queue, storage } = setup();
  const entry = queue.enqueue(command());
  storage.setItem = () => { throw new Error('QuotaExceeded'); };
  await assert.rejects(confirmOfflineAction(options(queue, entry, { apply: () => assert.fail('No debe escribir') })), /QuotaExceeded/);
  assert.equal(queue.read()[0].status, 'pending');
});

test('no borra ni reemplaza un registro corrupto', () => {
  const { queue, storage } = setup();
  storage.setItem(OFFLINE_ACTIONS_KEY, '{bad json');
  assert.throws(() => queue.enqueue(command()));
  assert.equal(storage.getItem(OFFLINE_ACTIONS_KEY), '{bad json');
});

test('no recorta pendientes aunque haya muchas acciones', () => {
  const { queue } = setup();
  for (let index = 0; index < 300; index++) queue.enqueue(command());
  assert.equal(queue.read().length, 300);
});

test('el mismo formulario se guarda una sola vez y descartarlo no lo envía', () => {
  const { queue } = setup();
  const first = queue.enqueue(command({ dedupeKey: 'form-1' }));
  const second = queue.enqueue(command({ dedupeKey: 'form-1' }));
  assert.equal(first.id, second.id);
  assert.equal(queue.discard(first.id).status, 'discarded');
  assert.equal(queue.read().length, 1);
});

test('el registro exige un usuario y la proyección detecta cambios operativos', () => {
  const { queue } = setup();
  assert.throws(() => queue.enqueue(command({ actor: null })), /usuario/);
  assert.equal(OFFLINE_ACTION_CATALOG.handleAddExpense.permission, 'extras.expenses.manage');
  assert.notDeepEqual(projectOfflineTarget('products', { id: 1, stock: 5 }), projectOfflineTarget('products', { id: 1, stock: 4 }));
});

const saleEntry = (id, patch = {}) => ({ id, type: 'offlineSale', status: 'pending', args: [{ request: { salePayload: { client_id: 3 }, stockDeltaByProduct: { 8: -6 }, clientPointUpdates: [{ points: 12, expected_points: 20 }] }, logDetails: { couponCodes: ['ABC'], items: [] }, ...patch }] });

test('las ventas pendientes reservan stock local y las descartadas dejan de reservarlo', () => {
  const first = saleEntry('first');
  assert.equal(10 + buildOfflineReservedStockDelta([first], { 8: -5 })[8], -1, 'La segunda venta no puede usar las mismas unidades');
  first.status = 'discarded';
  assert.equal(10 + buildOfflineReservedStockDelta([first], { 8: -5 })[8], 5);
  first.status = 'review';
  assert.equal(10 + buildOfflineReservedStockDelta([first], { 8: -5 })[8], -1, 'Una venta incierta conserva la reserva');
});

test('los puntos del socio continúan desde su última venta pendiente en el orden de captura', () => {
  const first = saleEntry('first');
  const second = saleEntry('second', { request: { salePayload: { client_id: 3 }, clientPointUpdates: [{ points: 8, expected_points: 12 }] } });
  const another = saleEntry('other', { request: { salePayload: { client_id: 9 }, clientPointUpdates: [{ points: 999 }] } });
  assert.equal(getLatestOfflineClientAttempt([first, second, another], 3).request.clientPointUpdates[0].points, 8);
  second.status = 'discarded';
  assert.equal(getLatestOfflineClientAttempt([first, second, another], 3).request.clientPointUpdates[0].points, 12);
});

test('un cupón pendiente no puede reutilizarse y su consumo se conserva entre ventas sin cupón', () => {
  const first = saleEntry('first', { couponUpdate: { clientId: 3, previous: { couponUsage: { reenabledCodes: ['ABC', 'DEF'] } }, next: { couponUsage: { reenabledCodes: ['DEF'] } } } });
  const second = saleEntry('second', { logDetails: { items: [] } });
  assert.equal(hasPendingOfflineCoupon([first, second], 3, ['ABC']), true);
  assert.equal(hasPendingOfflineCoupon([first, second], 9, ['ABC']), false);
  assert.deepEqual(getLatestOfflineCouponUpdate([first, second], 3).next, { couponUsage: { reenabledCodes: ['DEF'] } });
  first.status = 'discarded';
  assert.equal(hasPendingOfflineCoupon([first, second], 3, ['ABC']), false);
});

test('recuperar el cobro desde POS también resuelve su pendiente sin duplicar ni volver a reservar stock', () => {
  const { queue } = setup();
  const attempt = { cartId: 'offline-cart', request: { operationKey: 'sale-stable', salePayload: { total: 200 }, stockDeltaByProduct: { 8: -2 } }, logDetails: { items: [] } };
  const entry = queue.enqueue(command({ type: 'offlineSale', args: [attempt] }));
  const completed = completeOfflineSaleAction(queue, { ...attempt, status: 'completed', saleId: 88 });
  assert.equal(completed.id, entry.id);
  assert.equal(completed.status, 'applied');
  assert.equal(completed.saleId, 88);
  assert.deepEqual(buildOfflineReservedStockDelta(queue.read(), {}), {});
  assert.equal(completeOfflineSaleAction(queue, { ...attempt, status: 'completed', saleId: 88 }), null);
});

test('un carrito o una respuesta sin la clave confirmada no resuelven otro cobro pendiente', () => {
  const { queue } = setup();
  const attempt = { cartId: 'offline-cart', request: { operationKey: 'sale-stable' } };
  queue.enqueue(command({ type: 'offlineSale', args: [attempt] }));
  assert.equal(completeOfflineSaleAction(queue, { ...attempt, status: 'pending', saleId: 88 }), null);
  assert.equal(completeOfflineSaleAction(queue, { ...attempt, status: 'completed' }), null);
  assert.equal(completeOfflineSaleAction(queue, { ...attempt, status: 'completed', saleId: 88, request: { operationKey: 'different-sale' } }), null);
  assert.equal(queue.read()[0].status, 'pending');
});

test('un corte durante la verificación de conflictos conserva el pendiente sin enviar', async () => {
  const { queue } = setup();
  const entry = queue.enqueue(command({ targets: [{ table: 'products', id: '8', value: { stock: 10 } }] }));
  let online = true;
  await assert.rejects(confirmOfflineAction(options(queue, entry, {
    isOnline: () => online,
    loadTarget: async (target) => { online = false; return target.value; },
    apply: () => assert.fail('La red se cortó antes del envío'),
  })), /interrumpió/);
  assert.equal(queue.read()[0].status, 'pending');
});

test('no se descarta una venta si otra posterior del socio conserva sus puntos o cupones', () => {
  const { queue } = setup();
  const first = queue.enqueue(command({ type: 'offlineSale', args: saleEntry('first').args }));
  const second = queue.enqueue(command({ type: 'offlineSale', args: saleEntry('second').args }));
  assert.throws(() => queue.discard(first.id), /ventas posteriores/);
  assert.deepEqual(queue.read().map((entry) => entry.status), ['pending', 'pending']);
  queue.discard(second.id);
  queue.discard(first.id);
  assert.deepEqual(queue.read().map((entry) => entry.status), ['discarded', 'discarded']);
});

test('el descarte de un cliente no afecta ventas de otro ni los pedidos de consumidor final', () => {
  const { queue } = setup();
  const first = queue.enqueue(command({ type: 'offlineSale', args: saleEntry('first').args }));
  queue.enqueue(command({ type: 'offlineSale', args: saleEntry('other', { request: { salePayload: { client_id: 99 } } }).args }));
  assert.equal(queue.discard(first.id).status, 'discarded');
  const guest = queue.enqueue(command({ type: 'offlineSale', args: saleEntry('guest', { request: { salePayload: { client_id: null } } }).args }));
  queue.enqueue(command({ type: 'offlineSale', args: saleEntry('later-guest', { request: { salePayload: { client_id: null } } }).args }));
  assert.equal(queue.discard(guest.id).status, 'discarded');
});
