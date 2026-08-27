import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);

test('cada migracion tiene una version unica para que Supabase pueda registrarla', async () => {
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const versions = migrationFiles.map((name) => name.split('_', 1)[0]);
  const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);

  assert.deepEqual(duplicates, []);
  assert.ok(migrationFiles.includes('20260728000000_realtime_publication.sql'));
  assert.ok(migrationFiles.includes('20260728010000_whatsapp_permission_hardening.sql'));
  assert.ok(migrationFiles.includes('20260826220000_venta_sin_sesion_auth.sql'));
  assert.ok(migrationFiles.includes('20260826230000_caja_sin_jwt.sql'));
  assert.ok(migrationFiles.includes('20260826234500_endurecer_venta_sin_jwt.sql'));
  assert.ok(migrationFiles.includes('20260827000000_permisos_desde_la_app.sql'));
  assert.ok(migrationFiles.includes('20260827010000_correcciones_auditoria.sql'));
  assert.ok(migrationFiles.includes('20260827020000_anon_sin_limitantes.sql'));
  assert.ok(migrationFiles.includes('20260827030000_venta_idempotente.sql'));
  assert.ok(migrationFiles.includes('20260827040000_endurecer_anon_v132.sql'));
});

test('la version 1.2.32 conserva ventas anon idempotentes sin exponer implementaciones internas', async () => {
  const idempotencyMigration = await readFile(
    new URL('../supabase/migrations/20260827030000_venta_idempotente.sql', import.meta.url),
    'utf8',
  );
  const hardeningMigration = await readFile(
    new URL('../supabase/migrations/20260827040000_endurecer_anon_v132.sql', import.meta.url),
    'utf8',
  );

  assert.match(idempotencyMigration, /p_operation_key text default null/i);
  assert.match(idempotencyMigration, /pg_advisory_xact_lock\(hashtext\(clave\)\)/i);
  assert.match(idempotencyMigration, /grant execute[\s\S]+register_sale_transaction[\s\S]+to anon/i);

  for (const internalFunction of [
    'register_sale_transaction_unchecked_20260710',
    'edit_sale_transaction_unchecked_20260710',
    'void_sale_transaction_unchecked_20260710',
    'apply_product_stock_delta_unchecked_20260710',
  ]) {
    assert.match(
      hardeningMigration,
      new RegExp(`revoke execute on function public\\.${internalFunction}[\\s\\S]+from public, anon, authenticated, service_role`, 'i'),
    );
  }

  assert.match(hardeningMigration, /alter default privileges[\s\S]+revoke execute on functions from public, anon/i);
  assert.match(hardeningMigration, /grant execute[\s\S]+register_sale_transaction[\s\S]+to anon, authenticated, service_role/i);
});

test('la reconciliacion protege ventas sin degradar el actor autenticado actual', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260825091150_reconcile_historical_sales_and_indexes.sql', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(migration, /create or replace function private\.current_rebu_transaction_actor/);
  assert.match(migration, /rename to register_sale_transaction_unchecked_20260710/);
  assert.match(migration, /perform private\.current_rebu_transaction_actor\(\)/);
  assert.match(migration, /perform private\.lock_expected_client_points/);
  assert.match(migration, /revoke all on function public\.register_sale_transaction_unchecked_20260710[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.register_sale_transaction[\s\S]+to authenticated/i);
  assert.match(migration, /set search_path = ''/);
});

test('la reconciliacion incluye todos los indices historicos de lectura', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260825091150_reconcile_historical_sales_and_indexes.sql', import.meta.url),
    'utf8',
  );

  for (const indexName of [
    'sales_created_at_id_idx',
    'logs_created_at_id_idx',
    'logs_action_created_at_id_idx',
    'logs_user_id_created_at_id_idx',
    'expenses_created_at_id_idx',
    'cash_closures_created_at_id_idx',
  ]) {
    assert.match(migration, new RegExp(`create index if not exists ${indexName}`));
  }
});

test('el backfill de productos conserva el estado del catalogo y alinea fingerprints', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260825093118_backfill_product_updated_at.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /set updated_at = coalesce\(created_at, now\(\)\)/);
  assert.match(migration, /alter column updated_at set default now\(\)/);
  assert.match(migration, /alter column updated_at set not null/);
  assert.match(migration, /disable trigger trg_web_catalog_source_updated/);
  assert.match(migration, /enable trigger trg_web_catalog_source_updated/);
  assert.match(migration, /source_fingerprint = private\.web_catalog_source_fingerprint\(product\)/);
  assert.doesNotMatch(migration, /set\s+status\s*=/i);
  assert.doesNotMatch(migration, /set\s+requires_review\s*=/i);
});

test('el RPC de vinculo Auth califica auth_email y usa search_path seguro', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260825093920_fix_auth_link_ambiguity.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /target_user\.auth_email::text/);
  assert.doesNotMatch(migration, /coalesce\(current_auth_email::citext, auth_email\)/);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]+to authenticated/i);
});
