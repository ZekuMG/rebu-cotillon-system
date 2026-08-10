import test from 'node:test';
import assert from 'node:assert/strict';

import { parseExcelMoney } from '../src/utils/excelImportNumbers.js';

test('interpreta importes enteros con separadores de miles', () => {
  assert.equal(parseExcelMoney('1.800'), 1800);
  assert.equal(parseExcelMoney('1,800'), 1800);
  assert.equal(parseExcelMoney('$ 12.345'), 12345);
  assert.equal(parseExcelMoney('$\u00a012,345'), 12345);
});

test('interpreta importes con decimales argentinos y estadounidenses', () => {
  assert.equal(parseExcelMoney('1.800,50'), 1800.5);
  assert.equal(parseExcelMoney('1,800.50'), 1800.5);
  assert.equal(parseExcelMoney('1800,5'), 1800.5);
  assert.equal(parseExcelMoney('1800.5'), 1800.5);
});

test('conserva numeros validos y rechaza valores no numericos', () => {
  assert.equal(parseExcelMoney(1800), 1800);
  assert.equal(parseExcelMoney(-1800), -1800);
  assert.equal(parseExcelMoney(''), 0);
  assert.equal(parseExcelMoney('importe invalido'), 0);
  assert.equal(parseExcelMoney(Number.NaN), 0);
});
