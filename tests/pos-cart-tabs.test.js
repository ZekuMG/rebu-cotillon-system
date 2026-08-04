import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPosCartTab,
  closePosCartTab,
  createPosCartWorkspace,
  getActivePosCart,
  normalizePosCartWorkspace,
  selectPosCartTab,
  updateActivePosCartField,
} from '../src/utils/posCartTabs.js';

test('agregar un carrito conserva el pedido anterior y activa el nuevo', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = updateActivePosCartField(workspace, 'cart', [{ id: 'product-1', quantity: 2 }]);
  workspace = addPosCartTab(workspace, { id: 'cart-2' });

  assert.equal(workspace.tabs.length, 2);
  assert.deepEqual(workspace.tabs[0].cart, [{ id: 'product-1', quantity: 2 }]);
  assert.equal(workspace.activeId, 'cart-2');
  assert.deepEqual(getActivePosCart(workspace).cart, []);
});

test('cambiar de pestaña recupera carrito, cliente y forma de pago', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = updateActivePosCartField(workspace, 'selectedClient', { id: 'client-1', name: 'Ana' });
  workspace = updateActivePosCartField(workspace, 'selectedPayment', 'Credito');
  workspace = addPosCartTab(workspace, { id: 'cart-2' });
  workspace = selectPosCartTab(workspace, 'cart-1');

  assert.equal(getActivePosCart(workspace).selectedClient.name, 'Ana');
  assert.equal(getActivePosCart(workspace).selectedPayment, 'Credito');
});

test('cerrar el carrito activo selecciona el vecino sin tocarlo', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = addPosCartTab(workspace, { id: 'cart-2' });
  workspace = addPosCartTab(workspace, { id: 'cart-3' });
  workspace = selectPosCartTab(workspace, 'cart-2');
  workspace = closePosCartTab(workspace, 'cart-2', { replacementId: 'unused' });

  assert.deepEqual(workspace.tabs.map((tab) => tab.id), ['cart-1', 'cart-3']);
  assert.equal(workspace.activeId, 'cart-3');
});

test('cobrar el ultimo pedido deja un carrito nuevo y vacio', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = updateActivePosCartField(workspace, 'cart', [{ id: 'product-1', quantity: 1 }]);
  workspace = closePosCartTab(workspace, 'cart-1', { replacementId: 'cart-2' });

  assert.equal(workspace.tabs.length, 1);
  assert.equal(workspace.activeId, 'cart-2');
  assert.deepEqual(getActivePosCart(workspace).cart, []);
});

test('un snapshot anterior se migra a una sola pestaña sin perder datos', () => {
  const workspace = normalizePosCartWorkspace({
    cart: [{ id: 'legacy-product', quantity: 3 }],
    selectedClient: { id: 'legacy-client' },
    selectedPayment: 'MercadoPago',
    installments: 1,
  });

  assert.deepEqual(getActivePosCart(workspace).cart, [{ id: 'legacy-product', quantity: 3 }]);
  assert.equal(getActivePosCart(workspace).selectedClient.id, 'legacy-client');
  assert.equal(getActivePosCart(workspace).selectedPayment, 'MercadoPago');
});
