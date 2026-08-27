-- =====================================================================
-- Los permisos los define la seccion de permisos de usuario de la app,
-- no la sesion de Supabase Auth.
--
-- Decision de Mikkel (26-ago-2026): "quiero que ningun permiso del programa
-- este sometido a cosas de la sesion/usuario, solo si explicitamente no esta
-- habilitado dentro de la seccion de permisos de usuario. En criollo: no me
-- prohibas ninguna accion siendo anon".
--
-- SITUACION. Cuatro RPC resuelven permisos con private.require_rebu_permission,
-- que recibe el actor devuelto por private.current_rebu_transaction_actor().
-- Desde 20260826230000 ese actor es NULL cuando no hay sesion, y entonces
-- rebu_actor_can evalua rol '' -> false -> raise 42501. Resultado: sin sesion
-- se podia cobrar en el mostrador pero NO cerrar un pedido, ni ajustar puntos,
-- ni aplicar cambios de proveedor.
--
-- QUE CAMBIA. Un solo punto: require_rebu_permission deja pasar cuando NO hay
-- actor. Cuando SI hay sesion, el comportamiento queda EXACTAMENTE igual que
-- antes: se siguen respetando `permissions_override` y el rol de app_users.
-- Es decir, no se borra el sistema de permisos: se lo deja de aplicar
-- unicamente en el caso en que la base no tiene forma de saber quien es, que es
-- justo donde antes bloqueaba de mas.
--
-- ⚠️ CONSECUENCIA ASUMIDA, EXPLICITA: sin sesion, la base ya no valida nada.
-- Quien tenga la anon key (viaja dentro del instalador publicado en GitHub)
-- puede ejecutar estas operaciones. La unica barrera pasa a ser la seccion de
-- permisos de la app (src/utils/userPermissions.js), que corre del lado del
-- cliente. Es la postura elegida a proposito.
--
-- Respaldo de las definiciones previas:
--   supabase/backups/permisos-rebu-antes-26ago.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Sin actor no se prohibe nada. Con actor, todo sigue igual.
-- ---------------------------------------------------------------------
create or replace function private.require_rebu_permission(p_actor jsonb, p_permission text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- Sin sesion de Supabase Auth la base no puede identificar al usuario, y la
  -- autoridad pasa a ser la seccion de permisos de la app. Antes esto tiraba
  -- 42501 y trababa pedidos, puntos y proveedores.
  if p_actor is null then
    return;
  end if;

  if not private.rebu_actor_can(p_actor, p_permission) then
    raise exception 'No tenés permiso para esta operación (%)', p_permission
      using errcode = '42501';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2) Y que la caja pueda llamarlas sin sesion.
-- ---------------------------------------------------------------------
grant execute on function public.save_order_with_points_once(p_operation_key text, p_action text, p_order_id uuid, p_order jsonb, p_expected_version bigint, p_stock_deltas jsonb) to anon;
grant execute on function public.register_order_sale_once(p_operation_key text, p_order_id uuid, p_sale jsonb, p_items jsonb, p_stock_deltas jsonb) to anon;
grant execute on function public.adjust_member_points_once(p_operation_key text, p_client_id bigint, p_delta bigint, p_reason text, p_entry_type text, p_earned_at timestamptz) to anon;
grant execute on function public.apply_supplier_product_updates_batch(p_action text, p_updates jsonb) to anon;

-- ---------------------------------------------------------------------
-- 3) El libro mayor de puntos tambien estaba cerrado para `anon`. Sin el, la
--    auditoria de vencimientos de puntos calculaba con el ledger VACIO y
--    despues aplicaba ese resultado. Peor que fallar: fallaba en silencio.
-- ---------------------------------------------------------------------
grant select on table public.member_point_entries to anon;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- begin;
--   -- reaplicar private.require_rebu_permission desde
--   -- supabase/backups/permisos-rebu-antes-26ago.sql
--   revoke execute on function public.save_order_with_points_once(p_operation_key text, p_action text, p_order_id uuid, p_order jsonb, p_expected_version bigint, p_stock_deltas jsonb) from anon;
--   revoke execute on function public.register_order_sale_once(p_operation_key text, p_order_id uuid, p_sale jsonb, p_items jsonb, p_stock_deltas jsonb) from anon;
--   revoke execute on function public.adjust_member_points_once(p_operation_key text, p_client_id bigint, p_delta bigint, p_reason text, p_entry_type text, p_earned_at timestamptz) from anon;
--   revoke execute on function public.apply_supplier_product_updates_batch(p_action text, p_updates jsonb) from anon;
--   revoke select on table public.member_point_entries from anon;
--   notify pgrst, 'reload schema';
-- commit;
