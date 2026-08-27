import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSupabaseErrorDiagnostic,
  getSupabaseDiagnosticMessage,
} from '../src/utils/supabaseErrorDiagnostics.js';

test('identifies a JWT issued in the future with an actionable code', () => {
  const result = getSupabaseErrorDiagnostic({ message: 'JWT issued at future' });

  assert.equal(result.code, 'AUTH-JWT-FUTURE');
  assert.match(result.message, /hora.*Windows/i);
  assert.match(result.message, /\[AUTH-JWT-FUTURE\]$/);
});

test('distinguishes expired, refresh and malformed session failures', () => {
  assert.equal(
    getSupabaseErrorDiagnostic({ message: 'JWT expired' }).code,
    'AUTH-JWT-EXPIRED',
  );
  assert.equal(
    getSupabaseErrorDiagnostic({ code: 'refresh_token_not_found' }).code,
    'AUTH-REFRESH-INVALID',
  );
  assert.equal(
    getSupabaseErrorDiagnostic({ code: 'bad_jwt' }).code,
    'AUTH-JWT-INVALID',
  );
});

test('uses Supabase machine-readable codes for credentials and permissions', () => {
  assert.equal(
    getSupabaseErrorDiagnostic({ code: 'invalid_credentials' }).code,
    'AUTH-CREDENTIALS-MISMATCH',
  );
  assert.equal(
    getSupabaseErrorDiagnostic({ code: '42501' }).code,
    'DB-PERMISSION-DENIED',
  );
});

test('does not relabel unrelated application errors', () => {
  assert.equal(getSupabaseErrorDiagnostic({ message: 'Producto inexistente' }), null);
  assert.equal(getSupabaseDiagnosticMessage(null), '');
});
