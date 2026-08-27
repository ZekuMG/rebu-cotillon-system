-- =====================================================================
-- La caja deja de depender del JWT de Supabase Auth. Decision de Mikkel:
-- "prefiero descartar todo lo que tenga relacion con lo de JWT asi funciona
-- correctamente todo el programa".
--
-- CONTEXTO. Las 4 RPC transaccionales llamaban a
-- private.current_rebu_transaction_actor(), que hacia `raise 42501` si no habia
-- sesion. Tres de ellas (apply_product_stock_delta, edit_sale_transaction,
-- void_sale_transaction) solo la usaban de candado: hacen `perform` y descartan
-- el resultado. La unica que usa la identidad es register_sale_transaction, que
-- pisa user_id / user_role / user_name de la venta con los datos del actor.
--
-- QUE CAMBIA:
--   1. El actor deja de ser obligatorio: devuelve NULL en vez de romper.
--      Con eso las tres funciones que solo lo usaban de candado quedan abiertas
--      sin tocarlas.
--   2. register_sale_transaction cae al vendedor que declara la app cuando no
--      hay sesion. Si la hay, sigue mandando la sesion (mas confiable).
--
-- COSTO ASUMIDO: sin sesion, el vendedor que queda en la venta es el que declara
-- el programa, no uno verificado contra Supabase Auth. En la practica es el
-- usuario con el que se inicio sesion en la app; deja de ser inmanipulable.
--
-- PENDIENTE (no incluido): marcar esas ventas como "atribucion no verificada".
-- Requiere agregar la columna Y sumarla a `allowed_sale_columns` dentro de
-- register_sale_transaction_unchecked_20260710, que es la que hace el INSERT.
-- Se dejo afuera para no meter mas superficie en el camino del dinero.
--
-- Respaldo de las definiciones previas:
--   supabase/backups/funciones-transaccionales-antes-26ago.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) El actor pasa a ser opcional.
--    Devuelve NULL cuando no hay sesion, o cuando el usuario autenticado no
--    esta vinculado a un usuario activo de Rebu. Antes rompia con 42501 en
--    los dos casos, y eso era lo que trababa la caja.
-- ---------------------------------------------------------------------
create or replace function private.current_rebu_transaction_actor()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', app_user.id,
    'role', app_user.role,
    'display_name', app_user.display_name,
    'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
  )
  into actor
  from public.app_users as app_user
  where app_user.auth_user_id = (select auth.uid())
    and app_user.is_active = true
  limit 1;

  return actor;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2) La venta se queda con el vendedor de la sesion cuando existe, y con el
--    que declara la app cuando no. Antes, sin actor, la venta habria quedado
--    sin vendedor: el coalesce es justamente para no perder ese dato.
-- ---------------------------------------------------------------------
create or replace function public.register_sale_transaction(p_sale jsonb, p_items jsonb, p_stock_deltas jsonb default '{}'::jsonb, p_client_points jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor jsonb;
  safe_sale jsonb;
begin
  actor := private.current_rebu_transaction_actor();
  perform private.lock_expected_client_points(coalesce(p_client_points, '[]'::jsonb));
  safe_sale := coalesce(p_sale, '{}'::jsonb) || jsonb_build_object(
    'user_id', coalesce(actor ->> 'id', p_sale ->> 'user_id'),
    'user_role', coalesce(actor ->> 'role', p_sale ->> 'user_role'),
    'user_name', coalesce(actor ->> 'display_name', p_sale ->> 'user_name')
  );

  return public.register_sale_transaction_unchecked_20260710(
    safe_sale,
    p_items,
    coalesce(p_stock_deltas, '{}'::jsonb),
    coalesce(p_client_points, '[]'::jsonb)
  );
end;
$function$;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK: reaplicar las definiciones de
--   supabase/backups/funciones-transaccionales-antes-26ago.sql
-- (contiene las dos funciones tal como estaban antes de este archivo).
-- =====================================================================
