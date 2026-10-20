import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessSecureSession,
  decideSecureCloudWrite,
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

test('una interrupción temporal espera sin cerrar la sesión; una identidad ausente pide ingreso', () => {
  assert.equal(decideSecureCloudWrite({
    assessment: assessSecureSession({ error: new Error('Failed to fetch') }),
  }), 'wait');
  assert.equal(decideSecureCloudWrite({
    assessment: assessSecureSession({ session: { access_token: 'token', user: { id: 'u1' } } }),
    offline: true,
  }), 'wait');
  assert.equal(decideSecureCloudWrite({
    assessment: assessSecureSession({ session: null }),
  }), 'reauth');
  assert.equal(decideSecureCloudWrite({
    assessment: assessSecureSession({
      session: { access_token: 'token', user: { id: 'u2' } },
      expectedAuthUserId: 'u1',
    }),
  }), 'reauth');
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

test('cobrar exige sesion de Supabase Auth y conserva el carrito ante un rechazo', () => {
  assert.equal(contiene('SecureSessionReauthPanel'), false, 'volvio el panel que pide la clave');
  assert.equal(contiene('handleSecureSessionReauthentication'), false, 'volvio el handler de reautenticacion');
  assert.equal(contiene('pendingSecureCheckoutRef'), false, 'volvio la venta en espera');
  assert.equal(contiene('Sesion de venta no disponible'), false, 'volvio el cartel sin salida');

  assert.equal(
    contiene('if (!(await requireSecureSessionForCloudWrite())) {'),
    true,
    'el cobro debe esperar la comprobacion de sesion',
  );
  assert.equal(
    /clearAuthenticatedState\(\{\s*preserveCart:\s*true,/.test(appSource),
    true,
    'la sesion rechazada debe volver al ingreso sin vaciar el carrito',
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
