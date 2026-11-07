import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leerModal = () => readFile(
  new URL('../src/components/modals/ProductModals.jsx', import.meta.url),
  'utf8',
);

test('el precio se escribe sin redondeo automatico y el costo conserva su regla', async () => {
  const source = await leerModal();
  assert.doesNotMatch(source, /value=\{displayPrice\}/);
  assert.doesNotMatch(source, /value=\{displayCost\}/);
  assert.match(source, /value=\{priceText\}/);
  assert.match(source, /value=\{costText\}/);
  assert.match(source, /onBlur=\{\(e\) => commitPrice\(e\.target\.value\)\}/);
  assert.match(source, /onBlur=\{\(e\) => commitCost\(e\.target\.value\)\}/);
  assert.match(source, /Te recomendamos usar este precio:/);
  assert.match(source, /<SalePriceSuggestion value=\{priceText\}/);
  assert.doesNotMatch(source, /price: getStoredProductSalePrice\(normalizeFinalSalePrice\(priceText\)/);
});

test('al guardar se toma lo tipeado aunque no hayas salido del campo', async () => {
  const source = await leerModal();
  assert.match(source, /price: getStoredProductSalePrice\(priceText, productType\)/);
  assert.match(source, /normalizeFinalPurchaseCost\(costText\)/);
});

test('el alta de producto tambien ofrece la sugerencia sin cambiar el precio', async () => {
  const source = await leerModal();
  assert.match(source, /onChange=\{\(e\) => setNewItem\(\{ \.\.\.newItem, price: e\.target\.value \}\)\}/);
  assert.match(source, /<SalePriceSuggestion value=\{newItem\.price\}/);
  assert.doesNotMatch(source, /onBlur=\{\(e\) => setNewItem\(\{ \.\.\.newItem, price: String\(normalizeFinalSalePrice/);
});
