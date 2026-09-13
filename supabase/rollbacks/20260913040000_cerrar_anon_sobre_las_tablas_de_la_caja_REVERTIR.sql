-- Vuelta atras del cierre de `anon` sobre las tablas de la caja.
--
-- GENERADO leyendo los permisos reales de la base, no escrito a mano: escribirlo
-- a mano ya habia fallado (le daba a `logs` un delete y un truncate que nunca
-- tuvo, y creaba una politica que no existia).
--
-- Correr solo si el cierre dejo alguna PC sin poder cobrar.

begin;

-- 1. Sacar lo que puso el cierre.
drop policy if exists rebu_operador_con_sesion on public.agenda_contacts;
drop policy if exists rebu_operador_con_sesion on public.budgets;
drop policy if exists rebu_operador_con_sesion on public.cash_closures;
drop policy if exists rebu_operador_con_sesion on public.categories;
drop policy if exists rebu_operador_con_sesion on public.clients;
drop policy if exists rebu_operador_con_sesion on public.expenses;
drop policy if exists rebu_operador_con_sesion on public.logs;
drop policy if exists rebu_operador_con_sesion on public.member_point_entries;
drop policy if exists rebu_operador_con_sesion on public.offers;
drop policy if exists rebu_operador_con_sesion on public.orders;
drop policy if exists rebu_operador_con_sesion on public.register_state;
drop policy if exists rebu_operador_con_sesion on public.rewards;
drop policy if exists rebu_operador_con_sesion on public.sale_items;
drop policy if exists rebu_operador_con_sesion on public.sales;
drop policy if exists rebu_operador_con_sesion on public.products;
drop policy if exists rebu_operador_con_sesion on public.supplier_link_suggestions;

-- 2. Volver a poner los permisos de anon, exactamente los que habia.
grant delete, insert, references, select, trigger, truncate, update on table public.agenda_contacts to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.budgets to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.cash_closures to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.categories to anon;
grant delete, insert, references, select, trigger, update on table public.clients to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.expenses to anon;
grant insert, references, select, trigger, update on table public.logs to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.member_point_entries to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.offers to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.orders to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.products to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.register_state to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.rewards to anon;
grant delete, insert, references, select, trigger, update on table public.sale_items to anon;
grant delete, insert, references, select, trigger, update on table public.sales to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.supplier_link_suggestions to anon;

-- 3. Devolver el estado de RLS que tenia cada tabla.
alter table public.agenda_contacts disable row level security;
alter table public.budgets disable row level security;
alter table public.cash_closures disable row level security;
alter table public.categories disable row level security;
alter table public.clients disable row level security;
alter table public.expenses disable row level security;
alter table public.logs disable row level security;
alter table public.member_point_entries disable row level security;
alter table public.offers disable row level security;
alter table public.orders disable row level security;
alter table public.products enable row level security;
alter table public.register_state disable row level security;
alter table public.rewards disable row level security;
alter table public.sale_items disable row level security;
alter table public.sales disable row level security;
alter table public.supplier_link_suggestions enable row level security;

-- 4. Volver a crear las politicas que el cierre borro.
drop policy if exists "Public Access CashClosures" on public.cash_closures;
create policy "Public Access CashClosures" on public.cash_closures
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Categories" on public.categories;
create policy "Public Access Categories" on public.categories
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Clients" on public.clients;
create policy "Public Access Clients" on public.clients
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Expenses" on public.expenses;
create policy "Public Access Expenses" on public.expenses
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Logs" on public.logs;
create policy "Public Access Logs" on public.logs
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "products_public_active_read" on public.products;
create policy "products_public_active_read" on public.products
  as permissive for select to anon
  using ((deleted_at IS NULL));
drop policy if exists "products_rebu_authenticated_access" on public.products;
create policy "products_rebu_authenticated_access" on public.products
  as permissive for all to authenticated
  using ((( SELECT private.web_catalog_current_actor_id() AS web_catalog_current_actor_id) IS NOT NULL))
  with check ((( SELECT private.web_catalog_current_actor_id() AS web_catalog_current_actor_id) IS NOT NULL));
drop policy if exists "rebu_anon_sin_limitantes" on public.products;
create policy "rebu_anon_sin_limitantes" on public.products
  as permissive for all to anon
  using (true)
  with check (true);
drop policy if exists "Public Access RegisterState" on public.register_state;
create policy "Public Access RegisterState" on public.register_state
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Rewards" on public.rewards;
create policy "Public Access Rewards" on public.rewards
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access SaleItems" on public.sale_items;
create policy "Public Access SaleItems" on public.sale_items
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "Public Access Sales" on public.sales;
create policy "Public Access Sales" on public.sales
  as permissive for all to public
  using (true)
  with check (true);
drop policy if exists "supplier_link_suggestions_anon" on public.supplier_link_suggestions;
create policy "supplier_link_suggestions_anon" on public.supplier_link_suggestions
  as permissive for all to anon
  using (true)
  with check (true);
drop policy if exists "supplier_link_suggestions_authenticated" on public.supplier_link_suggestions;
create policy "supplier_link_suggestions_authenticated" on public.supplier_link_suggestions
  as permissive for all to authenticated
  using ((( SELECT private.web_catalog_current_actor_id() AS web_catalog_current_actor_id) IS NOT NULL))
  with check ((( SELECT private.web_catalog_current_actor_id() AS web_catalog_current_actor_id) IS NOT NULL));

-- 5. Los permisos por defecto para lo que se cree en el futuro.
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;

commit;
