import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('supplier price mutations use one transactional RPC instead of per-product writes', async () => {
  const source = await readSource('../src/App.jsx');
  const rpcCalls = source.match(/supabase\.rpc\('apply_supplier_product_updates_batch'/g) || [];

  assert.equal(rpcCalls.length, 1);
  assert.match(source, /runSupplierProductUpdatesBatch\(action, mutations\)/);
  assert.match(source, /runSupplierProductUpdatesBatch\('approve', mutations\)/);
  assert.match(source, /runSupplierProductUpdatesBatch\('undo', mutations\)/);
  assert.match(source, /runSupplierProductUpdatesBatch\('link', mutations\)/);

  for (const nextHandler of [
    'handleApplySupplierPriceUpdates',
    'handleUndoSupplierPriceUpdates',
    'handleUpdateCasaAlbertoLinks',
  ]) {
    const handlerStart = source.indexOf(`const ${nextHandler}`);
    const handlerEnd = source.indexOf('\n  const ', handlerStart + 1);
    const handlerSource = source.slice(handlerStart, handlerEnd);
    assert.doesNotMatch(handlerSource, /await updateWithSchemaFallback/);
  }
});

test('supplier price batch RPC is bounded, authorized and concurrency safe', async () => {
  const migration = await readSource('../supabase/migrations/20260824213346_supplier_price_batch.sql');

  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /require_rebu_permission\(actor, 'bulkEditor\.view'\)/);
  assert.match(migration, /require_rebu_permission\(actor, 'inventory\.edit'\)/);
  assert.match(migration, /requested_count < 1 or requested_count > 500/);
  assert.match(migration, /count\(distinct update_row\.product_id\)/);
  assert.match(migration, /La accion no coincide con los campos solicitados/);
  assert.match(migration, /order by product\.id\s+for update of product/i);
  assert.match(migration, /product\.updated_at is distinct from update_row\.expected_updated_at/);
  assert.match(migration, /update public\.products as product[\s\S]+from input_rows/i);
  assert.match(migration, /revoke all on function public\.apply_supplier_product_updates_batch\(text, jsonb\)[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_supplier_product_updates_batch\(text, jsonb\)[\s\S]+to authenticated/i);
});

test('supplier price conflict precheck avoids locks without breaking no-JWT terminals', async () => {
  const migration = await readSource('../supabase/migrations/20260828163500_conflicto_costos_sin_candados.sql');
  const precheckPosition = migration.indexOf('-- Filtro barato ANTES de tomar candados');
  const lockPosition = migration.indexOf('for update of product');

  assert.ok(precheckPosition >= 0, 'la migración debe incluir el prechequeo de conflictos');
  assert.ok(lockPosition > precheckPosition, 'el prechequeo debe ejecutarse antes de tomar locks');
  assert.match(migration, /using errcode = 'P0001'/);
  assert.match(
    migration,
    /grant execute on function public\.apply_supplier_product_updates_batch\(text, jsonb\)\s+to anon, authenticated/i,
  );
});

test('supplier price UI batches local state and defers offscreen rendering', async () => {
  const [viewSource, cssSource] = await Promise.all([
    readSource('../src/views/BulkEditorView.jsx'),
    readSource('../src/index.css'),
  ]);

  assert.match(viewSource, /const clearSupplierPriceOverrides = \(groupKeys = \[\]\)/);
  assert.match(viewSource, /clearSupplierPriceOverrides\(Array\.from\(completedKeys\)\)/);
  assert.match(viewSource, /selectedSupplierGroupKeySet\.has\(/);
  assert.match(viewSource, /className="supplier-price-virtual-item/);
  assert.match(cssSource, /\.supplier-price-virtual-item\s*\{[\s\S]*content-visibility:\s*auto/);
  assert.match(cssSource, /contain-intrinsic-size:\s*0 112px/);
});

test('supplier price checks handle persistence failures without unhandled rejections', async () => {
  const viewSource = await readSource('../src/views/BulkEditorView.jsx');
  const singleCheckStart = viewSource.indexOf('const handleCheckSupplierPriceGroup');
  const allChecksStart = viewSource.indexOf('const handleCheckAllSupplierPrices');
  const pauseStart = viewSource.indexOf('const pauseSupplierPriceCheck');
  const singleCheckSource = viewSource.slice(singleCheckStart, allChecksStart);
  const allChecksSource = viewSource.slice(allChecksStart, pauseStart);

  assert.match(singleCheckSource, /catch \(error\)/);
  assert.match(singleCheckSource, /if \(rethrowErrors\) throw error/);
  assert.match(singleCheckSource, /showSupplierActionFailure\(message\)/);
  assert.match(allChecksSource, /handleCheckSupplierPriceGroup\(group, \{ rethrowErrors: true \}\)/);
  assert.match(allChecksSource, /catch \(error\)/);
  assert.match(allChecksSource, /showSupplierActionFailure\(/);
});

test('supplier price actions only change local state after the database confirms every product', async () => {
  const [appSource, viewSource] = await Promise.all([
    readSource('../src/App.jsx'),
    readSource('../src/views/BulkEditorView.jsx'),
  ]);

  assert.match(viewSource, /const requireSupplierMutationProducts = \(result, expectedCount, fallbackMessage\)/);
  assert.match(viewSource, /products\.length !== expectedCount/);
  assert.match(viewSource, /if \(await handleApproveSupplierGroup\(group\)\) completedKeys\.add/);
  assert.match(viewSource, /if \(await handleIgnoreSupplierGroup\(group\)\) completedKeys\.add/);
  assert.match(viewSource, /No se pudo confirmar la aprobación de todos los productos/);
  assert.match(viewSource, /No se pudo confirmar la restauración de todos los productos/);
  assert.match(viewSource, /No se pudo confirmar la vinculación de todos los productos/);
  assert.match(appSource, /return \{ products: \[\], error: message \};/);
});

test('supplier price control keeps one operative card presentation', async () => {
  const viewSource = await readSource('../src/views/BulkEditorView.jsx');

  assert.doesNotMatch(viewSource, /SUPPLIER_PRICE_VIEW_MODE_STORAGE_KEY/);
  assert.doesNotMatch(viewSource, /supplierPriceViewMode|setSupplierPriceViewMode/);
  assert.doesNotMatch(viewSource, /label: 'Tarjetas'|label: 'Lista'/);
  assert.match(viewSource, /className="space-y-3"[\s\S]+visibleCasaAlbertoGroups\.map/);
});
