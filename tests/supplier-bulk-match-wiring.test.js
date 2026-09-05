import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const readSource = async (relativePath) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

test('el lector devuelve todos los resultados, no solo el primero de la pagina', async () => {
  const source = await readSource('../electron-main.cjs');
  assert.match(source, /var offeredCandidates = candidates\.slice\(0, 8\)\.map/);
  assert.match(source, /candidates: offeredCandidates,/);
});

test('el lector no manda el texto entero de la pagina en cada candidato', async () => {
  const source = await readSource('../electron-main.cjs');
  const start = source.indexOf('var offeredCandidates');
  const block = source.slice(start, source.indexOf('};', source.indexOf('candidates: offeredCandidates')));
  assert.doesNotMatch(block, /text: entry\.candidate\.text/, 'el campo text es la pagina completa');
});

test('la vista vuelve a elegir prefiriendo la unidad en los dos caminos', async () => {
  const source = await readSource('../src/views/BulkEditorView.jsx');
  assert.match(source, /import \{ pickBestSupplierCandidate \} from '\.\.\/utils\/supplierBulkMatch'/);
  assert.match(source, /const preferUnitOverBulk = \(result, \{/);

  const calls = source.match(/preferUnitOverBulk\(rawResult, \{/g) || [];
  assert.equal(calls.length, 2, 'se aplica tanto al detectar enlaces como al chequear un grupo');
});

test('al chequear un grupo ya enlazado se pasa el id, que manda sobre el nombre', async () => {
  const source = await readSource('../src/views/BulkEditorView.jsx');
  const start = source.indexOf('preferUnitOverBulk(rawResult, {\n        expectedTitle');
  assert.ok(start > 0, 'tiene que existir la llamada del chequeo por grupo');
  assert.match(source.slice(start, start + 300), /expectedId: group\.casaAlbertoId/);
});
