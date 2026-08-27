import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

test('el cliente no abre ni renueva una sesion JWT cuando Auth esta apagado', () => {
  const source = readSource('src/supabase/client.js');
  assert.match(source, /autoRefreshToken:\s*enableAuthSession/);
  assert.match(source, /persistSession:\s*persistAuthenticatedSession/);
  assert.match(source, /if \(!persistAuthenticatedSession && typeof window !== 'undefined'\)/);
  assert.match(source, /window\.localStorage\.removeItem\(key\)/);
});

test('el login solo abre Supabase Auth si se pide para la bandeja de WhatsApp', () => {
  const source = readSource('src/App.jsx');
  assert.match(
    source,
    /if \(!offline && authMode === 'supabase' && ENABLE_LOGIN_AUTH_SESSION\)/,
  );
  assert.ok(source.includes("signOut({ scope: 'local' })"));
});

test('WhatsApp comparte la sesion autenticada solo cuando el modo seguro esta habilitado', () => {
  const source = readSource('src/utils/whatsappOperator.js');
  assert.match(source, /VITE_REBU_WHATSAPP_AUTH_SESSION/);
  assert.match(source, /if \(ENABLE_AUTHENTICATED_OPERATOR_SESSION\)/);
  assert.match(source, /VITE_SUPABASE_ANON_KEY/);
});

test('el cliente Supabase engancha la red de seguridad de sesion', () => {
  // El COMPORTAMIENTO se prueba en tests/session-self-heal.test.js, con fetch
  // inyectado. Aca solo se verifica el cableado, que es lo unico que no se
  // puede probar sin levantar el modulo con import.meta.env.
  const source = readSource('src/supabase/client.js');
  assert.match(source, /crearFetchAutoreparable/);
  assert.match(source, /fetch: fetchConSesionAutoreparable/);
  assert.ok(source.includes("signOut({ scope: 'local' })"));
});
