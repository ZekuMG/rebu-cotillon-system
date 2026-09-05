/**
 * Elegir entre los resultados de Casa Alberto.
 *
 * El proveedor publica el mismo articulo dos veces: suelto y por bulto
 * ("Cacao amargo alzol economico x1kg" y "Cacao amargo alzol economico
 * (bulto 10x1kg)"). El puntaje viejo solo miraba si el titulo del proveedor
 * contenia los primeros 18 caracteres del nuestro, asi que los dos empataban y
 * ganaba el que la pagina mostrara primero -- casi siempre el bulto, que sale
 * destacado. Resultado: se enlazaba el bulto de $64.260 en vez de la unidad de
 * $6.681.
 */

const BULK_PATTERN = /\b(bulto|bultos|caja\s*cerrada|display\s*cerrado)\b/i;

// "x12", "10x1kg", "x 6" -- la cantidad por bulto que el proveedor mete en el titulo.
const PACK_COUNT_PATTERN = /(?:^|[\s(])x\s*(\d{1,4})\b|\b(\d{1,4})\s*x\s*\d/i;

const STOP_WORDS = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'sin', 'por', 'y', 'a', 'un', 'una']);

export const normalizeSupplierText = (value = '') =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isSupplierBulkTitle = (title = '') => BULK_PATTERN.test(String(title ?? ''));

/** Cuantas unidades trae el bulto, si el titulo lo dice. 0 = no lo dice. */
export const getSupplierPackCount = (title = '') => {
  const match = String(title ?? '').match(PACK_COUNT_PATTERN);
  if (!match) return 0;
  const value = Number(match[1] || match[2] || 0);
  return Number.isFinite(value) && value > 1 ? value : 0;
};

const tokenize = (value = '') =>
  normalizeSupplierText(value).split(' ').filter((token) => token && !STOP_WORDS.has(token));

/** Cuanto se parecen dos titulos, 0 a 100, mirando TODAS las palabras. */
export const getSupplierTitleSimilarity = (expectedTitle = '', candidateTitle = '') => {
  const expected = tokenize(expectedTitle);
  if (expected.length === 0) return 0;
  const candidate = new Set(tokenize(candidateTitle));
  const hits = expected.filter((token) => candidate.has(token)).length;
  return Math.round((hits / expected.length) * 100);
};

const compactDigits = (value = '') => String(value ?? '').replace(/\D+/g, '');

const codesMatch = (expectedCode, candidateCode) => {
  const expected = compactDigits(expectedCode);
  const candidate = compactDigits(candidateCode);
  if (!expected || !candidate) return false;
  return expected === candidate
    || expected === candidate.slice(0, -1)
    || candidate === expected.slice(0, -1);
};

export const SUPPLIER_MATCH_WEIGHTS = Object.freeze({
  exactId: 100,
  exactCode: 80,
  titleSimilarity: 40,
  // Un bulto que no pedimos es el error caro: se enlaza el precio del bulto
  // entero como si fuera el de una unidad.
  unwantedBulk: -55,
  wantedBulk: 45,
  missingBulk: -25,
});

export const scoreSupplierCandidate = ({
  expectedTitle = '',
  expectedCode = '',
  expectedId = '',
  candidate = {},
} = {}) => {
  const candidateTitle = candidate?.foundTitle || candidate?.title || '';
  const similarity = getSupplierTitleSimilarity(expectedTitle, candidateTitle);
  const expectsBulk = isSupplierBulkTitle(expectedTitle);
  const candidateIsBulk = isSupplierBulkTitle(candidateTitle);

  let score = 0;
  if (expectedId && String(candidate?.casaAlbertoId || '') === String(expectedId)) {
    score += SUPPLIER_MATCH_WEIGHTS.exactId;
  }
  if (codesMatch(expectedCode, candidate?.supplierCode)) {
    score += SUPPLIER_MATCH_WEIGHTS.exactCode;
  }
  score += Math.round((similarity / 100) * SUPPLIER_MATCH_WEIGHTS.titleSimilarity);

  if (candidateIsBulk && !expectsBulk) score += SUPPLIER_MATCH_WEIGHTS.unwantedBulk;
  else if (candidateIsBulk && expectsBulk) score += SUPPLIER_MATCH_WEIGHTS.wantedBulk;
  else if (!candidateIsBulk && expectsBulk) score += SUPPLIER_MATCH_WEIGHTS.missingBulk;

  return { score, similarity, candidateIsBulk, expectsBulk };
};

/**
 * Elige el mejor resultado. Devuelve null si no hay ninguno usable.
 * Empate: gana el titulo mas parecido, y despues el que no sea bulto.
 */
export const pickBestSupplierCandidate = ({
  expectedTitle = '',
  expectedCode = '',
  expectedId = '',
  candidates = [],
} = {}) => {
  const usable = (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => candidate && (candidate.foundTitle || candidate.title),
  );
  if (usable.length === 0) return null;

  const scored = usable.map((candidate, index) => ({
    candidate,
    index,
    ...scoreSupplierCandidate({ expectedTitle, expectedCode, expectedId, candidate }),
  }));

  scored.sort((a, b) => (
    (b.score - a.score)
    || (b.similarity - a.similarity)
    || (Number(a.candidateIsBulk) - Number(b.candidateIsBulk))
    || (a.index - b.index)
  ));

  return scored[0];
};
