import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupplierLinkSuggestionRow,
  buildSupplierLinkSuggestionsFromRows,
  filterLiveSupplierLinkSuggestions,
  getSupplierLinkSuggestionKey,
  getSupplierLinkSuggestionProductIds,
  parseSupplierLinkSuggestionRow,
} from '../src/utils/supplierLinkSuggestions.js';

const product = (extra = {}) => ({ id: 10, title: 'Cacao', isActive: true, ...extra });

const suggestion = (extra = {}) => ({
  product: product(),
  matchedBy: 'title_search',
  result: {
    casaAlbertoId: '67115',
    foundTitle: 'Cacao amargo alzol',
    productUrl: 'https://casaalberto/detalle.php?idp=67115',
    supplierPrice: 839.13,
    unitDivisor: 1,
    estimatedCost: 928,
  },
  ...extra,
});

test('una sugerencia se convierte en fila lista para guardar', () => {
  const row = buildSupplierLinkSuggestionRow(suggestion());
  assert.equal(row.product_id, 10);
  assert.equal(row.casa_alberto_id, '67115');
  assert.equal(row.matched_by, 'title_search');
  assert.equal(row.status, 'pending');
  assert.equal(row.payload.supplierPrice, 839.13, 'los numeros no se pasan a texto');
  assert.equal(row.payload.foundTitle, 'Cacao amargo alzol');
});

test('sin producto o sin id de Casa Alberto no hay fila que guardar', () => {
  assert.equal(buildSupplierLinkSuggestionRow(), null);
  assert.equal(buildSupplierLinkSuggestionRow({}), null);
  assert.equal(buildSupplierLinkSuggestionRow({ product: {}, result: { casaAlbertoId: '1' } }), null);
  assert.equal(buildSupplierLinkSuggestionRow({ product: product(), result: {} }), null);
  assert.equal(
    buildSupplierLinkSuggestionRow({ product: product(), result: { casaAlbertoId: '   ' } }),
    null,
    'un id en blanco no cuenta',
  );
  assert.equal(
    buildSupplierLinkSuggestionRow({ product: product({ id: 0 }), result: { casaAlbertoId: '1' } }),
    null,
    'id 0 no es un producto',
  );
  assert.equal(
    buildSupplierLinkSuggestionRow({ product: product({ id: 'abc' }), result: { casaAlbertoId: '1' } }),
    null,
    'un id que no es numero no se guarda',
  );
});

test('solo se guardan los campos que la pantalla usa', () => {
  const row = buildSupplierLinkSuggestionRow(suggestion({
    result: {
      casaAlbertoId: '5',
      foundTitle: 'Algo',
      htmlCrudo: 'x'.repeat(50000),
      cookies: 'secreta',
      debugTrace: [1, 2, 3],
    },
  }));
  assert.deepEqual(Object.keys(row.payload).sort(), ['casaAlbertoId', 'foundTitle']);
  assert.equal(row.payload.htmlCrudo, undefined, 'no se guarda basura del scraping');
  assert.equal(row.payload.cookies, undefined, 'ni datos de sesion');
});

test('los vacios no ocupan lugar en el payload', () => {
  const row = buildSupplierLinkSuggestionRow(suggestion({
    result: {
      casaAlbertoId: '5', foundTitle: '', imageUrl: null, priceText: undefined, supplierPrice: 0,
    },
  }));
  assert.deepEqual(Object.keys(row.payload).sort(), ['casaAlbertoId']);
  assert.equal(row.payload.supplierPrice, undefined, 'un precio en 0 no aporta nada');
});

test('matchedBy cae en title_search cuando no viene', () => {
  assert.equal(buildSupplierLinkSuggestionRow(suggestion({ matchedBy: '' })).matched_by, 'title_search');
  assert.equal(buildSupplierLinkSuggestionRow(suggestion({ matchedBy: undefined })).matched_by, 'title_search');
  assert.equal(
    buildSupplierLinkSuggestionRow(suggestion({ matchedBy: 'trimmed_barcode' })).matched_by,
    'trimmed_barcode',
  );
});

test('una fila guardada vuelve a ser sugerencia con su producto', () => {
  const productsById = new Map([['10', product()]]);
  const parsed = parseSupplierLinkSuggestionRow({
    product_id: 10,
    casa_alberto_id: '67115',
    matched_by: 'trimmed_barcode',
    payload: { foundTitle: 'Cacao', supplierPrice: 100 },
    created_at: '2026-09-04T23:00:00.000Z',
  }, productsById);

  assert.equal(parsed.product.id, 10);
  assert.equal(parsed.result.casaAlbertoId, '67115', 'el id sale de la columna, no del payload');
  assert.equal(parsed.result.supplierPrice, 100);
  assert.equal(parsed.matchedBy, 'trimmed_barcode');
  assert.equal(parsed.persisted, true);
});

