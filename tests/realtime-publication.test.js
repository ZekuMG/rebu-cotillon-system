import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPECTED_REALTIME_TABLES = [
  'agenda_contacts',
  'app_users',
  'cash_closures',
  'categories',
  'clients',
  'expenses',
  'logs',
  'offers',
  'products',
  'register_state',
  'rewards',
  'sales',
];

const readQuotedTables = (path) => Array.from(
  readFileSync(path, 'utf8').matchAll(/\('([a-z_]+)'\)|'([a-z_]+)'/g),
  (match) => match[1] || match[2],
)
  .filter((table) => EXPECTED_REALTIME_TABLES.includes(table))
  .filter((table, index, tables) => tables.indexOf(table) === index)
  .sort();

test('migracion y diagnostico cubren todas las tablas Realtime de Rebu', () => {
  const migrationTables = readQuotedTables('supabase/migrations/20260728_realtime_publication.sql');
  const diagnosticTables = readQuotedTables('supabase/diagnostics/verify_realtime_publication.sql');

  assert.deepEqual(migrationTables, EXPECTED_REALTIME_TABLES);
  assert.deepEqual(diagnosticTables, EXPECTED_REALTIME_TABLES);
});
