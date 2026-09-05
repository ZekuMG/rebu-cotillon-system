import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSupplierPackCount,
  getSupplierTitleSimilarity,
  isSupplierBulkTitle,
  pickBestSupplierCandidate,
  scoreSupplierCandidate,
} from '../src/utils/supplierBulkMatch.js';

// Caso reportado con captura: Casa Alberto muestra el bulto primero y el
// sistema lo elegia. El bulto sale $64.260 y la unidad $6.681.
const CACAO_BULTO = {
  foundTitle: 'Cacao amargo alzol economico (bulto 10x1kg)',
  supplierCode: '065675080933',
  casaAlbertoId: '70903',
  supplierPrice: 64260,
};
const CACAO_UNIDAD = {
  foundTitle: 'Cacao amargo alzol economico x1kg',
  supplierCode: '072354056201',
  casaAlbertoId: '70904',
  supplierPrice: 6681,
};

test('se elige la unidad y no el bulto (caso cacao alzol)', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [CACAO_BULTO, CACAO_UNIDAD],
  });
  assert.equal(best.candidate.supplierPrice, 6681, 'tiene que ganar la unidad de $6.681');
  assert.equal(best.candidateIsBulk, false);
});

test('el orden en que los muestra el proveedor no decide', () => {
  const conBultoPrimero = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [CACAO_BULTO, CACAO_UNIDAD],
  });
  const conUnidadPrimero = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [CACAO_UNIDAD, CACAO_BULTO],
  });
  assert.equal(conBultoPrimero.candidate.supplierPrice, conUnidadPrimero.candidate.supplierPrice);
});

test('caso caramelo billiken: tampoco se va al bulto x12', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CARAMELO MASTICABLE FRUTAL BILLIKEN x600g',
    candidates: [
      { foundTitle: 'Caramelo masticable frutal billiken x600g (bulto x12) 174023/174050', supplierPrice: 43526.65 },
      { foundTitle: 'Caramelo masticable frutal billiken x600g', supplierPrice: 3627.32 },
    ],
  });
  assert.equal(best.candidate.supplierPrice, 3627.32);
});

test('si nuestro producto ES un bulto, se elige el bulto', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO BULTO 10x1kg',
    candidates: [CACAO_UNIDAD, CACAO_BULTO],
  });
  assert.equal(best.candidate.supplierPrice, 64260, 'si lo pedimos por bulto, va el bulto');
  assert.equal(best.expectsBulk, true);
});

test('con un solo resultado se devuelve ese, sea bulto o no', () => {
  const soloBulto = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [CACAO_BULTO],
  });
  assert.equal(soloBulto.candidate.supplierPrice, 64260, 'no hay con que compararlo');
  assert.equal(soloBulto.candidateIsBulk, true, 'pero queda marcado como bulto');
});

test('el codigo exacto le gana a la preferencia por unidad', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    expectedCode: '065675080933',
    candidates: [CACAO_UNIDAD, CACAO_BULTO],
  });
  assert.equal(
    best.candidate.supplierPrice,
    64260,
    'si el codigo de barras dice que es ese, mandan los numeros y no el nombre',
  );
});

test('el id exacto manda sobre todo lo demas', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    expectedId: '70903',
    candidates: [CACAO_UNIDAD, CACAO_BULTO],
  });
  assert.equal(best.candidate.casaAlbertoId, '70903');
});

test('detecta las formas en que el proveedor escribe bulto', () => {
  assert.equal(isSupplierBulkTitle('Algo (bulto 10x1kg)'), true);
  assert.equal(isSupplierBulkTitle('Algo (BULTO x12)'), true);
  assert.equal(isSupplierBulkTitle('Algo bultos x6'), true);
  assert.equal(isSupplierBulkTitle('Algo caja cerrada'), true);
  assert.equal(isSupplierBulkTitle('Algo x1kg'), false);
  assert.equal(isSupplierBulkTitle('Cajita feliz x1'), false, 'caja suelta no es caja cerrada');
  assert.equal(isSupplierBulkTitle(''), false);
  assert.equal(isSupplierBulkTitle(null), false);
});

test('lee cuantas unidades trae el bulto cuando el titulo lo dice', () => {
  assert.equal(getSupplierPackCount('Algo (bulto x12)'), 12);
  assert.equal(getSupplierPackCount('Algo (bulto 10x1kg)'), 10);
  assert.equal(getSupplierPackCount('Algo x1kg'), 0, 'x1 no es un bulto');
  assert.equal(getSupplierPackCount('Algo suelto'), 0);
  assert.equal(getSupplierPackCount(''), 0);
});

test('la similitud mira todas las palabras, no los primeros 18 caracteres', () => {
  // Este es el punto: con slice(0,18) los dos daban lo mismo y empataban.
  const alBulto = getSupplierTitleSimilarity(
    'CACAO AMARGO ALZOL ECONOMICO x1kg',
    'Cacao amargo alzol economico (bulto 10x1kg)',
  );
  const aLaUnidad = getSupplierTitleSimilarity(
    'CACAO AMARGO ALZOL ECONOMICO x1kg',
    'Cacao amargo alzol economico x1kg',
  );
  assert.equal(aLaUnidad, 100);
  assert.ok(aLaUnidad > alBulto, 'la unidad tiene que parecerse mas que el bulto');
});

test('acentos y mayusculas no cambian la similitud', () => {
  assert.equal(getSupplierTitleSimilarity('LIMÓN x1', 'limon x1'), 100);
  assert.equal(getSupplierTitleSimilarity('Ñandú Especial', 'nandu especial'), 100);
});

test('las palabras de relleno no inflan el parecido', () => {
  assert.equal(
    getSupplierTitleSimilarity('Vela de la torta con brillo', 'vela torta brillo'),
    100,
    'de / la / con no cuentan',
  );
});

test('sin titulo esperado no se inventa parecido', () => {
  assert.equal(getSupplierTitleSimilarity('', 'lo que sea'), 0);
  assert.equal(getSupplierTitleSimilarity(null, 'lo que sea'), 0);
});

test('el puntaje explica por que gano cada uno', () => {
  const unidad = scoreSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidate: CACAO_UNIDAD,
  });
  const bulto = scoreSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidate: CACAO_BULTO,
  });
  assert.ok(unidad.score > bulto.score, 'la unidad tiene que puntuar mas alto');
  assert.equal(bulto.candidateIsBulk, true);
  assert.equal(bulto.expectsBulk, false);
});

test('listas vacias o rotas devuelven null en vez de romper', () => {
  assert.equal(pickBestSupplierCandidate(), null);
  assert.equal(pickBestSupplierCandidate({ candidates: [] }), null);
  assert.equal(pickBestSupplierCandidate({ candidates: null }), null);
  assert.equal(pickBestSupplierCandidate({ candidates: [null, undefined, {}] }), null);
});

test('un candidato sin titulo no se elige', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [{ supplierPrice: 1, foundTitle: '' }, CACAO_UNIDAD],
  });
  assert.equal(best.candidate.supplierPrice, 6681);
});

test('acepta candidatos que traen title en vez de foundTitle', () => {
  const best = pickBestSupplierCandidate({
    expectedTitle: 'CACAO AMARGO ALZOL ECONOMICO x1kg',
    candidates: [
      { title: 'Cacao amargo alzol economico (bulto 10x1kg)', supplierPrice: 64260 },
      { title: 'Cacao amargo alzol economico x1kg', supplierPrice: 6681 },
    ],
  });
  assert.equal(best.candidate.supplierPrice, 6681);
});
