import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBudgetPdfPayload,
  buildBudgetSnapshot,
  calculateBudgetTotal,
  getBudgetItemsValidationError,
  hydrateBudgetSnapshot,
} from '../src/utils/budgetHelpers.js';
import exportPdfModule from '../electron-export-pdf.cjs';

const { buildExportPdfHtml } = exportPdfModule;

test('el PDF de presupuesto depende del snapshot y no del stock vivo', () => {
  const record = {
    type: 'order',
    documentTitle: 'PEDIDO',
    customerName: 'Cliente sin stock',
    totalAmount: 1500,
    itemsSnapshot: [{
      id: 'line-1',
      product_id: 'product-1',
      title: 'Producto agotado',
      category: 'Cotillón',
      quantity: 1,
      unit_price: 1500,
      product_type: 'quantity',
      stock: 0,
    }],
  };

  const payload = buildBudgetPdfPayload(record);

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, 'Producto agotado');
  assert.equal(payload.items[0].newPrice, 1500);
  assert.equal(Object.hasOwn(payload.items[0], 'stock'), false);
  assert.equal(payload.config.financialSummary.totalAmount, 1500);
});

test('Electron recibe un documento aislado con los artículos del presupuesto', () => {
  const html = buildExportPdfHtml({
    config: {
      documentTitle: 'PRESUPUESTO',
      clientName: 'Celeste <script>',
      financialSummary: { totalAmount: 6500 },
    },
    items: [{ title: 'Topper cupcakes', category: 'Adicionales', qty: 1, newPrice: 6500 }],
  });
  const preloadSource = readFileSync('preload.cjs', 'utf8');
  const mainSource = readFileSync('electron-main.cjs', 'utf8');

  assert.match(html, /Topper cupcakes/);
  assert.match(html, /Celeste &lt;script&gt;/);
  assert.doesNotMatch(html, /Celeste <script>/);
  assert.match(preloadSource, /saveExportPdf/);
  assert.match(mainSource, /createStandaloneExportPdf/);
  assert.match(mainSource, /ipcMain\.handle\('save-export-pdf'/);
  const appSource = readFileSync('src/App.jsx', 'utf8');
  assert.match(appSource, /handleExportProducts\(config, items, \{ standalone: true \}\)/);
});

test('snapshots históricos incompletos no rompen la vista ni el PDF', () => {
  assert.deepEqual(hydrateBudgetSnapshot(null), []);
  assert.deepEqual(hydrateBudgetSnapshot({ invalid: true }), []);
  assert.deepEqual(buildBudgetPdfPayload({ itemsSnapshot: 'invalid' }).items, []);

  const hydrated = hydrateBudgetSnapshot([null, { title: 123, quantity: '2', unit_price: '50' }]);
  assert.equal(hydrated.length, 2);
  assert.equal(hydrated[0].title, '');
  assert.equal(hydrated[1].title, '123');
  assert.equal(calculateBudgetTotal(hydrated), 100);
});

test('cantidades inválidas no se corrigen silenciosamente al guardar', () => {
  const items = [{ title: 'Artículo', qty: 0, newPrice: 100, product_type: 'quantity' }];

  assert.match(getBudgetItemsValidationError(items), /cantidades/i);
  assert.equal(buildBudgetSnapshot(items)[0].quantity, 0);
});

test('los descuentos son válidos sin permitir un total negativo', () => {
  const baseItem = { title: 'Artículo', qty: 2, newPrice: 100, product_type: 'quantity' };
  const validDiscount = {
    title: 'Descuento',
    qty: 1,
    newPrice: -50,
    product_type: 'quantity',
    isDiscount: true,
  };
  const excessiveDiscount = { ...validDiscount, newPrice: -250 };

  assert.equal(getBudgetItemsValidationError([baseItem, validDiscount]), '');
  assert.equal(calculateBudgetTotal([baseItem, validDiscount]), 150);
  assert.match(getBudgetItemsValidationError([baseItem, excessiveDiscount]), /total no puede ser negativo/i);
  assert.match(
    getBudgetItemsValidationError([{ ...baseItem, newPrice: -1 }]),
    /solo las líneas de descuento/i,
  );
});

test('cancelar o fallar el diálogo PDF conserva el presupuesto del editor masivo', () => {
  const appSource = readFileSync('src/App.jsx', 'utf8');
  const bulkSource = readFileSync('src/views/BulkEditorView.jsx', 'utf8');
  const exportHandler = bulkSource.slice(
    bulkSource.indexOf('const handleConfirmExport'),
    bulkSource.indexOf('const buildImageImportRows'),
  );

  assert.match(appSource, /return new Promise\(\(resolve\) => \{/);
  assert.match(exportHandler, /await onExportProducts\(exportConfig, cleanItems\)/);
  assert.match(exportHandler, /if \(!wasExported\) return;/);
  assert.ok(
    exportHandler.indexOf('if (!wasExported) return;') < exportHandler.indexOf('setExportItems([])'),
  );
});

test('el editor masivo conserva stock cero al preparar el PDF', () => {
  const bulkSource = readFileSync('src/views/BulkEditorView.jsx', 'utf8');

  assert.match(bulkSource, /edits\[p\.id\]\?\.stock !== ''/);
  assert.doesNotMatch(bulkSource, /stock: Number\(edits\[p\.id\]\?\.stock\) \|\|/);
});
