import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canApplyExcelImportRow,
  getExcelImportUndoConflicts,
  mergeExcelImportProductResult,
  runExcelImportBatch,
} from '../src/utils/excelImportOperations.js';
import {
  getExcelImportDraftStorageKey,
  loadExcelImportDraft,
  saveExcelImportDraft,
} from '../src/utils/excelImportDraftCache.js';
import {
  calculateExcelImportStockDelta,
  isSafeExcelImportNumber,
} from '../src/utils/excelImportNumbers.js';
import {
  buildExcelImportRowSignature,
  fingerprintExcelImportBuffer,
} from '../src/utils/excelImportIdentity.js';
import {
  productHasExcelImportApplication,
  recordExcelImportApplication,
  shouldSaveExcelImportAlias,
  upsertExcelImportAlias,
} from '../src/utils/productLifecycle.js';

const createMemoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test('una fila aplicada no puede volver a ejecutarse sin deshacer', () => {
  const applicableChange = {
    hasProduct: true,
    hasBlockingErrors: false,
    hasApplicableChanges: true,
  };

  assert.equal(canApplyExcelImportRow({ ...applicableChange, applied: false }), true);
  assert.equal(canApplyExcelImportRow({ ...applicableChange, applied: true }), false);
});

test('un vinculo de Excel existente no vuelve a aparecer como pendiente', () => {
  const supplierLinks = upsertExcelImportAlias({}, {
    code: 'ABC-10',
    description: 'Globo estrella',
  }, '2026-08-23T10:00:00.000Z');
  const product = { id: 'p1', supplierLinks };

  assert.equal(shouldSaveExcelImportAlias({
    product,
    entry: { code: 'ABC-10', description: 'Globo estrella' },
    isNewAssociation: true,
  }), false);
  assert.equal(shouldSaveExcelImportAlias({
    product,
    entry: { code: 'NUEVO-20', description: 'Producto distinto' },
    isNewAssociation: true,
  }), true);
});

test('la firma aplicada queda en supplier_links y no se duplica', () => {
  const signature = buildExcelImportRowSignature({
    fileFingerprint: 'abc123',
    rowNumber: 7,
  });
  const firstLinks = recordExcelImportApplication({}, {
    signature,
    fileFingerprint: 'abc123',
    rowNumber: 7,
    code: 'P-7',
    description: 'Producto siete',
  }, '2026-08-23T10:00:00.000Z');
  const secondLinks = recordExcelImportApplication(firstLinks, {
    signature,
    fileFingerprint: 'abc123',
    rowNumber: 7,
    code: 'P-7',
    description: 'Producto siete',
  }, '2026-08-23T11:00:00.000Z');

  assert.equal(productHasExcelImportApplication({ supplierLinks: secondLinks }, signature), true);
  assert.equal(secondLinks.excel_import.applications.length, 1);
  assert.equal(secondLinks.excel_import.applications[0].appliedAt, '2026-08-23T11:00:00.000Z');
});

test('la identidad del Excel es estable por contenido y cambia por fila', async () => {
  const firstBuffer = new TextEncoder().encode('mismo excel').buffer;
  const secondBuffer = new TextEncoder().encode('otro excel').buffer;
  const firstFingerprint = await fingerprintExcelImportBuffer(firstBuffer);
  const repeatedFingerprint = await fingerprintExcelImportBuffer(firstBuffer);
  const secondFingerprint = await fingerprintExcelImportBuffer(secondBuffer);

  assert.equal(firstFingerprint, repeatedFingerprint);
  assert.notEqual(firstFingerprint, secondFingerprint);
  assert.equal(
    buildExcelImportRowSignature({ fileFingerprint: firstFingerprint, rowNumber: 2 }),
    buildExcelImportRowSignature({ fileFingerprint: repeatedFingerprint, rowNumber: 2 }),
  );
  assert.notEqual(
    buildExcelImportRowSignature({ fileFingerprint: firstFingerprint, rowNumber: 2 }),
    buildExcelImportRowSignature({ fileFingerprint: firstFingerprint, rowNumber: 3 }),
  );
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

test('el multiplicador cero no suma stock y los desbordes se rechazan', () => {
  assert.equal(calculateExcelImportStockDelta({ quantity: 8, multiplier: 0 }), 0);
  assert.equal(calculateExcelImportStockDelta({ quantity: 8 }), 8);
  assert.equal(isSafeExcelImportNumber(Number.MAX_SAFE_INTEGER), true);
  assert.equal(isSafeExcelImportNumber(Number.MAX_SAFE_INTEGER + 1), false);
});

test('el borrador de Excel conserva filas, asignaciones, busqueda y filtro', async () => {
  const storage = createMemoryStorage();
  const now = Date.UTC(2026, 7, 23);
  const cache = { storage, indexedDB: null, scope: 'user:operador-1' };
  const rows = [{
    id: 'fila-1',
    entry: { code: 'ABC', description: 'Globo estrella' },
    product: {
      id: 'producto-1',
      title: 'Globo estrella dorado',
      stock: 4,
      purchasePrice: 100,
      price: 200,
      image: 'data:image/png;base64,no-debe-guardarse',
    },
    approvals: { stock: true, cost: false, price: true },
    errors: [],
  }];

  const saved = await saveExcelImportDraft(cache, {
    fileName: 'productos.xlsx',
    rows,
    resultFilter: 'applicable',
    searchTerm: 'estrella',
  }, now);
  assert.equal(saved.success, true);

  const restored = await loadExcelImportDraft(cache, now + 1000);
  assert.equal(restored.fileName, 'productos.xlsx');
  assert.equal(restored.resultFilter, 'applicable');
  assert.equal(restored.searchTerm, 'estrella');
  assert.equal(restored.rows[0].product.title, 'Globo estrella dorado');
  assert.equal(restored.rows[0].product.image, undefined);
  assert.deepEqual(restored.rows[0].approvals, { stock: true, cost: false, price: true });
});

test('un borrador vencido se descarta y una importacion vacia limpia el cache', async () => {
  const storage = createMemoryStorage();
  const now = Date.UTC(2026, 7, 23);
  const cache = { storage, indexedDB: null, scope: 'user:operador-1' };
  const storageKey = getExcelImportDraftStorageKey(cache.scope);
  await saveExcelImportDraft(cache, {
    fileName: 'productos.xlsx',
    rows: [{ id: 'fila-1', entry: { code: 'ABC' } }],
  }, now - (15 * 24 * 60 * 60 * 1000));

  assert.equal(await loadExcelImportDraft(cache, now), null);
  assert.equal(storage.getItem(storageKey), null);

  await saveExcelImportDraft(cache, {
    fileName: 'productos.xlsx',
    rows: [{ id: 'fila-2', entry: { code: 'DEF' } }],
  }, now);
  await saveExcelImportDraft(cache, { rows: [] }, now);
  assert.equal(storage.getItem(storageKey), null);
});

test('los borradores quedan aislados por usuario', async () => {
  const storage = createMemoryStorage();
  const now = Date.UTC(2026, 7, 23);
  const userOne = { storage, indexedDB: null, scope: 'user:uno' };
  const userTwo = { storage, indexedDB: null, scope: 'user:dos' };

  await saveExcelImportDraft(userOne, {
    fileName: 'privado.xlsx',
    rows: [{ id: 'fila-1', entry: { code: 'ABC' } }],
  }, now);

  assert.equal(await loadExcelImportDraft(userTwo, now), null);
  assert.equal((await loadExcelImportDraft(userOne, now))?.fileName, 'privado.xlsx');
});
