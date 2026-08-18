import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const logsFeedSource = readFileSync('src/hooks/useLogsFeed.js', 'utf8');
const logsViewSource = readFileSync('src/views/LogsView.jsx', 'utf8');
const sessionsViewSource = readFileSync('src/views/SessionsView.jsx', 'utf8');
const searchMigration = readFileSync(
  'supabase/migrations/20260816_logs_summary_search.sql',
  'utf8',
);
const cleanupPreview = readFileSync(
  'database/logs_compaction_preview_2026_08_16.sql',
  'utf8',
);
const cleanupApply = readFileSync(
  'database/logs_compaction_apply_after_backup_not_autorun_2026_08_16.sql',
  'utf8',
);

test('la pagina normal de logs no vuelve a hidratar todos los detalles', () => {
  assert.match(logsFeedSource, /CLOUD_SELECTS\.logsSummary/);
  assert.match(logsFeedSource, /Details remain lazy/);
  assert.doesNotMatch(logsFeedSource, /const detailResult = await/);
  assert.match(logsViewSource, /includeDetails:\s*false/);
  assert.match(sessionsViewSource, /includeDetails:\s*true/);
  assert.match(logsViewSource, /\.eq\('id', log\.id\)[\s\S]*?\.maybeSingle\(\)/);
});

test('la busqueda resumida conserva coincidencias del servidor y tiene fallback', () => {
  assert.match(logsFeedSource, /rpc\('search_logs_summary'/);
  assert.match(logsFeedSource, /rpc\('search_logs'/);
  assert.match(logsViewSource, /log\.searchVerified/);
  assert.match(searchMigration, /create or replace view public\.logs_search_summary/i);
  assert.match(searchMigration, /returns setof public\.logs_search_summary/i);
  assert.doesNotMatch(searchMigration, /select\s+l\.\*/i);
});

test('la vista previa de compactacion es solo lectura', () => {
  assert.match(cleanupPreview, /pg_column_size\(details\)/i);
  assert.doesNotMatch(cleanupPreview, /^\s*(update|delete|truncate|drop|alter|create)\b/im);
});

test('la compactacion historica requiere llamada explicita y trabaja por lotes', () => {
  assert.match(cleanupApply, /compact_legacy_logs_batch/i);
  assert.match(cleanupApply, /for update skip locked/i);
  assert.match(cleanupApply, /p_batch_size/i);
  assert.match(cleanupApply, /\[imagen omitida\]/i);
  assert.doesNotMatch(cleanupApply, /^\s*(delete|truncate|drop)\b/im);
  assert.doesNotMatch(cleanupApply, /^\s*select\s+\*\s+from\s+rebu_maintenance\.compact_legacy_logs_batch/im);
});
