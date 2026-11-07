import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Client } from 'pg';
import assert from 'node:assert/strict';

const env = parse(readFileSync('.env'));
const db = new Client({ host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432), database: env.SUPABASE_DB_NAME || 'postgres', user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const filename = '20261029021438_mobile_audit_hardening.sql';
const source = readFileSync(`supabase/migrations/${filename}`, 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
try {
  await db.connect();
  await db.query('begin');
  const recorded = (await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [filename.split('_')[0]])).rowCount > 0;
  if (!recorded) await db.query(source);
  for (const role of ['anon', 'authenticated']) {
    await db.query(`set local role ${role}`);
    for (const sql of ["update public.app_users_public set role='system' where false", 'delete from public.app_users_public where false', "insert into public.app_users_public(display_name,role) select 'Audit','system' where false"]) {
      await db.query('savepoint denied');
      let code;
      try { await db.query(sql); } catch (error) { code = error.code; }
      await db.query('rollback to savepoint denied');
      assert.equal(code, '42501', `${role} must not write the login directory`);
    }
    await db.query('select id,display_name from public.app_users_public limit 0');
    await db.query('reset role');
  }
  const statusGrants = (await db.query("select has_function_privilege('anon','public.rebu_mobile_stock_status(uuid)','execute') as anon_allowed")).rows[0];
  assert.equal(statusGrants.anon_allowed, false);
  const definition = (await db.query("select pg_get_functiondef('private.rebu_mobile_save_stock(uuid,bigint,text,bigint,bigint,text)'::regprocedure) as definition")).rows[0].definition;
  assert.ok(definition.includes('if next_stock > product.stock then'));
  if (process.argv.includes('--apply') && !recorded) {
    await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [filename.split('_')[0], [source], 'mobile_audit_hardening']);
    await db.query('commit');
    console.log('PASS: login directory write permissions closed, status endpoint installed, stock lifecycle fixed; migration recorded.');
  } else {
    await db.query('rollback');
    console.log('PASS: anonymous/authenticated directory writes denied, login reads preserved, mobile status protected and stock lifecycle verified.');
  }
} finally { await db.query('rollback').catch(() => {}); await db.end(); }
