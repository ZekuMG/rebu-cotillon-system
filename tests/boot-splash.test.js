import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldReportBlankScreen,
  BLANK_SCREEN_TIMEOUT_MS,
} from '../src/utils/bootSplash.js';

test('si la app ya está lista no se reporta nada', () => {
  assert.equal(
    shouldReportBlankScreen({
      appReady: true,
      crashed: false,
      elapsedMs: BLANK_SCREEN_TIMEOUT_MS * 10,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    false,
  );
});

test('si ya hubo un crash no se reporta de nuevo', () => {
  // El crash real ya se mostró con su stack; pisarlo con "pantalla blanca"
  // borraría la única pista útil.
  assert.equal(
    shouldReportBlankScreen({
      appReady: false,
      crashed: true,
      elapsedMs: BLANK_SCREEN_TIMEOUT_MS + 1,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    false,
  );
});

test('reporta cuando la app no está lista y ya pasó el tiempo', () => {
  assert.equal(
    shouldReportBlankScreen({
      appReady: false,
      crashed: false,
      elapsedMs: BLANK_SCREEN_TIMEOUT_MS,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    true,
  );
  assert.equal(
    shouldReportBlankScreen({
      appReady: false,
      crashed: false,
      elapsedMs: BLANK_SCREEN_TIMEOUT_MS + 500,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    true,
  );
});

test('no reporta si todavía no se cumplió el tiempo', () => {
  assert.equal(
    shouldReportBlankScreen({
      appReady: false,
      crashed: false,
      elapsedMs: BLANK_SCREEN_TIMEOUT_MS - 1,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    false,
  );
  assert.equal(
    shouldReportBlankScreen({
      appReady: false,
      crashed: false,
      elapsedMs: 0,
      timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
    }),
    false,
  );
});

test('con valores inválidos no se reporta: ante la duda, no molestar', () => {
  const base = { appReady: false, crashed: false, timeoutMs: BLANK_SCREEN_TIMEOUT_MS };

  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: null }), false);
  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: undefined }), false);
  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: NaN }), false);
  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: Infinity }), false);
  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: 'un rato largo' }), false);
  assert.equal(shouldReportBlankScreen({ ...base, elapsedMs: -100 }), false);

  const conTiempo = { appReady: false, crashed: false, elapsedMs: 999999 };
  assert.equal(shouldReportBlankScreen({ ...conTiempo, timeoutMs: null }), false);
  assert.equal(shouldReportBlankScreen({ ...conTiempo, timeoutMs: NaN }), false);
  assert.equal(shouldReportBlankScreen({ ...conTiempo, timeoutMs: 'ocho segundos' }), false);
  assert.equal(shouldReportBlankScreen({ ...conTiempo, timeoutMs: 0 }), false);
  assert.equal(shouldReportBlankScreen({ ...conTiempo, timeoutMs: -1 }), false);

  assert.equal(shouldReportBlankScreen({}), false);
  assert.equal(shouldReportBlankScreen(), false);
});

test('el umbral que se exporta es el que usa el detector', () => {
  assert.equal(BLANK_SCREEN_TIMEOUT_MS, 8000);
});
