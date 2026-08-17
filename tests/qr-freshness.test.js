import assert from 'node:assert/strict';
import test from 'node:test';
import {
  qrFreshness,
  QR_WARN_SECONDS,
  QR_FORCE_SECONDS,
  QR_STALE_KEEP_SECONDS,
  shouldDropStaleQr,
} from '../src/utils/qrFreshness.js';

test('clasifica la frescura del QR por umbrales', () => {
  assert.equal(qrFreshness({ ageSeconds: 0 }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: QR_WARN_SECONDS - 1 }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: QR_WARN_SECONDS }).level, 'warn');
  assert.equal(qrFreshness({ ageSeconds: QR_FORCE_SECONDS - 1 }).level, 'warn');
  assert.equal(qrFreshness({ ageSeconds: QR_FORCE_SECONDS }).level, 'stale');
});

test('el texto dice los segundos y avisa cuando esta por vencer', () => {
  assert.match(qrFreshness({ ageSeconds: 3 }).label, /hace 3 s/);
  assert.match(qrFreshness({ ageSeconds: QR_WARN_SECONDS + 5 }).label, /por vencer/i);
  assert.match(qrFreshness({ ageSeconds: QR_FORCE_SECONDS + 10 }).label, /renovando/i);
});

test('una edad invalida se trata como recien generado', () => {
  assert.equal(qrFreshness({ ageSeconds: null }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: -5 }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: 'no es un numero' }).level, 'fresh');
  assert.equal(qrFreshness().level, 'fresh');
});

test('sólo hay que forzar una vez por codigo', () => {
  const fresh = qrFreshness({ ageSeconds: 1 });
  const stale = qrFreshness({ ageSeconds: QR_FORCE_SECONDS });
  assert.equal(fresh.shouldForce, false);
  assert.equal(stale.shouldForce, true);
});

test('un QR guardado se descarta recien pasado el limite', () => {
  assert.equal(shouldDropStaleQr({ ageSeconds: QR_STALE_KEEP_SECONDS - 1 }), false);
  assert.equal(shouldDropStaleQr({ ageSeconds: QR_STALE_KEEP_SECONDS }), true);
  // Sin dato de edad no se descarta: puede ser un hueco puntual de la respuesta.
  assert.equal(shouldDropStaleQr({ ageSeconds: null }), false);
  assert.equal(shouldDropStaleQr(), false);
});
