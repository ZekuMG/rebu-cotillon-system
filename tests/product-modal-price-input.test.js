import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leerModal = () => readFile(
  new URL('../src/components/modals/ProductModals.jsx', import.meta.url),
  'utf8',
);

test('el precio y el costo se escriben como texto y se redondean al salir', async () => {
  const source = await leerModal();
  // El bug: el input mostraba el valor YA redondeado y lo recalculaba en cada
  // tecla, asi que escribir "2000" quedaba en "000" y "1000" en "10100010".
  assert.doesNotMatch(source, /value=\{displayPrice\}/, 'el input no puede mostrar el valor redondeado mientras escribis');
  assert.doesNotMatch(source, /value=\{displayCost\}/);
  assert.match(source, /value=\{priceText\}/);
  assert.match(source, /value=\{costText\}/);
  assert.match(source, /onBlur=\{\(e\) => commitPrice\(e\.target\.value\)\}/);
  assert.match(source, /onBlur=\{\(e\) => commitCost\(e\.target\.value\)\}/);
});

test('al guardar se toma lo tipeado aunque no hayas salido del campo', async () => {
  const source = await leerModal();
  assert.match(source, /price: getStoredProductSalePrice\(normalizeFinalSalePrice\(priceText\), productType\)/);
  assert.match(source, /normalizeFinalPurchaseCost\(costText\)/);
});

test('el alta de producto ya usaba el criterio correcto y sigue igual', async () => {
  const source = await leerModal();
  assert.match(source, /onChange=\{\(e\) => setNewItem\(\{ \.\.\.newItem, price: e\.target\.value \}\)\}/);
});
