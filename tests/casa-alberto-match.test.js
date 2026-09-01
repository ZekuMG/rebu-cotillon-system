import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { evaluateSupplierReadResult } from '../src/utils/casaAlbertoMatch.js';

// Contexto: el lector de precios puntuaba al candidato (+100 si coincide el idp,
// +80 el codigo, +20 el titulo) y despues IGNORABA el puntaje: aceptaba
// `status:'found'` con puntaje 0. Cuando la pagina no era la ficha del producto,
// el titulo caia a cualquier <h1> y el precio a cualquier "$N" del documento.
// Resultado medido el 1-sep-2026: 74 de 499 enlaces habian leido la pagina del
// carrito y guardado el TOTAL DEL CARRITO como precio del producto.

const FICHA = 'https://www.casaalberto.com.ar/pedido/detalle.php?idp=93686';

test('acepta cuando el idp de la pagina es el que se pidio', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686', supplierCode: '693252506326' },
    result: { status: 'found', casaAlbertoId: '93686', productUrl: FICHA, foundTitle: 'Cortina metalizada dorada' },
  });
  assert.equal(r.accepted, true);
  assert.equal(r.reason, 'idp');
});

test('rechaza la pagina del carrito', () => {
  // El caso real: 74 productos quedaron con foundTitle "Mi Carrito" y el total
  // del carrito guardado como si fuera el precio del producto.
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686', supplierCode: '693252506326' },
    result: {
      status: 'found',
      casaAlbertoId: '',
      productUrl: 'https://www.casaalberto.com.ar/pedido/carrito.php',
      foundTitle: 'Mi Carrito',
      supplierPrice: 13902.5,
    },
  });
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'url_no_es_ficha');
});

test('rechaza una ficha de OTRO producto', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686', supplierCode: '693252506326' },
    result: {
      status: 'found',
      casaAlbertoId: '11111',
      productUrl: 'https://www.casaalberto.com.ar/pedido/detalle.php?idp=11111',
      foundTitle: 'Otra cosa',
    },
  });
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'id_distinto');
});

test('el parecido de titulo NO alcanza para dar por bueno un precio', () => {
  // COCO RALLADO ALZOL FUCSIA xkg estaba enlazado a "Coco rallado alzol rosa
  // x1/2 kg": otro color y la mitad del peso. Con +20 de parecido entraba igual.
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686', supplierCode: '693252506326' },
    result: {
      status: 'found',
      casaAlbertoId: '55555',
      productUrl: 'https://www.casaalberto.com.ar/pedido/detalle.php?idp=55555',
      supplierCode: '999999999',
      foundTitle: 'Coco rallado alzol rosa x1/2 kg',
    },
  });
  assert.equal(r.accepted, false);
});

test('acepta por codigo de proveedor cuando no hay idp esperado', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '', supplierCode: '693252506326' },
    result: {
      status: 'found',
      casaAlbertoId: '93686',
      productUrl: FICHA,
      supplierCode: '693252506326',
      foundTitle: 'Cortina metalizada dorada',
    },
  });
  assert.equal(r.accepted, true);
  assert.equal(r.reason, 'codigo');
});

test('rechaza cuando el codigo de proveedor no coincide', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '', supplierCode: '693252506326' },
    result: {
      status: 'found',
      casaAlbertoId: '93686',
      productUrl: FICHA,
      supplierCode: '000000000',
      foundTitle: 'Otra cosa',
    },
  });
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'codigo_distinto');
});

test('sin nada con que comparar, la ficha valida alcanza', () => {
  // No se puede exigir identidad si nunca se guardo un id ni un codigo.
  // La guarda de URL igual descarta el carrito, que era el caso real.
  const r = evaluateSupplierReadResult({
    expected: {},
    result: { status: 'found', casaAlbertoId: '93686', productUrl: FICHA, foundTitle: 'Cortina metalizada dorada' },
  });
  assert.equal(r.accepted, true);
  assert.equal(r.reason, 'solo_url');
});

test('acepta la ficha_mobile, que es la misma ficha', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686' },
    result: {
      status: 'found',
      casaAlbertoId: '93686',
      productUrl: 'https://www.casaalberto.com.ar/pedido/detalle_mobile.php?idp=93686',
      foundTitle: 'Cortina metalizada dorada',
    },
  });
  assert.equal(r.accepted, true);
});

test('cae a sourceUrl si no vino productUrl', () => {
  const r = evaluateSupplierReadResult({
    expected: { casaAlbertoId: '93686' },
    result: { status: 'found', casaAlbertoId: '93686', sourceUrl: FICHA, foundTitle: 'Cortina' },
  });
  assert.equal(r.accepted, true);
});

test('una lectura que no es "found" nunca se acepta', () => {
  assert.equal(evaluateSupplierReadResult({ expected: {}, result: { status: 'error' } }).accepted, false);
  assert.equal(evaluateSupplierReadResult({ expected: {}, result: null }).accepted, false);
});

test('el editor masivo consulta el piso de confianza antes de guardar un precio', async () => {
  const fuente = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  assert.match(fuente, /from '\.\.\/utils\/casaAlbertoMatch\.js'/);
  assert.match(fuente, /evaluateSupplierReadResult/);
});

test('el motivo del rechazo se persiste, para poder auditarlo despues', async () => {
  const fuente = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(fuente, /brokenReason: check\.brokenReason/);
});
