import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Client } from 'pg';
import assert from 'node:assert/strict';

const e = parse(readFileSync('.env'));
const db = new Client({ host: e.SUPABASE_DB_HOST, port: Number(e.SUPABASE_DB_PORT || 5432), database: e.SUPABASE_DB_NAME || 'postgres', user: e.SUPABASE_DB_USER, password: e.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const file = '20261029024141_public_catalog_availability_only.sql';
const source = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
try {
  await db.connect(); await db.query('begin');
  const installed = (await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [file.split('_')[0]])).rowCount > 0;
  if (!installed) await db.query(source);
  await db.query('set local role anon');
  for (const sql of ['select stock from public.products limit 0', 'select source_snapshot from public.web_catalog_products limit 0', 'select source_snapshot from public.web_catalog_product_color_links limit 0', 'select * from public.web_catalog_admin_products limit 0']) {
    await db.query('savepoint private_read');
    let code; try { await db.query(sql); } catch (error) { code = error.code; }
    await db.query('rollback to savepoint private_read'); assert.equal(code, '42501');
  }
  // Execute the entire published projection, including variants/color JSON.
  const before = await db.query('select id,availability,variants,color_products from public.web_catalog_public_products limit 10');
  assert.ok(before.rows.every((row) => !/"(stock|stock_quantity|inventory_stock|purchasePrice|purchase_price|source_snapshot)"\s*:/.test(JSON.stringify(row))));
  await db.query('select id,title,price from public.products limit 0');
  await db.query('reset role');
  assert.equal((await db.query("select has_column_privilege('authenticated','public.products','stock','select') as allowed")).rows[0].allowed, true);
  if (process.argv.includes('--apply') && !installed) {
    await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [file.split('_')[0], [source], 'public_catalog_availability_only']);
    await db.query('commit');
    console.log('PASS: anonymous exact stock/snapshot/admin reads blocked; public availability projection and authenticated inventory preserved. Migration applied.');
  } else { await db.query('rollback'); console.log('PASS: catalog privacy and compatibility checks.'); }
} finally { await db.query('rollback').catch(() => {}); await db.end(); }
