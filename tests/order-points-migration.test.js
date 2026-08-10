import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260810_incremental_order_member_points.sql', import.meta.url),
  'utf8',
);

test('la migraciÃ³n no instala el trigger genÃ©rico auditado como inseguro', () => {
  assert.doesNotMatch(migration, /create\s+trigger\s+sync_order_member_points_trigger/i);
  assert.match(migration, /drop\s+trigger\s+if\s+exists\s+sync_order_member_points_trigger/i);
});

test('expone solamente RPC autenticadas para pedidos, ventas y ajustes', () => {
  for (const rpc of [
    'save_order_with_points_once',
    'register_order_sale_once',
    'adjust_member_points_once',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[^;]+from public, anon`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]+to authenticated`, 'i'));
  }
});

test('enlaza una sola venta por pedido y conserva el origen de los puntos', () => {
  assert.match(migration, /create unique index[^;]+sales_order_id_unique_idx/is);
  assert.match(migration, /points_source\s*=\s*'order'/i);
  assert.match(migration, /points_earned\s*=\s*0/i);
});

test('rechaza concurrencia obsoleta e impide saldos negativos', () => {
  assert.match(migration, /old_order\.version\s*<>\s*p_expected_version/i);
  assert.match(migration, /next_balance\s*<\s*0/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});
