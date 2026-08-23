const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { buildSupplierPriceReportHtml } = require('../electron-supplier-price-report.cjs');

const outputPath = path.resolve(__dirname, '../output/pdf/cambios-casa-alberto-ejemplo.pdf');
const previewDirectory = path.resolve(__dirname, '../tmp/pdfs');
const htmlPreviewPath = path.join(previewDirectory, 'cambios-casa-alberto-html.png');
const pdfPreviewPath = path.join(previewDirectory, 'cambios-casa-alberto-pdf.png');
const generatedAt = new Date('2026-08-22T15:00:00.000Z');
const changes = Array.from({ length: 34 }, (_, index) => {
  const previousCost = 850 + index * 37;
  const costAmount = index % 4 === 0 ? -75 : 125 + index;
  const previousSale = Math.ceil(previousCost * 1.65 / 50) * 50;
  const saleAmount = index % 3 === 0 ? 0 : 200;
  const createdAt = new Date(generatedAt.getTime() - index * 75 * 60 * 1000).toISOString();
  const costPercent = costAmount / previousCost * 100;
  const salePercent = saleAmount ? saleAmount / previousSale * 100 : null;
  return {
    logId: index + 1,
    productId: `product-${(index % 21) + 1}`,
    title: `${index % 2 ? 'ADORNO COTILLÓN' : 'ANTEOJO FIESTA'} MODELO ${String(index + 1).padStart(2, '0')} x1`,
    barcode: `779${String(1000000000 + index).slice(-10)}`,
    supplierCode: `CA-${9000 + index}`,
    casaAlbertoId: String(5000 + index),
    user: index % 5 === 0 ? 'Administrador' : 'Ramiro',
    eventLabel: index % 9 === 0 ? 'Reversión' : 'Aprobación',
    createdAt,
    direction: costAmount > 0 ? 'increase' : 'decrease',
    cost: {
      previous: previousCost,
      next: previousCost + costAmount,
      amount: costAmount,
      percent: costPercent,
      changed: true,
    },
    sale: {
      previous: previousSale,
      next: previousSale + saleAmount,
      amount: saleAmount,
      percent: salePercent,
      changed: Boolean(saleAmount),
    },
  };
});

const report = {
  supplier: 'Casa Alberto',
  generatedAt: generatedAt.toISOString(),
  cutoff: new Date(generatedAt.getTime() - 7 * 86400000).toISOString(),
  period: { days: 7, label: 'Últimos 7 días', shortLabel: '7 días', fileLabel: '7 dias' },
  changes,
  summary: {
    changeCount: changes.length,
    uniqueProducts: new Set(changes.map((change) => change.productId)).size,
    costIncreases: changes.filter((change) => change.cost.amount > 0).length,
    costDecreases: changes.filter((change) => change.cost.amount < 0).length,
    saleIncreases: changes.filter((change) => change.sale.amount > 0).length,
    saleDecreases: 0,
    maxIncreasePercent: Math.max(...changes.map((change) => change.cost.percent)),
  },
};

(async () => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(previewDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.setContent(buildSupplierPriceReportHtml({ report }), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.screenshot({ path: htmlPreviewPath, fullPage: true });

    const pdfViewer = await browser.newPage({ viewport: { width: 1512, height: 980 } });
    await pdfViewer.goto(pathToFileURL(outputPath).href, { waitUntil: 'load' });
    await pdfViewer.waitForTimeout(1200);
    await pdfViewer.screenshot({ path: pdfPreviewPath, fullPage: false });
    const stats = fs.statSync(outputPath);
    if (stats.size < 8192) throw new Error(`PDF incompleto: ${stats.size} bytes`);
    process.stdout.write(`${JSON.stringify({ outputPath, htmlPreviewPath, pdfPreviewPath, sizeBytes: stats.size })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
