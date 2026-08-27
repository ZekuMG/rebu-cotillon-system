import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

test('el payload de venta usa el nombre SQL points_spent', () => {
  const checkoutStart = appSource.indexOf('const pointsEarned = Math.floor(total / 500)');
  const checkoutPayloadEnd = appSource.indexOf('const buildItemsPayload', checkoutStart);
  const checkoutPayload = appSource.slice(checkoutStart, checkoutPayloadEnd);

  assert.notEqual(checkoutStart, -1);
  assert.notEqual(checkoutPayloadEnd, -1);
  assert.match(checkoutPayload, /points_spent:\s*pointsSpent/);
  assert.doesNotMatch(checkoutPayload, /^\s*pointsSpent:\s*pointsSpent,\s*$/m);
});
