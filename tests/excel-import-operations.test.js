import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canApplyExcelImportRow,
  getExcelImportUndoConflicts,
  mergeExcelImportProductResult,
  runExcelImportBatch,
} from '../src/utils/excelImportOperations.js';

test('una fila aplicada no puede volver a ejecutarse sin deshacer', () => {
  const applicableChange = {
    hasProduct: true,
    hasBlockingErrors: false,
    hasApplicableChanges: true,
  };

  assert.equal(canApplyExcelImportRow({ ...applicableChange, applied: false }), true);
  assert.equal(canApplyExcelImportRow({ ...applicableChange, applied: true }), false);
});

test('una fila sin producto, con errores o sin cambios tampoco es aplicable', () => {
  assert.equal(canApplyExcelImportRow({ hasApplicableChanges: true }), false);
  assert.equal(canApplyExcelImportRow({ hasProduct: true, hasBlockingErrors: true, hasApplicableChanges: true }), false);
  assert.equal(canApplyExcelImportRow({ hasProduct: true }), false);
});

test('el lote conserva los exitos y reporta cada fila fallida', async () => {
  const result = await runExcelImportBatch([1, 2, 3], async (value) => {
    if (value === 2) throw new Error('fila invalida');
    return value * 10;
  });

  assert.deepEqual(result.succeeded, [10, 30]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].item, 2);
  assert.match(result.failed[0].error.message, /fila invalida/);
});

test('el lote respeta el limite de concurrencia configurado', async () => {
  let activeWorkers = 0;
  let maximumWorkers = 0;

  await runExcelImportBatch([1, 2, 3, 4, 5, 6], async () => {
    activeWorkers += 1;
    maximumWorkers = Math.max(maximumWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeWorkers -= 1;
  }, { concurrency: 2 });

  assert.equal(maximumWorkers, 2);
});

test('deshacer detecta cambios posteriores solo en campos tocados por la importacion', () => {
  const before = { stock: 10, purchasePrice: 100, price: 200, barcode: '' };
  const after = { stock: 15, purchasePrice: 120, price: 200, barcode: '' };

  assert.deepEqual(getExcelImportUndoConflicts({
    before,
    after,
    current: { ...after, stock: 14, price: 250 },
  }), ['stock']);
});

test('deshacer permite restaurar cuando el producto conserva el estado aplicado', () => {
  const before = { stock: 10, purchasePrice: 100, supplierLinks: {} };
  const after = { stock: 15, purchasePrice: 120, supplierLinks: { excel_import: { aliases: [] } } };

  assert.deepEqual(getExcelImportUndoConflicts({ current: after, before, after }), []);
});

test('la interfaz prioriza los valores reales devueltos por la base', () => {
  const supplierLinks = { excel_import: { aliases: [{ code: 'ABC' }] } };
  const product = mergeExcelImportProductResult(
    { id: 'p1', stock: 10, purchasePrice: 100, price: 200, barcode: '' },
    { stock: 15, cost: 120, price: 220, barcode: 'ABC' },
    { stock: 16, purchasePrice: 121, price: 221, barcode: 'ABC', supplierLinks, isActive: true },
  );

  assert.equal(product.stock, 16);
  assert.equal(product.purchasePrice, 121);
  assert.equal(product.price, 221);
  assert.deepEqual(product.supplierLinks, supplierLinks);
  assert.deepEqual(product.supplier_links, supplierLinks);
  assert.equal(product.isActive, true);
  assert.equal(product.is_active, true);
});
