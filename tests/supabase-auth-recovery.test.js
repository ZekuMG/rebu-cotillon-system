import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPersistedSupabaseJwtError,
  isSupabaseClockSkewError,
  retryOnSupabaseClockSkew,
  runWithSupabaseAuthRecovery,
} from '../src/utils/supabaseAuthRecovery.js';

test('recognizes a persisted JWT whose issue time is in the future', () => {
  assert.equal(
    isPersistedSupabaseJwtError({ message: 'JWT issued at future' }),
    true,
  );
  assert.equal(
    isPersistedSupabaseJwtError({ message: 'Contraseña incorrecta' }),
    false,
  );
});

test('clears only the local Supabase session and retries once', async () => {
  const calls = [];
  let attempts = 0;

  const result = await runWithSupabaseAuthRecovery({
    operation: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('JWT issued at future');
      return 'verified';
    },
    clearSession: async (options) => {
      calls.push(options);
      return { error: null };
    },
  });

  assert.equal(result, 'verified');
  assert.equal(attempts, 2);
  assert.deepEqual(calls, [{ scope: 'local' }]);
});

test('does not clear or retry for an unrelated login error', async () => {
  const expected = new Error('Contraseña incorrecta');
  let clearCalls = 0;

  await assert.rejects(
    runWithSupabaseAuthRecovery({
      operation: async () => {
        throw expected;
      },
      clearSession: async () => {
        clearCalls += 1;
      },
    }),
    (error) => error === expected,
  );

  assert.equal(clearCalls, 0);
});

test('reconoce el desfase de reloj entre los servidores de Supabase', () => {
  // Es el unico texto que produce ese rechazo: PostgREST valida el iat contra su
  // reloj, y el token lo emitio GoTrue, que es otro servidor.
  assert.equal(
    isSupabaseClockSkewError({ message: 'JWSError JWTIssuedAtFuture' }),
    true,
  );
  assert.equal(isSupabaseClockSkewError({ message: 'JWT expired' }), false);
  assert.equal(isSupabaseClockSkewError(null), false);
});

test('la venta reintenta una sola vez cuando el token figura emitido en el futuro', async () => {
  const intentos = [];
  const esperas = [];
  const resultado = await retryOnSupabaseClockSkew(
    async () => {
      intentos.push(Date.now());
      return intentos.length === 1
        ? { data: null, error: { message: 'JWSError JWTIssuedAtFuture' } }
        : { data: { id: 42 }, error: null };
    },
    { waitMs: 1200, wait: async (ms) => { esperas.push(ms); } },
  );

  assert.equal(intentos.length, 2);
  assert.deepEqual(esperas, [1200]);
  assert.deepEqual(resultado.data, { id: 42 });
});

test('no reintenta ante errores que no son de desfase', async () => {
  let intentos = 0;
  const resultado = await retryOnSupabaseClockSkew(async () => {
    intentos += 1;
    return { data: null, error: { message: 'permission denied', code: '42501' } };
  });

  assert.equal(intentos, 1);
  assert.equal(resultado.error.code, '42501');
});
