import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getProductImageStorageErrorMessage } from '../src/utils/productImageStorageErrors.js';

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260822110000_product_images_authenticated_storage.sql', import.meta.url),
  'utf8',
);
const bulkEditorSource = readFileSync(
  new URL('../src/views/BulkEditorView.jsx', import.meta.url),
  'utf8',
);

test('product image storage mutations require an active authenticated Rebu user', () => {
  assert.match(migrationSource, /private\.is_active_rebu_storage_user\(\)/);
  assert.match(migrationSource, /app_user\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migrationSource, /app_user\.is_active = true/);
  assert.match(migrationSource, /for insert\s+to authenticated/i);
  assert.match(migrationSource, /for update\s+to authenticated/i);
  assert.match(migrationSource, /for delete\s+to authenticated/i);
});

test('product image storage only accepts app-owned upload folders', () => {
  assert.match(
    migrationSource,
    /storage\.foldername\(name\)\)\[1\] = any \(array\['products', 'avatars'\]\)/,
  );
});

test('legacy anonymous mutation policies are removed without removing public reads', () => {
  assert.match(migrationSource, /drop policy if exists "Allow uploads 16wiy3a_0"/);
  assert.match(migrationSource, /drop policy if exists "Allow delete 16wiy3a_0"/);
  assert.doesNotMatch(migrationSource, /drop policy if exists "Allow public read 16wiy3a_0"/);
});

test('storage RLS errors are translated into an actionable message', () => {
  const message = getProductImageStorageErrorMessage(
    new Error('new row violates row-level security policy'),
  );

  assert.match(message, /sesion de Rebu/i);
  assert.match(message, /Cerra sesion/i);
  assert.doesNotMatch(message, /row-level security/i);
});

test('a failed apply preserves the selected photo and exposes a visible retry', () => {
  assert.match(bulkEditorSource, /status: row\.imageDataUrl \? 'apply_error' : 'error'/);
  assert.match(bulkEditorSource, /approved: Boolean\(row\.imageDataUrl\)/);
  assert.match(bulkEditorSource, /Las fotos elegidas quedaron listas para reintentar/);
  assert.match(bulkEditorSource, /\['found', 'apply_error'\]\.includes\(row\.status\)/);
});
