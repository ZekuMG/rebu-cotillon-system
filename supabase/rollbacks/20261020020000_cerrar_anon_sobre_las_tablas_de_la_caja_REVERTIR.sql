-- Contingencia operativa del corte RLS. Solo para uso temporal si alguna
-- operacion legitima queda bloqueada: los usuarios con sesion activa recuperan
-- acceso directo a tablas. La identidad Auth y el bloqueo de anon permanecen.
-- Requiere corregir la politica especifica antes de volver a endurecer.
begin;

do $$
declare table_name text; policy_row record;
begin
  foreach table_name in array array[
    'agenda_contacts','budgets','cash_closures','categories','clients',
    'expenses','logs','member_point_entries','offers','orders',
    'register_state','rewards','sale_items','sales'
  ] loop
    for policy_row in select policyname from pg_policies
      where schemaname='public' and tablename=table_name
    loop
      execute format('drop policy %I on public.%I', policy_row.policyname, table_name);
    end loop;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy rebu_contingencia_auth on public.%I for all to authenticated '
      || 'using ((select private.web_catalog_current_actor_id()) is not null) '
      || 'with check ((select private.web_catalog_current_actor_id()) is not null)',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists rebu_product_read on public.products;
drop policy if exists rebu_product_insert on public.products;
drop policy if exists rebu_product_update on public.products;
drop policy if exists rebu_product_delete on public.products;
create policy rebu_contingencia_product_publico on public.products
  for select to anon
  using (is_active is true and deleted_at is null);
create policy rebu_contingencia_product_auth on public.products
  for all to authenticated
  using ((select private.web_catalog_current_actor_id()) is not null)
  with check ((select private.web_catalog_current_actor_id()) is not null);
grant select, insert, update, delete on public.products to authenticated;
revoke all on public.products from anon;
grant select on public.products to anon;

drop trigger if exists rebu_stamp_log_actor on public.logs;
drop trigger if exists rebu_protect_client_points on public.clients;

notify pgrst, 'reload schema';
commit;
