import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessSecureSession,
  getExpectedAuthUserId,
  SECURE_SESSION_STATUS,
} from '../src/utils/secureSession.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('accepts an authenticated session that belongs to the active Rebu user', () => {
  const result = assessSecureSession({
    session: { access_token: 'token', user: { id: 'auth-user-1' } },
    expectedAuthUserId: 'auth-user-1',
  });

  assert.equal(result.status, SECURE_SESSION_STATUS.ACTIVE);
  assert.equal(result.isUsable, true);
});

test('rejects missing and mismatched secure sessions', () => {
  assert.equal(
    assessSecureSession({ session: null }).status,
    SECURE_SESSION_STATUS.MISSING,
  );
  assert.equal(
    assessSecureSession({
      session: { access_token: 'token', user: { id: 'other-user' } },
      expectedAuthUserId: 'expected-user',
    }).status,
    SECURE_SESSION_STATUS.MISMATCH,
  );
});

test('uses remembered Supabase auth metadata when the public user lacks auth fields', () => {
  assert.equal(
    getExpectedAuthUserId(
      { id: 'rebu-user-1' },
      { supabaseAuth: { authUserId: 'auth-user-1' } },
    ),
    'auth-user-1',
  );
});

test('session synchronization is event-driven and does not poll', () => {
  assert.match(appSource, /supabase\.auth\.onAuthStateChange/);
  assert.match(appSource, /visibilitychange/);
  assert.match(appSource, /checkSecureSession\(\{ source: 'checkout' \}\)/);
  assert.match(appSource, /supabase\.auth\.refreshSession\(\)/);
  assert.match(appSource, /recoverSecureSessionForCheckout\(\)/);

  const secureSessionStart = appSource.indexOf('const checkSecureSession = useCallback');
  const actorContextStart = appSource.indexOf('const getActorContext', secureSessionStart);
  const secureSessionSource = appSource.slice(secureSessionStart, actorContextStart);
  assert.doesNotMatch(secureSessionSource, /setInterval/);
});

// Estas afirmaciones miran el TEXTO FUENTE de App.jsx. Se usa ok(includes(...))
// en vez de match(regex) a proposito: ante un fallo, assert.match vuelca las
// 685 KB del archivo entero a la consola.
const contiene = (aguja) => appSource.includes(aguja);

test('cobrar no depende de la sesion de Supabase Auth', () => {
  // La migracion 20260826220000 le dio las RPC transaccionales a `anon`, asi que
  // el cobro dejo de tener puerta: ni pide la clave ni se traba.
  assert.equal(contiene('SecureSessionReauthPanel'), false, 'volvio el panel que pide la clave');
  assert.equal(contiene('handleSecureSessionReauthentication'), false, 'volvio el handler de reautenticacion');
  assert.equal(contiene('pendingSecureCheckoutRef'), false, 'volvio la venta en espera');
  assert.equal(contiene('Sesion de venta no disponible'), false, 'volvio el cartel sin salida');

  // La renovacion se dispara sin await: la venta no espera por ella.
  // El .catch es obligatorio: DebugAppShell reemplaza la app entera ante una
  // promesa rechazada, y se llevaria puesto el carrito en curso.
  assert.equal(
    contiene('void recoverSecureSessionForCheckout().catch(() => {});'),
    true,
    'el cobro deberia refrescar la sesion sin bloquear y sin poder rechazar',
  );
  assert.equal(
    contiene('const secureSession = await recoverSecureSessionForCheckout();'),
    false,
    'el cobro volvio a esperar por la sesion',
  );
});

test('el rechazo por desfase de reloj entre servidores de Supabase se reintenta', () => {
  // PostgREST valida el iat contra su reloj y el token lo emitio GoTrue: son
  // servidores distintos. Se corrige solo, no hay que molestar al vendedor.
  assert.equal(contiene('retryOnSupabaseClockSkew'), true);
});

test('el error crudo del cobro queda registrado para poder diagnosticarlo', () => {
  assert.equal(contiene("recordDiagnosticError('checkout'"), true);
  assert.equal(contiene("recordDiagnosticError('auth:refresh'"), true);
});
