// Runs a pending migration on the configured database inside one transaction,
// checks its security invariants, and always rolls back. No business data is
// persisted. Run from the project root containing .env.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '').trim()];
  }));

const env = parseEnv(readFileSync(resolve(process.cwd(), '.env'), 'utf8'));
const migrationPath = process.argv[2];
if (!migrationPath) throw new Error('Indicá el archivo SQL a verificar.');
const migration = readFileSync(resolve(migrationPath), 'utf8')
  .replace(/^begin;\s*$/im, '')
  .replace(/^commit;\s*$/im, '');

const client = new pg.Client({
  host: env.SUPABASE_DB_HOST,
  port: Number(env.SUPABASE_DB_PORT || 5432),
  user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD,
  database: env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query('begin');
  await client.query(migration);

  const { rows: [tables] } = await client.query(`
    select count(*) filter (where relrowsecurity) as protected,
      count(*) as total
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any($1::text[])
  `, [[
    'agenda_contacts', 'budgets', 'cash_closures', 'categories', 'clients',
    'expenses', 'logs', 'member_point_entries', 'offers', 'orders',
    'register_state', 'rewards', 'sale_items', 'sales', 'products',
  ]]);
  if (Number(tables.protected) !== 15 || Number(tables.total) !== 15) {
    throw new Error(`RLS incompleto: ${tables.protected}/${tables.total}`);
  }

  const { rows: [access] } = await client.query(`
    select has_table_privilege('anon', 'public.sales', 'select') as anon_sales,
      has_table_privilege('anon', 'public.products', 'select') as anon_products,
      has_table_privilege('authenticated', 'public.sales', 'insert') as direct_sale_insert,
      has_function_privilege('anon',
        'public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb,text)', 'execute') as anon_sale_rpc,
      has_function_privilege('anon',
        'public.verify_app_user_login_auth_bridge(uuid,text)', 'execute') as anon_login_bridge,
      has_function_privilege('anon',
        'public.activate_app_user_permissions_after_login()', 'execute') as anon_activate,
      has_function_privilege('authenticated',
        'public.link_current_auth_user_to_app_user(uuid,text)', 'execute') as legacy_relink
  `);
  if (access.anon_sales || !access.anon_products || access.direct_sale_insert ||
      access.anon_sale_rpc || !access.anon_login_bridge || access.anon_activate ||
      access.legacy_relink) {
    throw new Error(`Privilegios inesperados: ${JSON.stringify(access)}`);
  }

  const { rows: [systemActor] } = await client.query(`
    select id, auth_user_id from public.app_users
    where role = 'system' and is_active is true and auth_user_id is not null
    limit 1
  `);
  if (!systemActor) throw new Error('Falta un usuario Sistema vinculado a Auth para la prueba.');
  await client.query('select set_config($1, $2, true)',
    ['request.jwt.claim.sub', systemActor.auth_user_id]);
  await client.query('set local role authenticated');
  const testPassword = `RebuTest-${crypto.randomUUID()}`;
  const { rows: [testUser] } = await client.query(`
    select * from public.create_app_user($1, $2, $3, $4)
  `, [systemActor.id, `Permisos test ${crypto.randomUUID()}`, 'seller', testPassword]);
  await client.query(`
    select * from public.update_app_user_permissions($1, $2, $3::jsonb, false)
  `, [systemActor.id, testUser.id, JSON.stringify({ 'pos.view': false })]);
  await client.query('reset role');
  const { rows: [pending] } = await client.query(`
    select permissions_override, active_permissions_override, auth_user_id
    from public.app_users where id = $1
  `, [testUser.id]);
  if (pending.permissions_override?.['pos.view'] !== false ||
      pending.active_permissions_override?.['pos.view'] === false) {
    throw new Error('El cambio pendiente se aplicó antes del reingreso.');
  }
  await client.query('select set_config($1, $2, true)',
    ['request.jwt.claim.sub', pending.auth_user_id]);
  await client.query('set local role authenticated');
  const { rows: [beforeLogin] } = await client.query(`
    select private.rebu_current_has_any(array['pos.view']) as can_sell
  `);
  if (!beforeLogin.can_sell) throw new Error('El permiso previo no se mantuvo hasta el ingreso.');
  const { rows: [login] } = await client.query(`
    select id from public.verify_app_user_login_auth_bridge($1, $2)
  `, [testUser.id, testPassword]);
  if (login.id !== testUser.id) throw new Error('El ingreso de prueba no validó al usuario.');
  const { rows: [afterBridge] } = await client.query(`
    select private.rebu_current_has_any(array['pos.view']) as can_sell
  `);
  if (!afterBridge.can_sell) throw new Error('El puente adelantó permisos antes de validar Auth.');
  await client.query('select public.activate_app_user_permissions_after_login()');
  const { rows: [afterLogin] } = await client.query(`
    select private.rebu_current_has_any(array['pos.view']) as can_sell
  `);
  if (afterLogin.can_sell) throw new Error('El permiso pendiente no se activó al reingresar.');
  await client.query('reset role');

  const { rows: [actor] } = await client.query(`
    select id, display_name, auth_user_id from public.app_users
    where role = 'seller' and is_active is true and auth_user_id is not null
      and id <> $1
      and coalesce((permissions_override ->> 'register.manage')::boolean, false) is false
    limit 1
  `, [testUser.id]);
  if (actor?.auth_user_id) {
    await client.query('select set_config($1, $2, true)',
      ['request.jwt.claim.sub', actor.auth_user_id]);
    await client.query('set local role authenticated');
    const { rows: [seller] } = await client.query(`
      select auth.uid() as auth_uid,
        private.rebu_current_has_any(array['pos.view']) as can_sell,
        private.rebu_current_has_any(array['register.manage']) as can_manage_register
    `);
    if (!seller.can_sell || seller.can_manage_register) {
      throw new Error(`Permisos del vendedor incorrectos: ${JSON.stringify({ seller, actor })}`);
    }
    await client.query('select id from public.sales limit 1');
    const { rows: [newLog] } = await client.query(`
      insert into public.logs(action, "user", details, reason)
      values ('Prueba reversible', 'Nombre falso', '{"userId":"falso"}'::jsonb, 'rollback')
      returning "user", details
    `);
    if (newLog.user !== actor.display_name || newLog.details?.userId !== actor.id) {
      throw new Error('El actor del registro no fue sellado por la base.');
    }
    const { rows: [member] } = await client.query('select id from public.clients where is_active is true limit 1');
    if (member) {
      await client.query('savepoint points_test');
      let blockedPoints = false;
      try {
        await client.query('update public.clients set points = points + 1 where id = $1', [member.id]);
      } catch (error) {
        blockedPoints = error.code === '42501';
      } finally {
        await client.query('rollback to savepoint points_test');
      }
      if (!blockedPoints) throw new Error('El vendedor pudo modificar puntos directamente.');
      const { rows: [pointResult] } = await client.query(`
        select public.adjust_member_points_once(
          $1, $2, 1, 'Prueba reversible', 'manual_adjustment', now()
        ) as result
      `, [`security-test-${crypto.randomUUID()}`, member.id]);
      if (Number(pointResult?.result?.delta) !== 1) {
        throw new Error('La RPC autorizada no pudo cambiar puntos.');
      }
    }
    await client.query('reset role');
  }

  if (process.argv[3]) {
    const rollback = readFileSync(resolve(process.argv[3]), 'utf8')
      .replace(/^begin;\s*$/im, '')
      .replace(/^commit;\s*$/im, '');
    await client.query(rollback);
    const { rows: [fallback] } = await client.query(`
      select has_table_privilege('anon', 'public.sales', 'select') as anon_sales,
        has_table_privilege('authenticated', 'public.sales', 'insert') as auth_sales
    `);
    if (fallback.anon_sales || !fallback.auth_sales) {
      throw new Error(`Contingencia insegura o ineficaz: ${JSON.stringify(fallback)}`);
    }
    await client.query('set local role anon');
    await client.query('select id from public.products limit 1');
    await client.query('reset role');
  }

  console.log('Migración verificada: RLS 15/15, anon limitado, ventas por RPC y permisos por operador.');
} finally {
  await client.query('rollback').catch(() => {});
  await client.end();
}
