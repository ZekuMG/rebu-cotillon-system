import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPosCheckoutItems, createPosCheckoutJournal, executePosCheckoutAttempt } from '../src/utils/posCheckoutRecovery.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const draft = () => ({
  cartId: 'cart-1', status: 'pending',
  request: {
    operationKey: 'pos-cart-1-stable-key', salePayload: { total: 3550, user_name: 'Ana' },
    itemsPayload: [{ product_id: 8, quantity: 1, subtotal: 3500 }, { product_title: 'Bolsita', subtotal: 50 }],
    stockDeltaByProduct: { 8: -1 }, clientPointUpdates: [{ client_id: 'member-1', points: 17 }],
  },
});

test('una respuesta perdida y un reinicio reutilizan la clave y el pedido original sin duplicar venta, stock o puntos', async () => {
  const disk = storage();
  const journal = createPosCheckoutJournal({ storage: disk });
  const operations = new Map();
  const physical = { sales: 0, stock: 10, points: 10 };
  const requests = [];
  const registerSale = async (request) => {
    requests.push(structuredClone(request));
    if (operations.has(request.operationKey)) return { id: 71, _duplicate: true };
    physical.sales++;
    physical.stock--;
    physical.points = 17;
    operations.set(request.operationKey, { id: 71, total: 3550, user: 'Ana', items: request.itemsPayload });
    throw new TypeError('Failed to fetch'); // Committed, but the client never got its response.
  };
  const loadSale = async () => operations.get('pos-cart-1-stable-key');
  await assert.rejects(executePosCheckoutAttempt({ journal, attempt: draft(), registerSale, loadSale }), /Failed to fetch/);

  const afterRestart = createPosCheckoutJournal({ storage: disk });
  const editedCart = draft();
  editedCart.request.salePayload.total = 9999;
  editedCart.request.salePayload.user_name = 'Otro empleado';
  editedCart.request.operationKey = 'new-key-that-must-not-be-used';
  const result = await executePosCheckoutAttempt({ journal: afterRestart, attempt: editedCart, registerSale, loadSale });
  assert.deepEqual(physical, { sales: 1, stock: 9, points: 17 });
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(result.sale.total, 3550);
  assert.equal(result.sale.user, 'Ana');
  assert.equal(result.attempt.duplicate, true);
});

test('si falla la lectura del comprobante después de confirmar, el próximo intento solo lee la venta', async () => {
  const disk = storage();
  let writes = 0;
  const registerSale = async () => { writes++; return { id: 22 }; };
  const first = createPosCheckoutJournal({ storage: disk });
  await assert.rejects(executePosCheckoutAttempt({
    journal: first, attempt: draft(), registerSale,
    loadSale: async () => { throw new Error('read timeout'); },
  }), /read timeout/);
  assert.equal(first.get('cart-1').saleId, 22);
  const { sale } = await executePosCheckoutAttempt({
    journal: createPosCheckoutJournal({ storage: disk }), attempt: draft(), registerSale,
    loadSale: async () => ({ id: 22, total: 3500, items: [{ title: 'Datos del servidor' }] }),
  });
  assert.equal(writes, 1);
  assert.equal(sale.total, 3500); // No reconstruction from the original 3550 cart.
  assert.equal(sale.items[0].title, 'Datos del servidor');
});

test('un fallo después del commit no vuelve a ejecutar el registro ni sus efectos', async () => {
  const journal = createPosCheckoutJournal({ storage: storage() });
  let writes = 0;
  const registerSale = async () => { writes++; return { id: 42 }; };
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale, loadSale: async () => ({ id: 42 }),
    onConfirmed: async () => { throw new Error('post-commit metadata failed'); },
  }), /metadata failed/);
  await executePosCheckoutAttempt({ journal, attempt: draft(), registerSale, loadSale: async () => ({ id: 42 }) });
  assert.equal(writes, 1);
});

test('un rechazo SQL inicial habilita corregir el carrito porque esa transacción no se confirmó', async () => {
  const journal = createPosCheckoutJournal({ storage: storage() });
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale: async () => { throw { code: 'P0001', message: 'Stock insuficiente' }; },
    loadSale: async () => assert.fail('No hay venta que leer'),
  }));
  assert.equal(journal.get('cart-1'), null);
});

test('un rechazo posterior a un corte no borra la identidad de un cobro que pudo haberse confirmado', async () => {
  const journal = createPosCheckoutJournal({ storage: storage() });
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale: async () => { throw new TypeError('Network error'); }, loadSale: async () => null,
  }));
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale: async () => { throw { code: '42501', message: 'Permission changed' }; }, loadSale: async () => null,
  }));
  assert.equal(journal.get('cart-1').request.operationKey, draft().request.operationKey);
});

test('si el disco local no permite guardar, no se envía ningún cobro', async () => {
  const journal = createPosCheckoutJournal({ storage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } } });
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale: async () => assert.fail('Must not send money operation'), loadSale: async () => null,
  }), /QuotaExceeded/);
});

test('un error al guardar la confirmación conserva la clave original para recuperar la venta', async () => {
  const disk = storage();
  const set = disk.setItem;
  disk.setItem = (key, value) => {
    if (value.includes('"saleId"')) throw new Error('disk full after commit');
    set(key, value);
  };
  const journal = createPosCheckoutJournal({ storage: disk });
  await assert.rejects(executePosCheckoutAttempt({
    journal, attempt: draft(), registerSale: async () => ({ id: 19 }), loadSale: async () => null,
  }), /disk full/);
  assert.equal(journal.get('cart-1').request.operationKey, draft().request.operationKey);
  assert.equal(journal.get('cart-1').submitted, true);
});

test('no se elimina el cobro completado hasta que el carrito desaparece del snapshot persistido', () => {
  const journal = createPosCheckoutJournal({ storage: storage() });
  journal.ensure(draft());
  journal.patch('cart-1', { saleId: 1, status: 'completed' });
  assert.equal(journal.pruneCompleted(['cart-1']), false);
  assert.ok(journal.get('cart-1'));
  assert.equal(journal.pruneCompleted(['cart-2']), true);
  assert.equal(journal.get('cart-1'), null);
});

test('la limpieza de carritos cerrados nunca elimina cobros de resultado incierto', () => {
  const journal = createPosCheckoutJournal({ storage: storage() });
  journal.ensure(draft());
  journal.pruneCompleted([]);
  assert.ok(journal.get('cart-1'));
});

test('la bitácora descarta imágenes pesadas sin perder costos, combos o extras', () => {
  const [item] = compactPosCheckoutItems([{ title: 'Combo', image: 'large data URI', cost: 120, productsIncluded: [{ title: 'Uno', image: 'large URI', quantity: 2 }] }]);
  assert.equal(item.cost, 120);
  assert.equal(item.image, undefined);
  assert.deepEqual(item.productsIncluded, [{ title: 'Uno', quantity: 2 }]);
});
