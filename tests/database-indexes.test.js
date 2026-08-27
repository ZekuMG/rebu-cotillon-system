import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPECTED_INDEXES = [
  'sales_created_at_id_idx',
  'logs_created_at_id_idx',
  'logs_action_created_at_id_idx',
  'logs_user_id_created_at_id_idx',
  'expenses_created_at_id_idx',
  'cash_closures_created_at_id_idx',
];

test('la migracion de rendimiento solo agrega los indices de lectura esperados', () => {
  const sql = readFileSync('supabase/migrations/20260803_read_path_indexes.sql', 'utf8');

  EXPECTED_INDEXES.forEach((indexName) => {
    assert.match(sql, new RegExp(`create index if not exists ${indexName}\\b`, 'i'));
  });
  assert.doesNotMatch(sql, /^\s*(update|delete|truncate|drop)\b/im);
});

test('la sincronizacion incremental de productos tiene un indice compatible y aditivo', () => {
  const sql = readFileSync(
    'supabase/migrations/20260826021015_products_incremental_sync_index.sql',
    'utf8',
  );

  assert.match(
    sql,
    /create index if not exists products_updated_at_id_idx\s+on public\.products \(updated_at, id\)/i,
  );
  assert.doesNotMatch(sql, /^\s*(update|delete|truncate|drop)\b/im);
});
