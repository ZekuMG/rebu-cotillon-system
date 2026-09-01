import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  detectPackSize,
  resolveUnitDivisor,
} from '../src/utils/casaAlbertoUnits.js';

// Todos los titulos de aca abajo son REALES: salieron de
// supplier_links.casa_alberto.foundTitle en produccion el 1-sep-2026.
// El divisor esperado se leyo a mano producto por producto.

test('lee el pack cuando Casa Alberto lo escribe pegado a la palabra bulto', () => {
  // El detector viejo perdia todos estos porque exigia un espacio antes de la "x",
  // y el costo estimado salia multiplicado por 6, 8, 10 o 12.
  assert.equal(detectPackSize('Chips chocolate semiamargo lodiser (bulto 6 x kg.) chip01a').pack, 6);
  assert.equal(detectPackSize('Chocolate chocolart semiamargo (bulto8x500grs) 213/ca500').pack, 8);
  assert.equal(detectPackSize('Dulce de leche vacalin repostero (bulto 12unidx400gr)').pack, 12);
  assert.equal(detectPackSize('Fecula de maiz alzol fraccionada (bulto x10kg)').pack, 10);
  assert.equal(detectPackSize('Caramelera calabaza violeta (packx10u.)').pack, 10);
  assert.equal(detectPackSize('Caramelera calabaza terror naranja (pack x10u.)').pack, 10);
});

test('lee el pack cuando la x va pegada a una letra', () => {
  assert.equal(detectPackSize('Careta plastica gatox6 3298').pack, 6);
  assert.equal(detectPackSize('Caja con visor corazon blanca multiuso (10x10x5cm)x10u.morroni (ch6)').pack, 10);
});

test('lee el pack cuando esta separado, como siempre lo leyo bien', () => {
  assert.equal(detectPackSize('Bolson corbata impreso con estrellas fluo x5').pack, 5);
  assert.equal(detectPackSize('Globo bombucha liso 12" azul x25 70401').pack, 25);
  assert.equal(detectPackSize('Blonda redonda blanca 18 cm x100 bbb18 pacolon').pack, 100);
  assert.equal(detectPackSize('Corneta carioca fluo chica (21cm) x4').pack, 4);
  assert.equal(detectPackSize('Cubanito chocolate oblita x48 1610').pack, 48);
});

test('NO confunde una unidad de medida con una cantidad', () => {
  // Estos son los falsos positivos peligrosos: dividir por gramos, metros o
  // centimetros hace ver el costo MAS BARATO de lo que es, y eso se aprueba.
  assert.equal(detectPackSize('Durazno premiun en mitades lata cumana x820 grs').pack, 1);
  assert.equal(detectPackSize('Frasco cremor tartaro pastelar x150 gr.').pack, 1);
  assert.equal(detectPackSize('Cinta doble faz adhesiva 18mm x 10 mts. c.b.x. packing lila').pack, 1);
  assert.equal(detectPackSize('Cortina metalizada verde (1.00 x2.00 mts) x1 u19-65').pack, 1);
});

test('NO confunde las dimensiones de una caja con una cantidad', () => {
  // El detector viejo devolvia 17 aca: se comia los centimetros del ancho.
  assert.equal(
    detectPackSize('Caja multiuso delivery kraft rectangular grande ctadg025 (25 x17 x9cm) x25 medoro (m1)').pack,
    25,
  );
});

test('la pulgada cuenta como medida, no como cantidad', () => {
  // 'reflex 12"' termina en x + numero. Sin tratar la pulgada como medida,
  // el 12 competia con el 10 real y el resultado quedaba ambiguo.
  assert.equal(detectPackSize('Globo globox cromo reflex 12" azul x10 71873').pack, 10);
});

test('la palabra bulto sola no alcanza: tiene que haber una multiplicacion', () => {
  // "Blister 100 pirotines" describe el CONTENIDO del blister. Rebu vende el
  // blister entero, asi que el divisor es 1. Verificado contra la ficha Rebu.
  assert.equal(detectPackSize('Blister 100 pirotines varios modelos x1 201688').pack, 1);
  assert.equal(detectPackSize('Blister 300 pirotines varios modelos x1 201693').pack, 1);
});

