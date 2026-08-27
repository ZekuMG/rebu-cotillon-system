import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildCasaAlbertoEstimatedCost,
  normalizeProductPurchasePrice,
} from '../src/utils/productLifecycle.js';
import {
  buildSupplierAttentionSummary,
  getSupplierNoticeDismissStorageKey,
  getSupplierProductReviewState,
  loadSupplierNoticeDismissal,
  matchesSupplierPriceFilter,
  saveSupplierNoticeDismissal,
} from '../src/utils/supplierPriceReview.js';
import {
  normalizeSupplierPrice,
  parseSupplierPrice,
} from '../src/utils/supplierPriceNumbers.js';

test('los precios de proveedor aceptan coma o punto para los centavos', () => {
  assert.equal(parseSupplierPrice('1234,56'), 1234.56);
  assert.equal(parseSupplierPrice('1234.56'), 1234.56);
  assert.equal(parseSupplierPrice('$ 1.234,56'), 1234.56);
  assert.equal(parseSupplierPrice('$ 1,234.56'), 1234.56);
});

test('los precios de proveedor se redondean hacia arriba a una decena entera', () => {
  assert.equal(normalizeSupplierPrice('1234,56'), 1240);
  assert.equal(normalizeSupplierPrice('1234.56'), 1240);
  assert.equal(normalizeSupplierPrice(1234), 1240);
  assert.equal(normalizeSupplierPrice(1240), 1240);
});

test('el costo sugerido se redondea al entero que acepta el editor de productos', () => {
  assert.equal(buildCasaAlbertoEstimatedCost(100.43), 115);
  assert.equal(buildCasaAlbertoEstimatedCost(100.5), 116);
  assert.equal(normalizeProductPurchasePrice(115.49), 115);
  assert.equal(normalizeProductPurchasePrice(115.5), 116);
});

const buildProduct = ({
  id = 1,
  groupId = 'CA-1',
  purchasePrice = 115,
  reviewStatus = 'reviewed',
  approvedAt = null,
  lastCheckedAt = '2026-08-23T12:00:00.000Z',
} = {}) => ({
  id,
  title: `Producto ${id}`,
  purchasePrice,
  is_active: true,
  supplier_links: {
    casa_alberto: {
      casaAlbertoId: groupId,
      providerCode: `PROV-${groupId}`,
      productUrl: `https://proveedor.test/${groupId}`,
      price_tracking: {
        reviewStatus,
        lastSupplierPrice: 100,
        rawSupplierPrice: 100,
        unitSupplierPrice: 100,
        unitDivisor: 1,
        estimatedCost: 115,
        approvedAt,
        lastCheckedAt,
      },
    },
  },
});

test('un costo aprobado deja de ser accionable y queda disponible en Aprobados', () => {
  const product = buildProduct({ reviewStatus: 'approved', approvedAt: '2026-08-23T12:00:00.000Z' });

  assert.equal(getSupplierProductReviewState(product), 'approved');
  assert.equal(matchesSupplierPriceFilter('approved', 'attention'), false);
  assert.equal(matchesSupplierPriceFilter('approved', 'approved'), true);
  assert.equal(buildSupplierAttentionSummary([product]).attention, 0);
});

test('un cambio ignorado no vuelve como aviso al reiniciar', () => {
  const product = buildProduct({ purchasePrice: 80, reviewStatus: 'ignored' });

  assert.equal(getSupplierProductReviewState(product), 'ignored');
  assert.equal(buildSupplierAttentionSummary([product]).attention, 0);
});

test('una diferencia real reabre un estado revisado antiguo', () => {
  const product = buildProduct({ purchasePrice: 80, reviewStatus: 'reviewed' });
  const summary = buildSupplierAttentionSummary([product]);

  assert.equal(getSupplierProductReviewState(product), 'changed');
  assert.equal(summary.changes, 1);
  assert.equal(summary.errors, 0);
});

test('un error sigue siendo visible hasta resolverlo o descartarlo', () => {
  const product = buildProduct({ reviewStatus: 'login_required' });
  const summary = buildSupplierAttentionSummary([product]);

  assert.equal(summary.attention, 1);
  assert.equal(summary.errors, 1);
  assert.equal(matchesSupplierPriceFilter('login_required', 'error'), true);
});

test('varios productos del mismo enlace generan un solo aviso de grupo', () => {
  const products = [
    buildProduct({ id: 1, groupId: 'CA-10', purchasePrice: 80 }),
    buildProduct({ id: 2, groupId: 'CA-10', purchasePrice: 70 }),
  ];
  const summary = buildSupplierAttentionSummary(products);

  assert.equal(summary.linked, 1);
  assert.equal(summary.attention, 1);
  assert.equal(summary.changes, 1);
});

test('el aviso cambia de clave aunque otro producto mantenga las mismas cantidades', () => {
  const first = buildSupplierAttentionSummary([buildProduct({ id: 1, groupId: 'CA-1', purchasePrice: 80 })]);
  const second = buildSupplierAttentionSummary([buildProduct({ id: 2, groupId: 'CA-2', purchasePrice: 80 })]);

  assert.equal(first.changes, second.changes);
  assert.notEqual(first.key, second.key);
});

test('el descarte del aviso se guarda por usuario y sobrevive al reinicio', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getSupplierNoticeDismissStorageKey({ id: 'user-1' }), 'rebu_supplier_notice_dismissed_v1:user-1');
  assert.equal(saveSupplierNoticeDismissal({ id: 'user-1' }, 'notice-abc', storage), true);
  assert.equal(loadSupplierNoticeDismissal({ id: 'user-1' }, storage), 'notice-abc');
  assert.equal(loadSupplierNoticeDismissal({ id: 'user-2' }, storage), '');
});

test('abrir Control de costos no inicia chequeos automáticos y prioriza Por revisar', async () => {
  const source = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  const openModeBlock = source.match(/const openSupplierPriceMode = useCallback\([\s\S]+?\}, \[\]\);/)?.[0] || '';

  assert.match(source, /useState\('attention'\)/);
  assert.match(source, />Control de costos</);
  assert.match(source, /status: 'approved'/);
  assert.match(openModeBlock, /setSupplierPriceFilter\('attention'\)/);
  assert.doesNotMatch(openModeBlock, /handleCheckAllSupplierPrices|setTimeout/);
});
