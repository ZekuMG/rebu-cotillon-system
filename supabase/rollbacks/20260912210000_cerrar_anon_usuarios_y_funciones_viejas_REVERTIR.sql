-- Vuelta atras exacta del primer corte. Deja los permisos como estaban el
-- 12-sep-2026 antes de aplicarlo. Correr solo si el corte rompio algo.

begin;

create policy rebu_anon_sin_limitantes on public.app_users
  as permissive for all to anon using (true) with check (true);
grant select, insert, update, delete, truncate, references, trigger
  on table public.app_users to anon;

create policy rebu_anon_sin_limitantes on public.whatsapp_device_access_requests
  as permissive for all to anon using (true) with check (true);
grant select, insert, update, delete, truncate, references, trigger
  on table public.whatsapp_device_access_requests to anon;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like '%\_unchecked\_20260710'
  loop
    execute format('grant execute on function %s to anon', f.firma);
  end loop;
end
$$;

commit;
