import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  buildSupplierPriceChangeReport,
  getSupplierPriceReportCutoff,
  SUPPLIER_PRICE_REPORT_PERIODS,
} from '../src/utils/supplierPriceReport.js';

const require = createRequire(import.meta.url);
const { buildSupplierPriceReportHtml } = require('../electron-supplier-price-report.cjs');
const NOW = new Date('2026-08-22T15:00:00.000Z');

const buildLog = ({
  id,
  createdAt,
  action = 'Actualizacion Precio Proveedor',
  productId = 'product-1',
  title = 'Producto de prueba',
  oldCost = 100,
  newCost = 110,
  oldSale = 200,
  newSale = 220,
}) => ({
  id,
  action,
  created_at: createdAt,
  user: 'Ramiro',
  details: {
    items: [{
      id: productId,
      title,
      barcode: '779000000001',
      supplierCode: 'CA-10',
      before: { purchasePrice: oldCost, price: oldSale },
      after: { purchasePrice: newCost, price: newSale },
    }],
  },
});
test('supplier report exposes the requested rolling periods up to 30 days', () => {
  assert.deepEqual(SUPPLIER_PRICE_REPORT_PERIODS.map((period) => period.days), [1, 3, 7, 15, 30]);
  assert.equal(getSupplierPriceReportCutoff(3, NOW).toISOString(), '2026-08-19T15:00:00.000Z');
});

test('supplier report filters by cutoff and keeps repeated product changes', () => {
  const report = buildSupplierPriceChangeReport([
    buildLog({ id: 1, createdAt: '2026-08-22T14:00:00.000Z' }),
    buildLog({ id: 2, createdAt: '2026-08-21T16:00:00.000Z', newCost: 90, newSale: 200 }),
    buildLog({ id: 3, createdAt: '2026-08-21T14:59:59.000Z' }),
    buildLog({ id: 4, createdAt: '2026-08-22T13:00:00.000Z', oldCost: 100, newCost: 100, oldSale: 200, newSale: 200 }),
  ], { days: 1, now: NOW });

  assert.equal(report.changes.length, 2);
  assert.equal(report.summary.uniqueProducts, 1);
  assert.equal(report.summary.costIncreases, 1);
  assert.equal(report.summary.costDecreases, 1);
  assert.equal(report.summary.saleIncreases, 1);
  assert.equal(report.summary.saleDecreases, 0);
});

test('supplier report includes reversions and preserves the actor and references', () => {
  const report = buildSupplierPriceChangeReport([
    buildLog({
      id: 5,
      action: 'Deshacer Precio Proveedor',
      createdAt: '2026-08-22T12:00:00.000Z',
      oldCost: 125,
      newCost: 100,
      oldSale: 200,
      newSale: 200,
    }),
  ], { days: 3, now: NOW });

  assert.equal(report.changes[0].eventType, 'undo');
  assert.equal(report.changes[0].eventLabel, 'Reversión');
  assert.equal(report.changes[0].user, 'Ramiro');
  assert.equal(report.changes[0].barcode, '779000000001');
});

test('supplier PDF HTML is paper-light, tabular, and escapes product content', () => {
  const report = buildSupplierPriceChangeReport([
    buildLog({ id: 6, createdAt: '2026-08-22T12:00:00.000Z', title: '<script>alert(1)</script>' }),
  ], { days: 7, now: NOW });
  const html = buildSupplierPriceReportHtml({ report });

  assert.match(html, /@page \{ size: A4 landscape/);
  assert.match(html, /Costo anterior/);
  assert.match(html, /Venta nueva/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('supplier report UI and Electron bridge keep the full period workflow connected', async () => {
  const [viewSource, appSource, preloadSource, mainSource, packageSource] = await Promise.all([
    readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../preload.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);

  assert.match(viewSource, /Historial PDF/);
  assert.match(viewSource, /SUPPLIER_PRICE_REPORT_PERIODS\.map/);
  assert.match(appSource, /\.in\('action', SUPPLIER_PRICE_REPORT_ACTIONS\)/);
  assert.match(appSource, /saveSupplierPriceReportPdf/);
  assert.match(preloadSource, /save-supplier-price-report-pdf/);
  assert.match(mainSource, /ipcMain\.handle\('save-supplier-price-report-pdf'/);
  assert.match(packageSource, /electron-supplier-price-report\.cjs/);
});
