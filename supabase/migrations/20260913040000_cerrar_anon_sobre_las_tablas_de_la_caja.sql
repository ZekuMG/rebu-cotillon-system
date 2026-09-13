-- Cierra el acceso de `anon` a las tablas del punto de venta.
--
-- ⚠️ NO APLICAR hasta que TODAS las PCs entren con sesion. Se comprueba con:
--       npm run audit:pcs
--    Mientras una sola maquina entre como anonima, esto la deja sin poder cobrar:
--    no podria abrir la caja, y con la caja cerrada el programa no cobra.
--
-- Por que se puede: desde 1.2.47 el programa abre sesion de Supabase Auth al
-- entrar. Se midio el trafico real y 11 de las 14 consultas ya viajan como
-- `authenticated`. Las 3 que siguen siendo anonimas son las de la pantalla de
-- acceso, y son justo las que esta migracion deja abiertas a proposito.
--
-- Que queda abierto para `anon`, y por que:
--   * la vista public.app_users_public  -> la pantalla de acceso lista los
--     operadores antes de que exista sesion. No expone contraseñas.
--   * verify_app_user_login_auth_bridge -> valida la contraseña antes de que
--     exista sesion.
--   * SELECT sobre public.products      -> lo leen el bot de WhatsApp y la
--     vidriera web, que no tienen usuario.
-- Todo lo demas pasa a exigir una sesion de un operador ACTIVO.
--
-- Para volver atras:
--   supabase/rollbacks/20260913040000_cerrar_anon_sobre_las_tablas_de_la_caja_REVERTIR.sql

begin;

-- 1. Las politicas que hoy anulan cualquier proteccion.
--
-- Todas las politicas de este esquema son PERMISSIVE, y en Postgres las
-- permisivas se combinan con OR: alcanza una que diga `USING true` para que las
-- demas no sirvan de nada. Las nueve "Public Access" son exactamente eso, y por
-- eso hoy activar RLS sobre esas tablas no cambiaria nada.
drop policy if exists "Public Access CashClosures"  on public.cash_closures;
drop policy if exists "Public Access Categories"    on public.categories;
drop policy if exists "Public Access Clients"       on public.clients;
drop policy if exists "Public Access Expenses"      on public.expenses;
drop policy if exists "Public Access Logs"          on public.logs;
drop policy if exists "Public Access RegisterState" on public.register_state;
drop policy if exists "Public Access Rewards"       on public.rewards;
drop policy if exists "Public Access SaleItems"     on public.sale_items;
drop policy if exists "Public Access Sales"         on public.sales;
drop policy if exists rebu_anon_sin_limitantes      on public.products;
drop policy if exists rebu_anon_sin_limitantes      on public.supplier_link_suggestions;

-- 2. Las tablas de la caja: sin `anon`, con RLS, y acceso para el operador con sesion.
do $$
declare
  t text;
  tablas text[] := array[
    'agenda_contacts', 'budgets', 'cash_closures', 'categories', 'clients',
    'expenses', 'logs', 'member_point_entries', 'offers', 'orders',
    'register_state', 'rewards', 'sale_items', 'sales'
  ];
begin
  foreach t in array tablas loop
    execute format('revoke all on table public.%I from anon', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rebu_operador_con_sesion on public.%I', t);
    -- El operador tiene que estar activo: la funcion ya lo exige, y es la misma
    -- que usa el catalogo web desde agosto.
    execute format($f$
      create policy rebu_operador_con_sesion on public.%I
        as permissive for all to authenticated
        using ((select private.web_catalog_current_actor_id()) is not null)
        with check ((select private.web_catalog_current_actor_id()) is not null)
    $f$, t);
  end loop;
end
$$;

-- 3. products es distinto: el bot y la vidriera lo leen sin usuario.
--    Se le quita a `anon` todo menos la lectura de lo que no esta dado de baja
--    (eso ya lo hace la politica products_public_active_read, que queda).
revoke insert, update, delete, truncate, references, trigger on table public.products from anon;

-- 4. supplier_link_suggestions ya tiene su politica para `authenticated`;
--    solo hay que sacarle el acceso anonimo.
revoke all on table public.supplier_link_suggestions from anon;
drop policy if exists supplier_link_suggestions_anon on public.supplier_link_suggestions;

-- 5. Que ninguna tabla NUEVA vuelva a abrirse sola.
--    La migracion 20260827020000 dejo permisos por defecto que le dan todo a
--    `anon` sobre lo que se cree en el futuro. Sin esto, el problema se repite
--    con la proxima tabla que alguien agregue.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

commit;
