import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AL_FONDO_TOLERANCIA_PX,
  REINTENTOS_MAX,
  debeReintentar,
  estaAlFondo,
} from '../src/utils/stickToLatest.js';

test('reconoce cuando ya esta abajo de todo', () => {
  assert.equal(estaAlFondo({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 }), true);
  assert.equal(
    estaAlFondo({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - AL_FONDO_TOLERANCIA_PX }),
    true,
    'tolera el redondeo del navegador',
  );
  assert.equal(estaAlFondo({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 }), false);
});

test('si el contenido entra entero se considera abajo', () => {
  assert.equal(estaAlFondo({ scrollHeight: 300, clientHeight: 400, scrollTop: 0 }), true);
  assert.equal(estaAlFondo({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 }), true);
});

test('medidas invalidas no cuentan como abajo', () => {
  assert.equal(estaAlFondo({}), false);
  assert.equal(estaAlFondo({ scrollHeight: NaN, clientHeight: 10, scrollTop: 0 }), false);
  assert.equal(estaAlFondo(), false);
});

test('reintenta mientras no haya llegado', () => {
  const arriba = { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 };
  assert.equal(debeReintentar({ metricas: arriba, intentos: 0 }), true);
  assert.equal(debeReintentar({ metricas: arriba, intentos: REINTENTOS_MAX - 1 }), true);
});

test('deja de reintentar al llegar abajo', () => {
  const abajo = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 };
  assert.equal(debeReintentar({ metricas: abajo, intentos: 0 }), false);
});

test('nunca le pelea el scroll al usuario', () => {
  const arriba = { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 };
  assert.equal(debeReintentar({ metricas: arriba, intentos: 1, usuarioTomoControl: true }), false);
  assert.equal(debeReintentar({ metricas: arriba, intentos: 1, cancelado: true }), false);
});

test('se rinde tras el tope de intentos', () => {
  const arriba = { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 };
  assert.equal(debeReintentar({ metricas: arriba, intentos: REINTENTOS_MAX }), false);
  assert.equal(debeReintentar({ metricas: arriba, intentos: REINTENTOS_MAX + 5 }), false);
});
