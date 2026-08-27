-- Unique timestamp retained so Supabase can track this migration independently.
begin;

do $$
declare
  v_table text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication is missing';
  end if;

  foreach v_table in array array[
    'register_state',
    'cash_closures',
    'sales',
    'expenses',
    'logs',
    'app_users',
    'products',
    'clients',
    'categories',
    'offers',
    'rewards',
    'agenda_contacts'
  ]
  loop
    if to_regclass('public.' || quote_ident(v_table)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = v_table
       ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end;
$$;

commit;
