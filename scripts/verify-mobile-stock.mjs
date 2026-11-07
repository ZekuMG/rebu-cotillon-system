// Exercises real PostgreSQL functions, permissions and transactions. All test
// products, movements and logs are rolled back; existing stock is never changed.
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { Client } from 'pg';

const env = parse(readFileSync('.env'));
const db = new Client({ host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432), database: env.SUPABASE_DB_NAME || 'postgres', user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const migration = readdirSync('supabase/migrations').find((name) => name.endsWith('_rebu_mobile_stock.sql'));
const source = readFileSync(`supabase/migrations/${migration}`, 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
const install = process.argv.includes('--apply');
let checks = 0;
async function denied(sql, params, code) {
  await db.query('savepoint rejected_request');
  let actual;
  try { await db.query(sql, params); } catch (error) { actual = error.code; }
  await db.query('rollback to savepoint rejected_request');
  assert.equal(actual, code); checks++;
}
try {
  await db.connect();
  const exists = (await db.query("select to_regprocedure('public.rebu_mobile_profile()') is not null as installed")).rows[0].installed;
  if (install) {
    await db.query('begin');
    if (!exists) await db.query(source);
    const history = (await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null as available")).rows[0].available;
    if (history) await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3) on conflict(version) do nothing', [migration.split('_')[0], [source], 'rebu_mobile_stock']);
    await db.query('commit');
    console.log('Mobile endpoints installed. Existing desktop functions unchanged.');
  }
  await db.query('begin');
  if (!exists && !install && !process.argv.includes('--installed')) await db.query(source);
  const actors = await db.query("select auth_user_id from public.app_users where is_active is true and auth_user_id is not null and role in ('system','owner') limit 1");
  assert.ok(actors.rows[0], 'An active linked Rebu owner is required for integration tests.');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actors.rows[0].auth_user_id]);
  const product = await db.query("insert into public.products(title,stock,price,product_type,is_active,barcode) values ($1,10,1,'quantity',true,$2) returning id,barcode", [`Prueba móvil transaccional ${randomUUID()}`, `test-${randomUUID()}`]);
  const id = product.rows[0].id;
  const operation = randomUUID();
  await db.query('set local role anon');
  await denied('select public.rebu_mobile_profile()', [], '42501');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [operation, id, 'add', 5, 10, 'Prueba'], '42501');
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);
  await denied('select public.rebu_mobile_profile()', [], '42501');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [operation, id, 'add', 5, 10, 'Prueba'], '42501');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actors.rows[0].auth_user_id]);
  const profile = await db.query('select public.rebu_mobile_profile() as profile');
  assert.ok(profile.rows[0].profile.can_edit); checks++;
  const search = await db.query('select public.rebu_mobile_search_products($1,0,true) as result', [product.rows[0].barcode]);
  assert.ok(search.rows[0].result.products.some((entry) => entry.id === String(id))); checks++;
  await db.query('set local role authenticated');
  const args = [operation, id, 'add', 5, 10, 'Prueba de ingreso'];
  const first = (await db.query('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6) as result', args)).rows[0].result;
  assert.equal(first.after, 15); checks++;
  const retry = (await db.query('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6) as result', args)).rows[0].result;
  assert.equal(retry.replayed, true); assert.equal(retry.after, 15); checks++;
  const status = (await db.query('select public.rebu_mobile_stock_status($1) as status', [operation])).rows[0].status;
  assert.equal(status.status, 'confirmed'); assert.equal(status.result.after, 15); checks++;
  const absent = (await db.query('select public.rebu_mobile_stock_status($1) as status', [randomUUID()])).rows[0].status;
  assert.equal(absent.status, 'not_found'); checks++;
  await db.query('reset role');
  await db.query("update public.products set supplier_links=jsonb_build_object('stock_lifecycle',jsonb_build_object('lastRestockedAt','2000-01-01')) where id=$1", [id]);
  await db.query('set local role authenticated');
  await db.query('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [randomUUID(), id, 'set', 14, 15, 'Conteo reducido de prueba']);
  await db.query('reset role');
  const reduced = (await db.query("select supplier_links->'stock_lifecycle'->>'lastRestockedAt' as restocked from public.products where id=$1", [id])).rows[0];
  assert.equal(reduced.restocked, '2000-01-01'); checks++;
  await db.query('set local role authenticated');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [operation, id, 'add', 6, 10, 'Prueba de ingreso'], '22023');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [randomUUID(), id, 'set', 4, 10, 'Conteo desactualizado'], '40001');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [randomUUID(), id, 'set', -1, 15, 'Cantidad negativa'], '22023');
  await denied('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6)', [randomUUID(), id, 'add', 2147483647, 14, 'Fuera de rango'], '22023');
  const zero = (await db.query('select public.rebu_mobile_save_stock($1,$2,$3,$4,$5,$6) as result', [randomUUID(), id, 'set', 0, 14, 'Conteo de prueba'])).rows[0].result;
  assert.equal(zero.after, 0); checks++;
  await db.query('reset role');
  const audit = await db.query("select count(*)::integer as count from public.logs where details->>'operation_id' = $1", [operation]);
  assert.equal(audit.rows[0].count, 1); checks++;
  const persisted = await db.query('select stock,supplier_links from public.products where id=$1', [id]);
  assert.equal(persisted.rows[0].stock, 0); assert.ok(persisted.rows[0].supplier_links.stock_lifecycle.outOfStockSince); checks++;
  const grants = await db.query("select n.nspname,p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'execute') as anon_can_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'rebu_mobile_%'");
  assert.ok(grants.rows.every((row) => !row.anon_can_execute));
  assert.ok(grants.rows.filter((row) => row.nspname === 'public').every((row) => !row.prosecdef)); checks++;
  console.log(`PASS: ${checks} database checks. Test stock and audit rolled back.`);
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
}
