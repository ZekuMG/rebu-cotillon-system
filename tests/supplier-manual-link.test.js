import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManualCasaAlbertoLink,
  findLinkableProducts,
  parseCasaAlbertoProductInput,
} from '../src/utils/supplierManualLink.js';

const product = (id, title, extra = {}) => ({ id, title, isActive: true, ...extra });
const linkedTo = (id, foundTitle = '') => ({
  supplier_links: { casa_alberto: { casaAlbertoId: String(id), foundTitle } },
});

test('acepta el link de la ficha del producto', () => {
  const parsed = parseCasaAlbertoProductInput('https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.casaAlbertoId, '67115');
  assert.match(parsed.productUrl, /idp=67115$/);
});

test('acepta el link con www, sin https y con parametros de mas', () => {
  for (const entrada of [
    'www.cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115',
    'cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115',
    'http://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115&volver=1',
    '  https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115  ',
  ]) {
    const parsed = parseCasaAlbertoProductInput(entrada);
    assert.equal(parsed.valid, true, `deberia aceptar: ${entrada}`);
    assert.equal(parsed.casaAlbertoId, '67115');
  }
});

test('acepta el numero de producto pelado', () => {
  const parsed = parseCasaAlbertoProductInput('67115');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.casaAlbertoId, '67115');
  assert.equal(parsed.productUrl, 'https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=67115');
});

test('el link de una BUSQUEDA no sirve y lo dice claro', () => {
  const parsed = parseCasaAlbertoProductInput(
    'https://cotilloncasaalberto.com.ar/pedido/carpeta_ver.php?buscar_txt=CACAO',
  );
  assert.equal(parsed.valid, false);
  assert.match(parsed.reason, /ficha del art/i, 'tiene que explicar que abra la ficha');
});

test('un link de otro sitio se rechaza', () => {
  const parsed = parseCasaAlbertoProductInput('https://mercadolibre.com.ar/producto?idp=67115');
  assert.equal(parsed.valid, false);
  assert.match(parsed.reason, /cotilloncasaalberto/);
});

test('vacio o basura se rechaza sin romper', () => {
  assert.equal(parseCasaAlbertoProductInput('').valid, false);
  assert.equal(parseCasaAlbertoProductInput('   ').valid, false);
  assert.equal(parseCasaAlbertoProductInput().valid, false);
  assert.equal(parseCasaAlbertoProductInput('cualquier cosa').valid, false);
  assert.equal(parseCasaAlbertoProductInput(null).valid, false);
});

test('un idp que no es numero se rechaza', () => {
  const parsed = parseCasaAlbertoProductInput('https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=abc');
  assert.equal(parsed.valid, false);
});

test('el enlace manual queda marcado como manual', () => {
  const link = buildManualCasaAlbertoLink({ casaAlbertoId: '67115' });
  assert.equal(link.casaAlbertoId, '67115');
  assert.equal(link.matchedBy, 'manual', 'para saber que lo puso una persona');
  assert.match(link.productUrl, /idp=67115/);
  assert.equal(link.foundTitle, undefined, 'sin titulo no se inventa uno');
});

test('sin id no se arma enlace', () => {
  assert.equal(buildManualCasaAlbertoLink(), null);
  assert.equal(buildManualCasaAlbertoLink({ casaAlbertoId: '  ' }), null);
});

const inventory = [
  product(1, 'HARINA DE ALMENDRA BORGES x1kg'),
  product(2, 'HARINA DE ALMENDRA BORGES x500g'),
  product(3, 'HARINA DE TRIGO COMUN'),
  product(4, 'HARINA DE ALMENDRA VIEJA', { isActive: false }),
  product(5, 'HARINA DE ALMENDRA YA ENLAZADA', linkedTo('999', 'Otro de Casa Alberto')),
  product(6, 'HARINA DE ALMENDRA MISMO ENLACE', linkedTo('555')),
];
const group = { casaAlbertoId: '555', products: [product(1, 'HARINA DE ALMENDRA BORGES x1kg')] };

test('busca por nombre y saca lo que no corresponde', () => {
  const found = findLinkableProducts({ inventory, query: 'harina almendra', group });
  const ids = found.map((entry) => entry.product.id);
  assert.ok(!ids.includes(1), 'el que ya esta en el grupo no se ofrece');
  assert.ok(!ids.includes(3), 'trigo no matchea almendra');
  assert.ok(!ids.includes(4), 'un producto dado de baja no se ofrece');
  assert.ok(!ids.includes(6), 'el que ya apunta a este mismo enlace no se ofrece');
  assert.ok(ids.includes(2), 'el x500g si se puede sumar');
  assert.ok(ids.includes(5), 'el que tiene otro enlace se ofrece, pero avisado');
});

