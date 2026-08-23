import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(
  new URL('../src/App.jsx', import.meta.url),
  'utf8',
);

test('checkout does not block the POS with a full-screen secure-session warning', () => {
  assert.doesNotMatch(appSource, /Swal\.fire\(\s*['"]Sesion segura requerida['"]/);
});

test('checkout falls back to the compatible save when the authenticated RPC session is unavailable', () => {
  const registerSaleStart = appSource.indexOf('const registerSaleTransactionCloud = async');
  const registerSaleEnd = appSource.indexOf('const editSaleTransactionCloud = async', registerSaleStart);
  const registerSaleSource = appSource.slice(registerSaleStart, registerSaleEnd);

  assert.ok(registerSaleStart >= 0 && registerSaleEnd > registerSaleStart);
  assert.match(
    registerSaleSource,
    /if \(!\(await canUseAuthenticatedTransactionRpcs\(\)\)\) \{\s*console\.warn\([\s\S]*?return null;\s*\}/,
  );
});
