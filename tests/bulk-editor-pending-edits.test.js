import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { mergePendingEdits } from '../src/utils/bulkEditorEdits.js';

const base = {
  '1': { price: 3200, purchasePrice: 2113, stock: 0 },
  '2': { price: 1000, purchasePrice: 500, stock: 5 },
};

test('conserva lo que el usuario todavia no guardo cuando entra un cambio en vivo', () => {
  // Sol escribio 3500 en el producto 1 y todavia no aplico el lote.
  const enPantalla = { ...base, '1': { price: 3500, purchasePrice: 2113, stock: 0 } };
  // Llega el aviso en vivo del inventario (por su propio guardado de otra fila).
  const fresco = { ...base, '2': { price: 1200, purchasePrice: 500, stock: 5 } };

  const resultado = mergePendingEdits({ previous: enPantalla, fresh: fresco, baseline: base });

  assert.equal(resultado['1'].price, 3500, 'el precio que estaba escribiendo no se pierde');
  assert.equal(resultado['2'].price, 1200, 'lo que no tocó sí se actualiza con lo de la nube');
});

test('sin cambios pendientes toma todo lo que viene de la nube', () => {
  const fresco = { '1': { price: 4000, purchasePrice: 2113, stock: 2 } };
  const resultado = mergePendingEdits({ previous: base, fresh: fresco, baseline: base });
  assert.deepEqual(resultado, fresco);
});

test('un producto que ya no existe no revive', () => {
  const enPantalla = { ...base, '9': { price: 10, purchasePrice: 5, stock: 1 } };
  const resultado = mergePendingEdits({ previous: enPantalla, fresh: { '1': base['1'] }, baseline: base });
  assert.deepEqual(Object.keys(resultado), ['1']);
});

test('el editor masivo usa la fusion en vez de pisar la grilla', async () => {
  const source = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  assert.match(source, /mergePendingEdits/);
  assert.doesNotMatch(source, /setEdits\(buildEditStateFromInventory\(clonedData\)\)/);
});
