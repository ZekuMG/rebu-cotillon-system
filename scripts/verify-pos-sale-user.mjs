// Tests run inside a transaction and roll back every sale and user change.
// --apply installs only this migration after all checks pass.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { Client } from 'pg';

const migration = '20261030030809_pos_sale_user_selection.sql';
const source = readFileSync(`supabase/migrations/${migration}`, 'utf8')
  .replace(/^([\s\S]*?)begin;\s*/i, '').replace(/commit;\s*$/i, '');
const env = parse(readFileSync('.env'));
const db = new Client({ host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432), database: env.SUPABASE_DB_NAME || 'postgres', user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
let checks = 0;
try {
  await db.connect();
  const signature = 'public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb,text)';
  const before = (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])).rows[0].definition;
  const actors = (await db.query('select id, auth_user_id, display_name, role from public.app_users where is_active and auth_user_id is not null order by created_at')).rows;
  assert.ok(actors.length >= 2, 'Two active linked users are needed.');
  const [operator, seller] = actors;
  await db.query('begin');
  await db.query(source);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [operator.auth_user_id]);
  await db.query('set local role authenticated');
  const baseSale = { total: 1, payment_method: 'Efectivo', status: 'completed', user_id: operator.id, user_name: 'Untrusted name', user_role: 'Untrusted role' };
  const items = [{ product_title: 'Prueba transaccional de responsable POS', quantity: 1, price: 1, subtotal: 1, product_type: 'quantity' }];
  const charge = async (payload, key = randomUUID()) => (await db.query('select public.register_sale_transaction($1,$2,$3,$4,$5) as result', [JSON.stringify(payload), JSON.stringify(items), '{}', '[]', key])).rows[0].result;
  const assertSeller = async (result, expected) => {
    const sale = (await db.query('select user_id,user_name,user_role from public.sales where id = $1', [result.id || result.sale_id])).rows[0];
    assert.equal(sale.user_id, expected.id);
    assert.equal(sale.user_name, expected.display_name);
    assert.equal(sale.user_role, expected.role);
    checks++;
  };
  const payload = { ...baseSale, pos_user_id: seller.id };
  const key = randomUUID();
  const result = await charge(payload, key);
  await assertSeller(result, seller);
  const retry = await charge(payload, key);
  assert.equal(retry._duplicate, true);
  assert.equal(retry.id || retry.sale_id, result.id || result.sale_id);
  checks++;
  await assertSeller(await charge(baseSale), operator); // Existing app versions.
  await db.query("select set_config('request.jwt.claim.sub', '', true)");
  await db.query('set local role anon');
  async function rejected(selectedId, expectedCode = '22023') {
    await db.query('savepoint invalid_selection');
    let code;
    try { await charge({ ...baseSale, pos_user_id: selectedId }); } catch (error) { code = error.code; }
    await db.query('rollback to savepoint invalid_selection');
    assert.equal(code, expectedCode);
    checks++;
  }
  await rejected(seller.id, '42501'); // Attribution never grants permission.
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [operator.auth_user_id]);
  await rejected(null);
  await rejected('');
  await rejected(randomUUID());
  await db.query('reset role');
  await db.query('update public.app_users set is_active = false where id = $1', [seller.id]);
  await db.query('set local role authenticated');
  await rejected(seller.id);
  await db.query('rollback');
  assert.equal((await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])).rows[0].definition, before);
  console.log(`${checks} database checks passed; test sales and user changes rolled back.`);
  if (process.argv.includes('--apply')) {
    mkdirSync('output/pos-sale-user', { recursive: true });
    writeFileSync(`output/pos-sale-user/function-before-${Date.now()}.sql`, before);
    await db.query('begin');
    await db.query(source);
    await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3) on conflict(version) do nothing', [migration.split('_')[0], [source], 'pos_sale_user_selection']);
    await db.query('commit');
    console.log('POS sale user migration installed; previous function backed up in output/pos-sale-user.');
  }
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
