import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  hasDeferredOrderStockPolicy,
  isOrderStockPending,
  isOrderStockReserved,
  markOrderItemsForDeferredStock,
} from '../src/utils/orderStockPolicy.js';

test('marks new order snapshots for stock validation at completion', () => {
  const source = [{ id: 'product-1', title: 'Producto' }];
  const marked = markOrderItemsForDeferredStock(source);

  assert.notEqual(marked, source);
  assert.notEqual(marked[0], source[0]);
  assert.equal(hasDeferredOrderStockPolicy(marked), true);
  assert.equal(hasDeferredOrderStockPolicy(source), false);
});

test('a partially paid deferred order is pending stock and not reserved', () => {
  const order = {
    paidTotal: 100,
    remainingAmount: 200,
    status: 'Señado',
    isActive: true,
    itemsSnapshot: markOrderItemsForDeferredStock([{ id: 'product-1' }]),
  };

  assert.equal(isOrderStockPending(order), true);
  assert.equal(isOrderStockReserved(order), false);
});

test('legacy partially paid orders remain treated as already reserved', () => {
  const legacyOrder = {
    paidTotal: 100,
    remainingAmount: 200,
    status: 'Señado',
    isActive: true,
    itemsSnapshot: [{ id: 'product-1' }],
  };

  assert.equal(isOrderStockPending(legacyOrder), false);
  assert.equal(isOrderStockReserved(legacyOrder), true);
});

test('cancelled deferred orders are no longer shown as stock pending', () => {
  const order = {
    paidTotal: 100,
    remainingAmount: 200,
    status: 'Cancelado',
    itemsSnapshot: markOrderItemsForDeferredStock([{ id: 'product-1' }]),
  };

  assert.equal(isOrderStockPending(order), false);
  assert.equal(isOrderStockReserved(order), false);
});

test('the order flow accepts partial deposits and checks stock on completion or delivery', async () => {
  const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(appSource, /No se puede señar el pedido/);
  assert.match(appSource, /items_snapshot: markOrderItemsForDeferredStock\(budgetRecord\.itemsSnapshot \|\| \[\]\)/);
  assert.match(appSource, /if \(isCrossingToFullyPaid && !wasStockReserved\)/);
  assert.match(appSource, /No se puede entregar el pedido/);
});