test('sin senal de pack, el pack es 1', () => {
  assert.equal(detectPackSize('Bouquet de rosas en caja con lazo x1 lc-169-2').pack, 1);
  assert.equal(detectPackSize('Cacao negro alzol x500gr').pack, 1);
});

test('sin titulo no revienta', () => {
  assert.equal(detectPackSize('').pack, 1);
  assert.equal(detectPackSize(null).pack, 1);
  assert.equal(detectPackSize(undefined).pack, 1);
});

test('dice con que regla decidio', () => {
  assert.equal(detectPackSize('Caramelera calabaza violeta (packx10u.)').rule, 'bulto');
  assert.equal(detectPackSize('Bolson corbata impreso con estrellas fluo x5').rule, 'xN');
  assert.equal(detectPackSize('Cacao negro alzol x500gr').rule, 'sin-senal');
});

test('ante dos cantidades igual de fuertes devuelve null en vez de adivinar', () => {
  const r = detectPackSize('Combo sorpresa x6 u. y x8 u. surtido');
  assert.equal(r.pack, null);
  assert.equal(r.rule, 'ambiguo');
});

// ---------------------------------------------------------------------------
// El divisor no es el pack de Casa Alberto: es el COCIENTE entre lo que cobra
// Casa Alberto y lo que Rebu vende como una unidad. Las dos puntas traen pack.
// ---------------------------------------------------------------------------

test('si el producto Rebu es la unidad, el divisor es el pack de Casa Alberto', () => {
  assert.equal(
    resolveUnitDivisor({
      supplierTitle: 'Dulce de leche vacalin repostero (bulto 12unidx400gr)',
      rebuTitle: 'DULCE DE LECHE VACALIN REPOSTERO x400g',
    }).divisor,
    12,
  );
});

test('si las dos puntas traen pack, el cociente es ambiguo y decide una persona', () => {
  // Rebu vende un pack de 6 y Casa Alberto uno de 48: no se puede saber si el
  // precio de Casa Alberto cubre 8 packs de Rebu o si los packs son la misma cosa.
  const r = resolveUnitDivisor({
    supplierTitle: 'Cubanito chocolate oblita x48 1610',
    rebuTitle: 'CUBANITO CHOCOLATE OBLITA x6 1610',
  });
  assert.equal(r.divisor, null);
  assert.match(r.reason, /ambig/i);
});

test('si Casa Alberto no trae pack, el divisor es 1', () => {
  assert.equal(
    resolveUnitDivisor({
      supplierTitle: 'Cacao negro alzol x500gr',
      rebuTitle: 'CACAO NEGRO ALZOL',
    }).divisor,
    1,
  );
});

test('un pack ambiguo del lado de Casa Alberto no se resuelve solo', () => {
  assert.equal(
    resolveUnitDivisor({
      supplierTitle: 'Combo sorpresa x6 u. y x8 u. surtido',
      rebuTitle: 'COMBO SORPRESA',
    }).divisor,
    null,
  );
});

// ---------------------------------------------------------------------------
// El editor masivo tiene que usar ESTE modulo y no su propia copia de la regla.
// La deteccion vieja vivia como funcion privada adentro de la vista, donde
// nadie la podia probar; que vuelva a aparecer ahi seria una regresion.
// ---------------------------------------------------------------------------

test('el editor masivo usa el modulo y no su propio detector', async () => {
  const fuente = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  assert.match(fuente, /from '\.\.\/utils\/casaAlbertoUnits\.js'/);
  assert.match(fuente, /resolveUnitDivisor/);
  assert.doesNotMatch(fuente, /const detectCasaAlbertoUnitDivisor\s*=/);
});

test('el editor masivo avisa cuando las unidades quedan ambiguas', async () => {
  const fuente = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  // Ante un cociente ambiguo no se puede caer a 1 en silencio: eso es adivinar.
  assert.match(fuente, /divisorAmbiguo/);
});
