import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IMAGE_IMPORT_FILTERS,
  getImageImportCategoryOptions,
  getImageImportProductFields,
  isSafeImageImportMatch,
  matchesImageImportFilters,
  selectImageImportBatch,
  sortImageImportRows,
} from '../src/utils/imageImportQueue.js';

const NOW = new Date('2026-10-17T12:00:00Z').getTime();
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const makeRow = (productId, product, extra = {}) => ({
  rowId: `row-${productId}`,
  productId,
  title: product.title,
  barcode: product.barcode || '',
  status: 'pending',
  ...getImageImportProductFields({ id: productId, ...product }),
  ...extra,
});

const rows = [
  makeRow(1, { title: 'Vela viejita', created_at: daysAgo(200), stock: 4, category: 'Velas', barcode: '111' }),
  makeRow(2, { title: 'Globo nuevo', created_at: daysAgo(2), stock: 0, categories: ['Globos', 'Fiesta'] }),
  makeRow(3, { title: 'Antifaz', created_at: daysAgo(20), stock: 10, category: 'Disfraces', barcode: '333',
    supplier_links: { casa_alberto: { productUrl: 'http://www.cotilloncasaalberto.com.ar/pedido/detalle.php?idp=0451' } } }),
  makeRow(4, { title: 'Sin fecha', stock: 3, category: 'Velas' }),
  makeRow(5, { title: 'Bengala', created_at: daysAgo(5), stock: 7, category: 'Velas', barcode: '555' }, { status: 'found' }),
];

test('ordena por fecha de alta: los más nuevos primero y los sin fecha al final', () => {
  assert.deepEqual(sortImageImportRows(rows, 'newest').map((row) => row.productId), [2, 5, 3, 1, 4]);
  assert.deepEqual(sortImageImportRows(rows, 'oldest').map((row) => row.productId), [1, 3, 5, 2, 4]);
  assert.deepEqual(sortImageImportRows(rows, 'name').map((row) => row.title), ['Antifaz', 'Bengala', 'Globo nuevo', 'Sin fecha', 'Vela viejita']);
});

test('la tanda toma solo pendientes, respeta filtros, orden y cantidad', () => {
  const batch = selectImageImportBatch(rows, { sort: 'newest', limit: 2, now: NOW });
  assert.deepEqual(batch.map((row) => row.productId), [2, 3], 'la fila ya encontrada (5) no se vuelve a buscar');

  const recentWithStock = selectImageImportBatch(rows, {
    filters: { ...DEFAULT_IMAGE_IMPORT_FILTERS, ageDays: '30', stock: 'with' },
    now: NOW,
  });
  assert.deepEqual(recentWithStock.map((row) => row.productId), [3]);
});

test('filtra por categoría, código y enlace a Casa Alberto', () => {
  const pick = (filters) => rows
    .filter((row) => matchesImageImportFilters(row, { ...DEFAULT_IMAGE_IMPORT_FILTERS, ...filters }, NOW))
    .map((row) => row.productId);
  assert.deepEqual(pick({ categories: ['Velas'] }), [1, 4, 5]);
  assert.deepEqual(pick({ categories: ['Fiesta', 'Disfraces'] }), [2, 3]);
  assert.deepEqual(pick({ code: 'without' }), [2, 4]);
  assert.deepEqual(pick({ code: 'with' }), [1, 3, 5]);
  assert.deepEqual(pick({ link: 'linked' }), [3]);
  assert.deepEqual(pick({ link: 'unlinked' }), [1, 2, 4, 5]);
});

test('lee el enlace guardado de Casa Alberto y las categorías del producto', () => {
  const linked = rows.find((row) => row.productId === 3);
  assert.equal(linked.hasCasaAlbertoLink, true);
  assert.equal(linked.casaAlbertoId, '451');
  assert.deepEqual(getImageImportCategoryOptions(rows), [
    { value: 'Disfraces', count: 1 },
    { value: 'Fiesta', count: 1 },
    { value: 'Globos', count: 1 },
    { value: 'Velas', count: 3 },
  ]);
});

test('solo el código exacto cuenta como coincidencia segura', () => {
  const found = { status: 'found', approved: false, imageDataUrl: 'data:image/png;base64,x', matchQuality: 'barcode_exact' };
  assert.equal(isSafeImageImportMatch(found), true);
  assert.equal(isSafeImageImportMatch({ ...found, fallbackSearch: 'trimmed_barcode' }), false);
  assert.equal(isSafeImageImportMatch({ ...found, matchQuality: 'title_similarity' }), false);
  assert.equal(isSafeImageImportMatch({ ...found, matchQuality: 'casa_alberto_link' }), false);
  assert.equal(isSafeImageImportMatch({ ...found, approved: true }), false);
});
