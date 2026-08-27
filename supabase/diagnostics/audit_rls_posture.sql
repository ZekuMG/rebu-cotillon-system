with public_tables as (
  select class.relname as table_name, class.relrowsecurity as rls_enabled
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
),
without_rls as (
  select
    table_name,
    has_table_privilege('anon', format('public.%I', table_name), 'select') as anon_select,
    has_table_privilege('anon', format('public.%I', table_name), 'insert') as anon_insert,
    has_table_privilege('anon', format('public.%I', table_name), 'update') as anon_update,
    has_table_privilege('anon', format('public.%I', table_name), 'delete') as anon_delete
  from public_tables
  where not rls_enabled
)
select jsonb_build_object(
  'tables_without_rls', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'anon_select', anon_select,
      'anon_insert', anon_insert,
      'anon_update', anon_update,
      'anon_delete', anon_delete
    ) order by table_name)
    from without_rls
  ), '[]'::jsonb)
) as security_posture;