test('una fila cuyo producto ya no esta en el inventario se descarta', () => {
  assert.equal(parseSupplierLinkSuggestionRow({ product_id: 99, casa_alberto_id: '1' }, new Map()), null);
  assert.equal(parseSupplierLinkSuggestionRow({ casa_alberto_id: '1' }, new Map()), null);
  assert.equal(parseSupplierLinkSuggestionRow({ product_id: 10 }, new Map()), null);
});

test('un payload roto no rompe la carga', () => {
  const productsById = new Map([['10', product()]]);
  for (const payload of [null, undefined, 'texto', 42, ['a']]) {
    const parsed = parseSupplierLinkSuggestionRow(
      { product_id: 10, casa_alberto_id: '7', payload },
      productsById,
    );
    assert.equal(parsed.result.casaAlbertoId, '7', 'un payload raro no deberia romper la carga');
  }
});

test('se esconden las sugerencias de productos ya enlazados o dados de baja', () => {
  const vivas = filterLiveSupplierLinkSuggestions([
    { product: product({ id: 1 }) },
    { product: product({ id: 2, supplier_links: { casa_alberto: { casaAlbertoId: '9' } } }) },
    { product: product({ id: 3, isActive: false }) },
    { product: null },
    {},
  ]);
  assert.deepEqual(vivas.map((entry) => entry.product.id), [1]);
});

test('las descartadas no vuelven a aparecer', () => {
  const productsById = new Map([['10', product()], ['11', product({ id: 11 })]]);
  const suggestions = buildSupplierLinkSuggestionsFromRows([
    { product_id: 10, casa_alberto_id: 'a', status: 'pending' },
    { product_id: 11, casa_alberto_id: 'b', status: 'dismissed' },
  ], productsById);
  assert.deepEqual(suggestions.map((entry) => entry.product.id), [10]);
});

test('filas repetidas se quedan en una sola y salen de la mas vieja a la mas nueva', () => {
  const productsById = new Map([['10', product()], ['11', product({ id: 11 })]]);
  const suggestions = buildSupplierLinkSuggestionsFromRows([
    { product_id: 11, casa_alberto_id: 'b', created_at: '2026-09-05T00:00:00.000Z' },
    { product_id: 10, casa_alberto_id: 'a', created_at: '2026-09-04T00:00:00.000Z' },
    { product_id: 10, casa_alberto_id: 'a', created_at: '2026-09-04T00:00:00.000Z' },
  ], productsById);
  assert.equal(suggestions.length, 2, 'la repetida se cuenta una sola vez');
  assert.deepEqual(suggestions.map((entry) => entry.product.id), [10, 11]);
});

test('un producto puede tener dos sugerencias distintas de Casa Alberto', () => {
  const productsById = new Map([['10', product()]]);
  const suggestions = buildSupplierLinkSuggestionsFromRows([
    { product_id: 10, casa_alberto_id: 'bulto', created_at: '2026-09-04T00:00:00.000Z' },
    { product_id: 10, casa_alberto_id: 'unidad', created_at: '2026-09-04T00:00:01.000Z' },
  ], productsById);
  assert.equal(suggestions.length, 2, 'son opciones distintas del mismo producto');
});

test('la clave identifica la sugerencia venga de donde venga', () => {
  assert.equal(getSupplierLinkSuggestionKey(suggestion()), '10:67115');
  assert.equal(getSupplierLinkSuggestionKey({ productId: 10, casaAlbertoId: '67115' }), '10:67115');
  assert.equal(getSupplierLinkSuggestionKey({}), '');
  assert.equal(getSupplierLinkSuggestionKey({ product: { id: 10 } }), '', 'sin id del proveedor no hay clave');
});

test('no se vuelve a consultar al proveedor lo que ya tiene sugerencia', () => {
  const ids = getSupplierLinkSuggestionProductIds([
    { product_id: 10, status: 'pending' },
    { product_id: 11, status: 'dismissed' },
    { product_id: null },
    {},
  ]);
  assert.equal(ids.has('10'), true);
  assert.equal(ids.has('11'), true, 'lo descartado tampoco se vuelve a consultar');
  assert.equal(ids.size, 2);
});

test('listas vacias o rotas no explotan', () => {
  assert.deepEqual(buildSupplierLinkSuggestionsFromRows(), []);
  assert.deepEqual(buildSupplierLinkSuggestionsFromRows(null, new Map()), []);
  assert.deepEqual(filterLiveSupplierLinkSuggestions(null), []);
  assert.equal(getSupplierLinkSuggestionProductIds(null).size, 0);
});
