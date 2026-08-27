import assert from 'node:assert/strict';
import test from 'node:test';

import {
  crearFetchAutoreparable,
  describirRechazo,
  esErrorDeDesfaseDeReloj,
  esPedidoDeAuth,
} from '../src/supabase/sessionSelfHeal.js';

const ANON = 'anon-key';
const TOKEN = 'token-de-sesion';

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

const armar = ({ respuestas, descartar = async () => {}, extra = {} } = {}) => {
  const llamadas = [];
  const diagnosticos = [];
  const cola = [...respuestas];
  const fetchOriginal = async (entrada, init) => {
    llamadas.push({ url: String(entrada), metodo: String(init?.method || 'GET').toUpperCase() });
    return cola.length > 1 ? cola.shift() : cola[0];
  };
  const envuelto = crearFetchAutoreparable({
    fetchOriginal,
    anonKey: ANON,
    descartarSesion: descartar,
    registrarDiagnostico: (d) => diagnosticos.push(d),
    ...extra,
  });
  return { envuelto, llamadas, diagnosticos };
};

const conToken = (metodo = 'GET') => ({
  method: metodo,
  headers: { Authorization: `Bearer ${TOKEN}`, apikey: ANON },
});

test('una lectura rechazada se reintenta como anonima y devuelve 200', async () => {
  const { envuelto, llamadas } = armar({ respuestas: [respuesta401(), respuestaOk()] });

  const r = await envuelto('https://x.supabase.co/rest/v1/products', conToken('GET'));

  assert.equal(r.status, 200);
  assert.equal(llamadas.length, 2, 'deberia reintentar exactamente una vez');
});

test('NUNCA reintenta una escritura: una venta no se puede duplicar', async () => {
  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const { envuelto, llamadas } = armar({ respuestas: [respuesta401(), respuestaOk()] });

    const r = await envuelto('https://x.supabase.co/rest/v1/rpc/register_sale_transaction', conToken(metodo));

    assert.equal(llamadas.length, 1, `${metodo} no debe repetirse`);
    assert.equal(r.status, 401, `${metodo} debe devolver el error original`);
  }
});

test('la escritura igual descarta la sesion, para que el proximo pedido salga limpio', async () => {
  let descartes = 0;
  const { envuelto } = armar({
    respuestas: [respuesta401(), respuestaOk()],
    descartar: async () => { descartes += 1; },
  });

  await envuelto('https://x.supabase.co/rest/v1/sales', conToken('POST'));

  assert.equal(descartes, 1);
});

test('repara TODOS los pedidos concurrentes, no solo el primero', async () => {
  // Al abrir la app se disparan muchas consultas juntas. Con un booleano de
  // guardia se reparaba una sola y el resto llegaba rota a la pantalla.
  let descartes = 0;
  const cola = [respuesta401(), respuesta401(), respuesta401(), respuesta401()];
  const llamadas = [];
  const envuelto = crearFetchAutoreparable({
    fetchOriginal: async (entrada, init) => {
      llamadas.push(String(init?.headers?.get?.('Authorization') || init?.headers?.Authorization));
      return cola.shift() || respuestaOk();
    },
    anonKey: ANON,
    descartarSesion: async () => {
      descartes += 1;
      await new Promise((r) => { setTimeout(r, 5); });
    },
  });

  const resultados = await Promise.all(
    ['a', 'b', 'c', 'd'].map((n) => envuelto(`https://x.supabase.co/rest/v1/${n}`, conToken('GET'))),
  );

  assert.deepEqual(resultados.map((r) => r.status), [200, 200, 200, 200], 'los 4 deberian repararse');
  assert.equal(descartes, 1, 'la sesion se descarta una sola vez para los 4');
});

test('no toca los endpoints de Auth: ahi un 401 es legitimo', async () => {
  const { envuelto, llamadas } = armar({ respuestas: [respuesta401(), respuestaOk()] });

  const r = await envuelto('https://x.supabase.co/auth/v1/token?grant_type=password', conToken('POST'));

  assert.equal(llamadas.length, 1);
  assert.equal(r.status, 401);
});

test('si el pedido ya iba como anonimo, el 401 es real y se devuelve tal cual', async () => {
  const { envuelto, llamadas, diagnosticos } = armar({ respuestas: [respuesta401(), respuestaOk()] });

  const r = await envuelto('https://x.supabase.co/rest/v1/products', {
    method: 'GET',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
  });

  assert.equal(llamadas.length, 1);
  assert.equal(r.status, 401);
  assert.equal(diagnosticos.length, 0, 'no es un problema de sesion: no ensucia el diagnostico');
});

