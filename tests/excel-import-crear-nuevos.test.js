import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leerVista = () => readFile(
  new URL('../src/components/BulkExcelImportView.jsx', import.meta.url),
  'utf8',
);

test('crear un producto nuevo no depende de que la busqueda no encuentre nada', async () => {
  const source = await leerVista();
  // Antes el boton solo aparecia con `query.trim() && candidatos.length === 0`:
  // si el buscador traia aunque sea un parecido malo, no habia forma de crear.
  assert.doesNotMatch(
    source,
    /assignmentQuery\.trim\(\)\s*&&\s*activeCandidates\.length === 0\s*&&/,
  );
  assert.match(source, /Crear producto nuevo/);
});

test('sin nada escrito, propone crear con el nombre que trae el Excel', async () => {
  const source = await leerVista();
  assert.match(source, /assignmentQuery\.trim\(\)\s*\|\|\s*[^\n]*entry[^\n]*description/);
});

test('el panel de crear pendientes arranca abierto', async () => {
  const source = await leerVista();
  assert.match(source, /const \[isCreateSectionOpen, setIsCreateSectionOpen\] = useState\(true\)/);
  assert.match(source, /open=\{isCreateSectionOpen\}/);
});

test('el boton Crear no queda trabado cuando no seleccionaste ninguna fila', async () => {
  const source = await leerVista();
  // Con 0 seleccionadas toma todas las pendientes en vez de quedarse deshabilitado.
  assert.doesNotMatch(source, /disabled=\{selectedCreateRowIds\.length === 0 \|\| isOperationBusy \|\| !canCreateInventory\}/);
  assert.match(source, /rowIdsParaCrear/);
});
