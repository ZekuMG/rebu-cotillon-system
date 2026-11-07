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
  updatePosCheckoutDraftField,
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

test('pagos combinados, efectivo recibido y bolsita sobreviven a cambiar de carrito y reiniciar', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  const checkoutDraft = {
    hasPosBag: true, isSplitPaymentMode: true, activeSplitLineIndex: 1,
    paymentLines: [
      { id: 'one', method: 'Efectivo', amount: 1000, cashReceived: '1500', installments: 1 },
      { id: 'two', method: 'Credito', amount: 2550, installments: 3, cashReceived: '' },
    ],
  };
  workspace = updateActivePosCartField(workspace, 'checkoutDraft', checkoutDraft);
  workspace = addPosCartTab(workspace, { id: 'cart-2' });
  assert.equal(getActivePosCart(workspace).checkoutDraft.hasPosBag, false);
  workspace = selectPosCartTab(workspace, 'cart-1');
  assert.deepEqual(getActivePosCart(workspace).checkoutDraft, checkoutDraft);
  const snapshot = JSON.parse(JSON.stringify({ posCarts: workspace.tabs, activePosCartId: workspace.activeId }));
  const restored = normalizePosCartWorkspace(snapshot);
  assert.deepEqual(getActivePosCart(restored).checkoutDraft, checkoutDraft);
  assert.equal(restored.tabs[1].checkoutDraft.isSplitPaymentMode, false);
});

test('editar el efectivo recibido de un carrito no modifica el de otro', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = updateActivePosCartField(workspace, 'checkoutDraft', (draft) => updatePosCheckoutDraftField(draft, 'paymentLines', (lines) => [{ ...lines[0], cashReceived: '5000' }]));
  workspace = addPosCartTab(workspace, { id: 'cart-2' });
  assert.equal(getActivePosCart(workspace).checkoutDraft.paymentLines[0].cashReceived, '');
  workspace = selectPosCartTab(workspace, 'cart-1');
  assert.equal(getActivePosCart(workspace).checkoutDraft.paymentLines[0].cashReceived, '5000');
});

test('cambiar de pestaña recupera carrito, cliente y forma de pago', () => {
  let workspace = createPosCartWorkspace({ id: 'cart-1' });
  workspace = updateActivePosCartField(workspace, 'selectedClient', { id: 'client-1', name: 'Ana' });
  workspace = updateActivePosCartField(workspace, 'selectedPayment', 'Credito');
  workspace = updateActivePosCartField(workspace, 'selectedUserId', 'user-1');
  workspace = addPosCartTab(workspace, { id: 'cart-2' });
  assert.equal(getActivePosCart(workspace).selectedUserId, '');
  workspace = selectPosCartTab(workspace, 'cart-1');

  assert.equal(getActivePosCart(workspace).selectedClient.name, 'Ana');
  assert.equal(getActivePosCart(workspace).selectedPayment, 'Credito');
  assert.equal(getActivePosCart(workspace).selectedUserId, 'user-1');
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
  workspace = updateActivePosCartField(workspace, 'selectedUserId', 'user-1');
  workspace = closePosCartTab(workspace, 'cart-1', { replacementId: 'cart-2' });

  assert.equal(workspace.tabs.length, 1);
  assert.equal(workspace.activeId, 'cart-2');
  assert.deepEqual(getActivePosCart(workspace).cart, []);
  assert.equal(getActivePosCart(workspace).selectedUserId, '');
});

test('restaurar pedidos conserva sus responsables sin asignarlos a carritos nuevos', () => {
  const workspace = normalizePosCartWorkspace({
    posCarts: [{ id: 'cart-1', selectedUserId: 'user-1' }, { id: 'cart-2' }],
    activePosCartId: 'cart-1',
  });
  assert.equal(getActivePosCart(workspace).selectedUserId, 'user-1');
  assert.equal(workspace.tabs[1].selectedUserId, '');
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
