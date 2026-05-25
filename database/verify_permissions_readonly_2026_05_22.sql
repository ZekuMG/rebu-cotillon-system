-- Read-only verification for Rebu Supabase permissions.
-- Single SELECT because Supabase CLI db query executes one prepared statement.

with
functions as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.function_name, t.signature), '[]'::jsonb) as payload
  from (
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as signature,
      p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'verify_app_user_login',
        'verify_app_user_login_private',
        'list_app_users_private',
        'create_app_user',
        'update_app_user_profile',
        'update_app_user_password',
        'set_app_user_active',
        'update_app_user_permissions',
        'apply_product_stock_delta',
        'register_sale_transaction',
        'edit_sale_transaction',
        'void_sale_transaction'
      )
  ) t
),
routine_grants as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.routine_name, t.grantee), '[]'::jsonb) as payload
  from (
    select
      routine_name,
      grantee,
      privilege_type
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'verify_app_user_login',
        'verify_app_user_login_private',
        'list_app_users_private',
        'create_app_user',
        'update_app_user_profile',
        'update_app_user_password',
        'set_app_user_active',
        'update_app_user_permissions',
        'apply_product_stock_delta',
        'register_sale_transaction',
        'edit_sale_transaction',
        'void_sale_transaction'
      )
  ) t
),
app_users_public_columns as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ordinal_position), '[]'::jsonb) as payload
  from (
    select
      table_schema,
      table_name,
      column_name,
      data_type,
      ordinal_position
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users_public'
  ) t
),
app_users_table_grants as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.table_name, t.grantee, t.privilege_type), '[]'::jsonb) as payload
  from (
    select
      table_schema,
      table_name,
      grantee,
      privilege_type
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('app_users', 'app_users_public')
  ) t
),
rls as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.table_name), '[]'::jsonb) as payload
  from (
    select
      n.nspname as table_schema,
      c.relname as table_name,
      c.relrowsecurity as rowsecurity,
      c.relforcerowsecurity as forcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('app_users', 'sales', 'sale_items', 'products', 'clients', 'logs', 'rewards', 'orders', 'budgets', 'agenda_contacts')
  ) t
),
policies as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.tablename, t.policyname), '[]'::jsonb) as payload
  from (
    select
      schemaname,
      tablename,
      policyname,
      roles,
      cmd
    from pg_policies
    where schemaname = 'public'
      and tablename in ('app_users', 'sales', 'sale_items', 'products', 'clients', 'logs', 'rewards', 'orders', 'budgets', 'agenda_contacts')
  ) t
)
select 'functions' as check_group, payload from functions
union all
select 'routine_grants', payload from routine_grants
union all
select 'app_users_public_columns', payload from app_users_public_columns
union all
select 'app_users_table_grants', payload from app_users_table_grants
union all
select 'rls', payload from rls
union all
select 'policies', payload from policies
