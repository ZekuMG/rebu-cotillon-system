import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  crearFetchAutoreparable,
  describirRechazo,
  esErrorDeDesfaseDeReloj,
  esLecturaPublica,
  esPedidoDeAuth,
  esRenovacionAuth,
} from '../src/supabase/sessionSelfHeal.js';

const ANON = 'anon-key';
const TOKEN = 'token-de-sesion';
const TOKEN_NUEVO = 'token-renovado';

const respuesta401 = (cuerpo = { code: 'PGRST301', message: 'JWT cryptographic operation failed' }) =>
  new Response(JSON.stringify(cuerpo), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'sb-request-id': 'req-123',
      'www-authenticate': 'Bearer error="invalid_token"',
    },
  });

const respuestaOk = () => new Response('[]', { status: 200 });
const conToken = (metodo = 'GET') => ({
  method: metodo,
  headers: { Authorization: `Bearer ${TOKEN}`, apikey: ANON },
});

const armar = ({ respuestas, renovar = async () => null, extra = {} } = {}) => {
  const llamadas = [];
  const diagnosticos = [];
  const cola = [...respuestas];
  const envuelto = crearFetchAutoreparable({
    fetchOriginal: async (entrada, init) => {
      const headers = new Headers(init?.headers || {});
      llamadas.push({
        url: String(entrada),
        metodo: String(init?.method || 'GET').toUpperCase(),
        authorization: headers.get('Authorization'),
      });
      return cola.length > 1 ? cola.shift() : cola[0];
    },
    anonKey: ANON,
    renovarSesion: renovar,
    registrarDiagnostico: (detalle) => diagnosticos.push(detalle),
    ...extra,
  });
  return { envuelto, llamadas, diagnosticos };
};

test('una lectura pública 401 sigue disponible como anónima sin cerrar la sesión', async () => {
  const { envuelto, llamadas } = armar({ respuestas: [respuesta401(), respuestaOk()] });
  const respuesta = await envuelto('https://x.supabase.co/rest/v1/products', conToken());
  assert.equal(respuesta.status, 200);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].authorization, `Bearer ${ANON}`);
});

test('una lectura privada se reintenta con el JWT nuevo tras renovar', async () => {
  const { envuelto, llamadas } = armar({
    respuestas: [respuesta401(), respuestaOk()],
    renovar: async () => TOKEN_NUEVO,
  });
  const respuesta = await envuelto('https://x.supabase.co/rest/v1/sales', conToken());
  assert.equal(respuesta.status, 200);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].authorization, `Bearer ${TOKEN_NUEVO}`);
});

test('un error de red al renovar deja la lectura privada sin confirmar pero conserva el estado', async () => {
  let intentos = 0;
  const { envuelto, llamadas } = armar({
    respuestas: [respuesta401(), respuestaOk()],
    renovar: async () => { intentos += 1; throw new Error('Failed to fetch'); },
  });
  const respuesta = await envuelto('https://x.supabase.co/rest/v1/sales', conToken());
  assert.equal(respuesta.status, 401);
  assert.equal(llamadas.length, 1);
  assert.equal(intentos, 1);
});

test('una escritura nunca se repite automáticamente aunque se renueve el JWT', async () => {
  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const { envuelto, llamadas } = armar({
      respuestas: [respuesta401(), respuestaOk()],
      renovar: async () => TOKEN_NUEVO,
    });
    const respuesta = await envuelto(
      'https://x.supabase.co/rest/v1/rpc/register_sale_transaction', conToken(metodo),
    );
    assert.equal(respuesta.status, 401);
    assert.equal(llamadas.length, 1, `${metodo} no debe duplicarse`);
  }
});

test('los pedidos concurrentes comparten una sola renovación', async () => {
  let renovaciones = 0;
  const respuestas = Array.from({ length: 4 }, () => respuesta401());
  const { envuelto, llamadas } = armar({
    respuestas: [...respuestas, ...Array.from({ length: 4 }, () => respuestaOk())],
    renovar: async () => {
      renovaciones += 1;
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      return TOKEN_NUEVO;
    },
  });
  const resultados = await Promise.all(
    ['a', 'b', 'c', 'd'].map((n) => envuelto(`https://x.supabase.co/rest/v1/sales?id=${n}`, conToken())),
  );
  assert.deepEqual(resultados.map((r) => r.status), [200, 200, 200, 200]);
  assert.equal(renovaciones, 1);
  assert.equal(llamadas.length, 8);
});

