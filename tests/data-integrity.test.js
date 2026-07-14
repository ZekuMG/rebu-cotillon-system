import test from 'node:test';
import assert from 'node:assert/strict';

import { CLOUD_SELECTS, isHistoryLogAction } from '../src/utils/cloudSelects.js';
import {
  hasHydratedSupplierLinks,
  updateStockLifecycleLinks,
} from '../src/utils/productLifecycle.js';

test('la carga base incluye supplier_links', () => {
  assert.ok(CLOUD_SELECTS.productsList.split(',').includes('supplier_links'));
});

test('el ciclo de stock conserva todos los metadatos del proveedor', () => {
  const original = {
    casa_alberto: { providerCode: 'ABC-123', price_tracking: { lastSupplierPrice: 2500 } },
    excel_import: { aliases: [{ code: 'PASTA-01' }] },
    deleted_item: { reason: 'dato historico' },
    stock_lifecycle: { customFlag: true, outOfStockSince: '2026-07-01T00:00:00.000Z' },
  };

  const result = updateStockLifecycleLinks(original, {
    stockBefore: 0,
    stockAfter: 4,
    delta: 4,
    now: '2026-07-13T14:00:00.000Z',
  });

  assert.deepEqual(result.casa_alberto, original.casa_alberto);
  assert.deepEqual(result.excel_import, original.excel_import);
  assert.deepEqual(result.deleted_item, original.deleted_item);
  assert.equal(result.stock_lifecycle.customFlag, true);
  assert.equal(result.stock_lifecycle.lastRestockedAt, '2026-07-13T14:00:00.000Z');
  assert.equal('outOfStockSince' in result.stock_lifecycle, false);
});

test('se distingue un producto hidratado de uno sin supplier_links', () => {
  assert.equal(hasHydratedSupplierLinks({ supplier_links: null }), true);
  assert.equal(hasHydratedSupplierLinks({ supplierLinks: {} }), false);
});

test('las acciones Realtime conocidas se clasifican sin usar Set.has', () => {
  assert.equal(isHistoryLogAction('Nueva Venta'), true);
  assert.equal(isHistoryLogAction('Venta Eliminada'), true);
  assert.equal(isHistoryLogAction('Accion no relacionada'), false);
  assert.equal(isHistoryLogAction(undefined), false);
});
