import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getVisibleSupplierLinkSuggestions,
  upsertSupplierLinkSuggestion,
} from '../src/utils/supplierLinkSuggestions.js';

const buildSuggestion = (index, title = `Producto ${index}`) => ({
  product: { id: index, title },
  result: { casaAlbertoId: `ca-${index}` },
});

test('conserva todas las sugerencias aunque la vista muestre solo una tanda', () => {
  const suggestions = Array.from({ length: 25 }, (_, index) => index + 1)
    .reduce((current, index) => upsertSupplierLinkSuggestion(current, buildSuggestion(index)), []);

  assert.equal(suggestions.length, 25, 'ninguna sugerencia pendiente se descarta al superar 20');
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.product.id),
    Array.from({ length: 25 }, (_, index) => index + 1),
    'los resultados nuevos se agregan al final para no desplazar lo que ya se estaba revisando',
  );
  assert.deepEqual(
    getVisibleSupplierLinkSuggestions(suggestions, 20).map((suggestion) => suggestion.product.id),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
});

test('actualiza una sugerencia repetida sin cambiar su lugar en la cola', () => {
  const original = [buildSuggestion(1), buildSuggestion(2), buildSuggestion(3)];
  const updated = upsertSupplierLinkSuggestion(original, buildSuggestion(2, 'Producto 2 actualizado'));

  assert.equal(updated.length, 3);
  assert.deepEqual(updated.map((suggestion) => suggestion.product.id), [1, 2, 3]);
  assert.equal(updated[1].product.title, 'Producto 2 actualizado');
  assert.notEqual(updated, original, 'la operacion mantiene la inmutabilidad del estado React');
});