test('el desfase de reloj entre servidores no mata la sesion', async () => {
  // Se corrige solo en un segundo; de eso se ocupa retryOnSupabaseClockSkew.
  let descartes = 0;
  const { envuelto, llamadas } = armar({
    respuestas: [respuesta401({ code: 'PGRST301', message: 'JWSError JWTIssuedAtFuture' }), respuestaOk()],
    descartar: async () => { descartes += 1; },
  });

  const r = await envuelto('https://x.supabase.co/rest/v1/products', conToken('GET'));

  assert.equal(descartes, 0, 'no debe cerrar la sesion por un parpadeo de reloj');
  assert.equal(llamadas.length, 1);
  assert.equal(r.status, 401);
});

test('corta-corriente: deja de intentar si descartar la sesion falla siempre', async () => {
  let intentos = 0;
  const { envuelto } = armar({
    respuestas: [respuesta401()],
    descartar: async () => { intentos += 1; throw new Error('no se pudo'); },
    extra: { fallosTolerados: 2, esperaDescarteMs: 50 },
  });

  for (let i = 0; i < 6; i += 1) {
    await envuelto('https://x.supabase.co/rest/v1/products', conToken('GET'));
  }

  assert.equal(intentos, 2, 'despues de 2 fallos deja de insistir');
});

test('un descarte colgado no bloquea la caja para siempre', async () => {
  const { envuelto } = armar({
    respuestas: [respuesta401()],
    descartar: () => new Promise(() => {}),
    extra: { esperaDescarteMs: 30 },
  });

  const r = await envuelto('https://x.supabase.co/rest/v1/products', conToken('GET'));

  assert.equal(r.status, 401, 'devuelve el error en vez de quedarse esperando');
});

test('guarda el motivo del rechazo para poder encontrar la causa raiz', async () => {
  const { diagnosticos } = armar({ respuestas: [respuesta401(), respuestaOk()] });
  const { envuelto, diagnosticos: capturados } = armar({ respuestas: [respuesta401(), respuestaOk()] });
  assert.equal(diagnosticos.length, 0);

  await envuelto('https://x.supabase.co/rest/v1/products?select=id', conToken('GET'));

  assert.equal(capturados.length, 1);
  assert.equal(capturados[0].requestId, 'req-123', 'el sb-request-id es rastreable en el panel de Supabase');
  assert.equal(capturados[0].code, 'PGRST301');
  assert.equal(capturados[0].metodo, 'GET');
  assert.equal(capturados[0].url, '/rest/v1/products');
  assert.match(capturados[0].wwwAuthenticate, /invalid_token/);
});

test('reconoce los textos de desfase de reloj y descarta los que no lo son', () => {
  assert.equal(esErrorDeDesfaseDeReloj('JWSError JWTIssuedAtFuture'), true);
  assert.equal(esErrorDeDesfaseDeReloj('jwt issued at future'), true);
  assert.equal(esErrorDeDesfaseDeReloj('JWT expired'), false);
  assert.equal(esErrorDeDesfaseDeReloj(null), false);
});

test('distingue un endpoint de Auth por su ruta, no por substring', () => {
  assert.equal(esPedidoDeAuth('https://x.supabase.co/auth/v1/user'), true);
  assert.equal(esPedidoDeAuth('https://x.supabase.co/rest/v1/products'), false);
  // Un archivo de Storage con ese nombre no debe confundirse con Auth.
  assert.equal(esPedidoDeAuth('https://x.supabase.co/storage/v1/object/pub/auth/v1/logo.png'), false);
});

test('describirRechazo no consume la respuesta original', async () => {
  const r = respuesta401();
  await describirRechazo(r, { url: 'https://x/rest/v1/a', metodo: 'GET' });
  const cuerpo = await r.json();
  assert.equal(cuerpo.code, 'PGRST301');
});

// --- Idempotencia del cobro ------------------------------------------------
// Estas afirmaciones miran el texto fuente porque el cableado del cobro no se
// puede levantar sin Electron. El comportamiento de la base esta probado en
// supabase/migrations/20260827030000_venta_idempotente.sql (3 cobros con la
// misma clave = 1 venta, verificado contra produccion con rollback).
test('el cobro manda una clave de operacion y la reusa si se reintenta', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fuente = readFileSync(path.join(raiz, 'src/App.jsx'), 'utf8');

  // La clave viaja a la RPC.
  assert.ok(fuente.includes('p_operation_key: operationKey'));
  // Vive por carrito, no por intento: un reintento del mismo carrito la reusa.
  assert.ok(fuente.includes('checkoutOperationKeysRef'));
  assert.ok(fuente.includes('const existente = claves.get(checkoutPosCartId);'));
  // Y se libera recien cuando la venta entro de verdad.
  assert.ok(fuente.includes('checkoutOperationKeysRef.current.delete(checkoutPosCartId);'));
});
