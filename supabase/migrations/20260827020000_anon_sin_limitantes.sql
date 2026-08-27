-- =====================================================================
-- `anon` deja de tener limitaciones frente a `authenticated`.
--
-- Decision de Mikkel (26-ago-2026): "fijate que anon pueda hacer TODO, sin
-- limitantes". Viene de que, sin sesion, EDITAR UN PRODUCTO fallaba con
-- "Fallo al guardar los cambios": `products` solo daba escritura a
-- `authenticated`, y ademas tiene RLS con politica exclusiva para ese rol.
--
-- Es el mismo problema que ya aparecio con los pedidos: liberar las funciones
-- no alcanzaba, porque las TABLAS seguian cerradas.
--
-- RELEVAMIENTO PREVIO (medido, no estimado):
--   * 8 de 25 tablas de `public` tenian permisos que `anon` no: products,
--     member_point_entries, logs_search_summary, web_catalog_categories,
--     web_catalog_events, web_catalog_images, web_catalog_product_categories,
--     web_catalog_products.
--   * 8 funciones ejecutables por `authenticated` y no por `anon`.
--   * 8 tablas con RLS activo: un GRANT solo no alcanza, hace falta politica.
--
-- ⚠️ CONSECUENCIA ASUMIDA: la anon key viaja dentro del instalador publicado.
-- A partir de aca, quien la tenga puede leer y escribir todo el esquema
-- `public`, incluido el catalogo web. La unica barrera es la seccion de
-- permisos de la app. Es la postura elegida a proposito.
--
-- UNICA EXCEPCION, deliberada: se mantiene TRUNCATE revocado sobre sales,
-- sale_items y clients. La app NUNCA usa TRUNCATE, asi que no puede bloquear
-- ninguna accion del programa; lo unico que hace es evitar que un descuido
-- borre el historial de ventas entero de un saque. Si se quiere sacar tambien:
--   grant truncate on public.sales, public.sale_items, public.clients to anon;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Todo el esquema public, al alcance de anon.
-- ---------------------------------------------------------------------
grant usage on schema public to anon;
grant all privileges on all tables in schema public to anon;
grant all privileges on all sequences in schema public to anon;
grant execute on all functions in schema public to anon;

-- ---------------------------------------------------------------------
-- 2) Y que lo de mañana tambien nazca abierto, para no repetir esto.
-- ---------------------------------------------------------------------
alter default privileges in schema public grant all privileges on tables to anon;
alter default privileges in schema public grant all privileges on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;

-- ---------------------------------------------------------------------
-- 3) RLS: con GRANT no alcanza. Cada tabla con RLS activo necesita una
--    politica que deje pasar a anon, si no sigue bloqueando igual.
--    Se recorre el catalogo en vez de listarlas a mano, para que no se
--    escape ninguna ni ahora ni cuando se agregue una tabla nueva.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = t.relname
        and policyname = 'rebu_anon_sin_limitantes'
    ) then
      execute format(
        'create policy rebu_anon_sin_limitantes on public.%I for all to anon using (true) with check (true)',
        t.relname
      );
      raise notice 'politica creada en %', t.relname;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Excepcion deliberada (ver cabecera): vaciar de un saque las tablas de
--    plata no es una accion del programa.
-- ---------------------------------------------------------------------
revoke truncate on table public.sales from anon;
revoke truncate on table public.sale_items from anon;
revoke truncate on table public.clients from anon;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- begin;
--   do $$ declare t record; begin
--     for t in select tablename from pg_policies
--              where schemaname='public' and policyname='rebu_anon_sin_limitantes'
--     loop execute format('drop policy rebu_anon_sin_limitantes on public.%I', t.tablename); end loop;
--   end $$;
--   alter default privileges in schema public revoke all privileges on tables from anon;
--   alter default privileges in schema public revoke all privileges on sequences from anon;
--   alter default privileges in schema public revoke execute on functions from anon;
--   -- y volver a aplicar los grants originales tabla por tabla desde las
--   -- migraciones previas (20260823190314_web_catalog_editor.sql, etc.)
-- commit;