test('no toca los endpoints de Auth ni los pedidos que ya eran anónimos', async () => {
  let renovaciones = 0;
  const { envuelto, llamadas } = armar({
    respuestas: [respuesta401(), respuestaOk()],
    renovar: async () => { renovaciones += 1; return TOKEN_NUEVO; },
  });
  assert.equal((await envuelto('https://x.supabase.co/auth/v1/token', conToken('POST'))).status, 401);
  assert.equal((await envuelto('https://x.supabase.co/rest/v1/products', {
    headers: { Authorization: `Bearer ${ANON}` },
  })).status, 200);
  assert.equal(renovaciones, 0);
  assert.equal(llamadas.length, 2);
});

test('un 500 o 429 temporal de renovación se clasifica como reintentable por Auth', async () => {
  for (const status of [500, 429]) {
    const { envuelto, diagnosticos } = armar({
      respuestas: [new Response('error temporal', { status })],
    });
    const respuesta = await envuelto(
      'https://x.supabase.co/auth/v1/token?grant_type=refresh_token',
      conToken('POST'),
    );
    assert.equal(respuesta.status, 503);
    assert.equal(diagnosticos[0].estado, status);
  }
  const { envuelto } = armar({ respuestas: [new Response('clave incorrecta', { status: 500 })] });
  assert.equal((await envuelto(
    'https://x.supabase.co/auth/v1/token?grant_type=password', conToken('POST'),
  )).status, 500);
  assert.equal(esRenovacionAuth('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST'), true);
  assert.equal(esRenovacionAuth('https://x.supabase.co/auth/v1/token?grant_type=password', 'POST'), false);
});

test('el desfase de reloj no renueva ni descarta la sesión', async () => {
  let renovaciones = 0;
  const { envuelto, llamadas } = armar({
    respuestas: [respuesta401({ code: 'PGRST301', message: 'JWSError JWTIssuedAtFuture' })],
    renovar: async () => { renovaciones += 1; return TOKEN_NUEVO; },
  });
  assert.equal((await envuelto('https://x.supabase.co/rest/v1/products', conToken())).status, 401);
  assert.equal(renovaciones, 0);
  assert.equal(llamadas.length, 1);
});

test('una renovación fallida limita reintentos repetidos durante el corte', async () => {
  let renovaciones = 0;
  const { envuelto } = armar({
    respuestas: [respuesta401()],
    renovar: async () => { renovaciones += 1; return null; },
    extra: { pausaTrasFalloMs: 1000 },
  });
  for (let i = 0; i < 3; i += 1) {
    await envuelto('https://x.supabase.co/rest/v1/sales', conToken());
  }
  assert.equal(renovaciones, 1);
});

test('una renovación que no responde no deja colgada la pantalla', async () => {
  const { envuelto } = armar({
    respuestas: [respuesta401()],
    renovar: () => new Promise(() => {}),
    extra: { esperaRenovacionMs: 30 },
  });
  assert.equal((await envuelto('https://x.supabase.co/rest/v1/sales', conToken())).status, 401);
});

test('el diagnóstico conserva el motivo del 401', async () => {
  const { envuelto, diagnosticos } = armar({ respuestas: [respuesta401()] });
  await envuelto('https://x.supabase.co/rest/v1/sales', conToken());
  assert.equal(diagnosticos.length, 1);
  assert.equal(diagnosticos[0].requestId, 'req-123');
  assert.equal(diagnosticos[0].code, 'PGRST301');
});

test('distingue rutas públicas, Auth y errores de reloj', async () => {
  assert.equal(esErrorDeDesfaseDeReloj('JWSError JWTIssuedAtFuture'), true);
  assert.equal(esErrorDeDesfaseDeReloj('JWT expired'), false);
  assert.equal(esPedidoDeAuth('https://x.supabase.co/auth/v1/user'), true);
  assert.equal(esPedidoDeAuth('https://x.supabase.co/rest/v1/products'), false);
  assert.equal(esLecturaPublica('https://x.supabase.co/rest/v1/products?select=id', 'GET'), true);
  assert.equal(esLecturaPublica('https://x.supabase.co/rest/v1/sales', 'GET'), false);
  assert.equal(esLecturaPublica('https://x.supabase.co/rest/v1/products', 'POST'), false);
  const original = respuesta401();
  await describirRechazo(original, { url: 'https://x/rest/v1/sales', metodo: 'GET' });
  assert.equal((await original.json()).code, 'PGRST301');
});

test('el cobro conserva la misma clave de operación si se reintenta', () => {
  const fuente = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(fuente.includes('p_operation_key: operationKey'));
  assert.ok(fuente.includes('checkoutOperationKeysRef'));
  assert.ok(fuente.includes('const existente = claves.get(checkoutPosCartId);'));
  assert.ok(fuente.includes('checkoutOperationKeysRef.current.delete(checkoutPosCartId);'));
});