test('avisa cuando sumarlo le pisa un enlace que ya tenia', () => {
  const found = findLinkableProducts({ inventory, query: 'ya enlazada', group });
  assert.equal(found.length, 1);
  assert.equal(found[0].hasOtherLink, true);
  assert.equal(found[0].currentLinkTitle, 'Otro de Casa Alberto');
});

test('todas las palabras tienen que estar, en cualquier orden', () => {
  assert.equal(findLinkableProducts({ inventory, query: 'almendra borges', group }).length, 1);
  assert.equal(findLinkableProducts({ inventory, query: 'borges almendra', group }).length, 1);
  assert.equal(findLinkableProducts({ inventory, query: 'almendra inexistente', group }).length, 0);
});

test('busca tambien por codigo de barras', () => {
  const conCodigo = [product(9, 'ALGO SUELTO', { barcode: '7791234567890' })];
  assert.equal(findLinkableProducts({ inventory: conCodigo, query: '7791234567890', group }).length, 1);
});

test('acentos y mayusculas no importan al buscar', () => {
  const conAcento = [product(9, 'LIMÓN EN ALMÍBAR')];
  assert.equal(findLinkableProducts({ inventory: conAcento, query: 'limon almibar', group }).length, 1);
});

test('sin texto no devuelve nada, para no listar el inventario entero', () => {
  assert.deepEqual(findLinkableProducts({ inventory, query: '', group }), []);
  assert.deepEqual(findLinkableProducts({ inventory, query: '   ', group }), []);
});

test('respeta el tope de resultados', () => {
  const muchos = Array.from({ length: 50 }, (_, index) => product(index + 100, `HARINA NUMERO ${index}`));
  assert.equal(findLinkableProducts({ inventory: muchos, query: 'harina', group, limit: 5 }).length, 5);
});

test('entradas rotas no rompen la busqueda', () => {
  assert.deepEqual(findLinkableProducts(), []);
  assert.deepEqual(findLinkableProducts({ inventory: null, query: 'x' }), []);
  assert.deepEqual(findLinkableProducts({ inventory: [null, {}], query: 'x' }), []);
  assert.equal(findLinkableProducts({ inventory, query: 'harina', group: null }).length > 0, true);
});

// --- Cableado en la vista -------------------------------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const readView = async () =>
  readFile(fileURLToPath(new URL('../src/views/BulkEditorView.jsx', import.meta.url)), 'utf8');

test('pegar el link completa el ID solo (si no, el grupo no cambia)', async () => {
  const source = await readView();
  assert.match(source, /if \(field === 'productUrl'\) \{/);
  assert.match(source, /next\.casaAlbertoId = parsed\.casaAlbertoId;/);
  assert.match(source, /next\.linkError = value\.trim\(\) && !parsed\.valid \? parsed\.reason : '';/);
});

test('no se puede guardar un enlace con un link invalido', async () => {
  const source = await readView();
  assert.match(source, /disabled=\{Boolean\(draft\.linkError\)\}/);
});

test('el boton + suma un producto al enlace del grupo', async () => {
  const source = await readView();
  assert.match(source, /const handleAddProductToSupplierGroup = async \(group, entry\) => \{/);
  assert.match(source, /toggleSupplierAddProduct\(group\);/);
  assert.match(source, /findLinkableProducts\(\{/);
});

test('el + esta apagado si el grupo todavia no tiene enlace', async () => {
  const source = await readView();
  const start = source.indexOf('toggleSupplierAddProduct(group);');
  assert.match(source.slice(start, start + 400), /disabled=\{isOfflineReadOnly \|\| !group\.casaAlbertoId\}/);
});

test('avisa antes de pisarle el enlace a un producto que ya tenia otro', async () => {
  const source = await readView();
  const start = source.indexOf('const handleAddProductToSupplierGroup');
  const block = source.slice(start, start + 2000);
  assert.match(block, /if \(entry\.hasOtherLink\) \{/);
  assert.match(block, /if \(!confirmacion\.isConfirmed\) return;/);
});
