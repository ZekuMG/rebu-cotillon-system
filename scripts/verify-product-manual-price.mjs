// Tests the actual database trigger on a temporary table, never real inventory.
// --apply retains only the function replacement and migration record.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Client } from 'pg';

const version = '20261019144329';
const name = 'optional_product_sale_price';
const source = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
const env = parse(readFileSync('.env'));
const db = new Client({ host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432), database: env.SUPABASE_DB_NAME || 'postgres', user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const apply = process.argv.includes('--apply');

try {
  await db.connect();
  const definition = () => db.query("select pg_get_functiondef(oid) as source, prosecdef, proacl from pg_proc where oid = 'private.enforce_product_final_sale_price()'::regprocedure");
  const before = (await definition()).rows[0];
  if (apply) {
    mkdirSync('output/release-1.2.57', { recursive: true });
    writeFileSync(`output/release-1.2.57/manual-price-before-${Date.now()}.sql`, before.source);
  }
  await db.query('begin');
  await db.query("set local lock_timeout = '5s'");
  await db.query(source);
  const after = (await definition()).rows[0];
  assert.equal(after.prosecdef, before.prosecdef);
  assert.deepEqual(after.proacl, before.proacl);
  await db.query('create temporary table price_check (price numeric, product_type text) on commit drop');
  await db.query('create trigger price_check_trigger before insert or update on price_check for each row execute function private.enforce_product_final_sale_price()');
  const cases = [[1001.23, 'quantity'], [8063.50, 'quantity'], [8.0635, 'weight'], [0.0015, 'weight'], [0, 'quantity'], [-5, 'quantity'], [null, 'quantity']];
  for (const [price, type] of cases) {
    const result = await db.query('insert into price_check values ($1,$2) returning price', [price, type]);
    const actual = result.rows[0].price;
    assert.equal(actual === null ? null : Number(actual), price === null ? null : Math.max(0, price));
  }
  const updated = await db.query('update price_check set price = 8.0675 where product_type = $1 returning price', ['weight']);
  assert.ok(updated.rows.every((row) => Number(row.price) === 8.0675));
  if (apply) {
    await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values ($1,$2,$3) on conflict(version) do nothing', [version, [source], name]);
    await db.query('commit');
  } else {
    await db.query('rollback');
    assert.equal((await definition()).rows[0].source, before.source);
  }
  console.log(`10 database checks passed. ${apply ? 'Function and migration record installed; prior function backed up.' : 'Changes rolled back.'} No real inventory rows changed.`);
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
