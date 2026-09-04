import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildCasaAlbertoEstimatedCost,
  buildSuggestedSalePriceFromMargin,
  normalizeProductPurchasePrice,
} from '../src/utils/productLifecycle.js';
import {
  buildSupplierAttentionSummary,
  getAcknowledgedSupplierPrice,
  getSupplierNoticeDismissStorageKey,
  getSupplierPriceChangeStatus,
  getSupplierProductReviewState,
  loadSupplierNoticeDismissal,
  matchesSupplierPriceFilter,
  saveSupplierNoticeDismissal,
} from '../src/utils/supplierPriceReview.js';
import {
  normalizeSupplierPrice,
  parseSupplierPrice,
} from '../src/utils/supplierPriceNumbers.js';
import {
  calculateSupplierComparablePrice,
  SUPPLIER_CALCULATION_MODE_WEIGHT,
} from '../src/utils/supplierPriceUnits.js';

test('el modo peso convierte el precio del envase a precio por kilo', () => {
  assert.equal(calculateSupplierComparablePrice({
    rawSupplierPrice: 5000,
    calculationMode: SUPPLIER_CALCULATION_MODE_WEIGHT,
    supplierWeightGrams: 500,
  }), 10000);
  assert.equal(calculateSupplierComparablePrice({ rawSupplierPrice: 5000, unitDivisor: 10 }), 500);
});

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

test('el costo sugerido se redondea hacia arriba al entero que acepta el editor', () => {
  assert.equal(buildCasaAlbertoEstimatedCost(100.43), 111);
  assert.equal(buildCasaAlbertoEstimatedCost(100.5), 112);
  assert.equal(normalizeProductPurchasePrice(115.49), 116);
  assert.equal(normalizeProductPurchasePrice(115.5), 116);
});

test('Casa Alberto usa IVA 10,5% y margen bruto real para sugerir venta', () => {
  assert.equal(buildCasaAlbertoEstimatedCost(10000), 11050);
  assert.equal(buildSuggestedSalePriceFromMargin({}, 10000, { grossMarginPercent: 50 }), 22100);
  assert.equal(buildSuggestedSalePriceFromMargin({}, 10000, { grossMarginPercent: 70 }), 36840);
});

const buildProduct = ({
  id = 1,
  groupId = 'CA-1',
  purchasePrice = 115,
  reviewStatus = 'changed',
  approvedAt = null,
  acknowledgedSupplierPrice,
  rawSupplierPrice = 100,
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
        lastSupplierPrice: rawSupplierPrice,
        rawSupplierPrice,
        unitSupplierPrice: 100,
        unitDivisor: 1,
        estimatedCost: 115,
        approvedAt,
        ...(acknowledgedSupplierPrice !== undefined ? { acknowledgedSupplierPrice } : {}),
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

test('un costo por peso compara el valor por kilo con el costo guardado por gramo', () => {
  const product = buildProduct({ reviewStatus: 'approved', approvedAt: '2026-08-23T12:00:00.000Z' });
  product.product_type = 'weight';
  product.purchasePrice = 11.05;
  product.supplier_links.casa_alberto.price_tracking = {
    ...product.supplier_links.casa_alberto.price_tracking,
    calculationMode: 'weight',
    supplierWeightGrams: 500,
    rawSupplierPrice: 5000,
    unitSupplierPrice: 10000,
    estimatedCost: 11050,
  };

  assert.equal(getSupplierProductReviewState(product), 'approved');
  assert.equal(buildSupplierAttentionSummary([product]).attention, 0);
});

test('un cambio ignorado no vuelve como aviso al reiniciar', () => {
  const product = buildProduct({ purchasePrice: 80, reviewStatus: 'ignored' });

  assert.equal(getSupplierProductReviewState(product), 'ignored');
  assert.equal(buildSupplierAttentionSummary([product]).attention, 0);
});

test('un costo Rebu distinto no reabre un precio de proveedor ya revisado', () => {
  const product = buildProduct({ purchasePrice: 80, reviewStatus: 'reviewed' });
  const summary = buildSupplierAttentionSummary([product]);

  assert.equal(getSupplierProductReviewState(product), 'reviewed');
  assert.equal(summary.changes, 0);
  assert.equal(summary.errors, 0);
});

test('solo un precio nuevo de Casa Alberto vuelve a abrir la revisión', () => {
  const samePrice = buildProduct({
    purchasePrice: 80,
    reviewStatus: 'reviewed',
    acknowledgedSupplierPrice: 100,
    rawSupplierPrice: 100,
  });
  const higherPrice = buildProduct({
    purchasePrice: 115,
    reviewStatus: 'changed',
    acknowledgedSupplierPrice: 100,
    rawSupplierPrice: 120,
  });
  const lowerPrice = buildProduct({
    purchasePrice: 115,
    reviewStatus: 'price_down',
    acknowledgedSupplierPrice: 100,
    rawSupplierPrice: 90,
  });

  assert.equal(getAcknowledgedSupplierPrice(samePrice.supplier_links.casa_alberto.price_tracking), 100);
  assert.equal(getSupplierPriceChangeStatus(100, 100), 'reviewed');
  assert.equal(getSupplierProductReviewState(samePrice), 'reviewed');
  assert.equal(getSupplierProductReviewState(higherPrice), 'changed');
  assert.equal(getSupplierProductReviewState(lowerPrice), 'price_down');
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

test('variantes de URL del mismo producto Casa Alberto comparten un grupo', () => {
  const products = [
    buildProduct({ id: 1, groupId: '', purchasePrice: 80 }),
    buildProduct({ id: 2, groupId: '93686', purchasePrice: 70 }),
  ];
  products[0].supplier_links.casa_alberto.productUrl = 'http://cotilloncasaalberto.com.ar/pedido/detalle_mobile.php?idp=093686';
  products[1].supplier_links.casa_alberto.productUrl = 'https://www.cotilloncasaalberto.com.ar/pedido/detalle.php?idp=93686';

  const summary = buildSupplierAttentionSummary(products);

  assert.equal(summary.linked, 1);
  assert.equal(summary.attention, 1);
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

test('abrir Casa Alberto no inicia chequeos automáticos y prioriza la cola pendiente', async () => {
  const source = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  const openModeBlock = source.match(/const openSupplierPriceMode = useCallback\([\s\S]+?\}, \[\]\);/)?.[0] || '';

  assert.match(source, /useState\('pending'\)/);
  assert.match(source, />Casa Alberto</);
  assert.match(source, /SUPPLIER_GROUPS_VISIBLE_CHUNK = 50/);
  assert.match(source, /filteredCasaAlbertoGroups\.slice\(0, supplierVisibleGroupLimit\)/);
  assert.match(source, /Ver \{Math\.min\(SUPPLIER_GROUPS_VISIBLE_CHUNK/);
  assert.doesNotMatch(source, /rebu_supplier_price_view_mode_v1/);
  assert.doesNotMatch(source, /label: 'Tarjetas'|label: 'Lista'/);
  assert.match(source, /status: 'approved'/);
  assert.doesNotMatch(openModeBlock, /setSupplierPriceFilter/);
  assert.doesNotMatch(openModeBlock, /handleCheckAllSupplierPrices|setTimeout/);
});
