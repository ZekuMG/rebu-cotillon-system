import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessSecureSession,
  getExpectedAuthUserId,
  SECURE_SESSION_STATUS,
} from '../src/utils/secureSession.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const reauthPanelSource = readFileSync(
  new URL('../src/components/SecureSessionReauthPanel.jsx', import.meta.url),
  'utf8',
);

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

  const secureSessionStart = appSource.indexOf('const checkSecureSession = useCallback');
  const actorContextStart = appSource.indexOf('const getActorContext', secureSessionStart);
  const secureSessionSource = appSource.slice(secureSessionStart, actorContextStart);
  assert.doesNotMatch(secureSessionSource, /setInterval/);
});

test('reauthentication stays compact instead of covering the POS', () => {
  assert.match(reauthPanelSource, /fixed bottom-4 right-4/);
  assert.doesNotMatch(reauthPanelSource, /fixed inset-0/);
  assert.match(reauthPanelSource, /El carrito queda guardado/);
});
