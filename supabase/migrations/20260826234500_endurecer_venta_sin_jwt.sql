-- =====================================================================
-- Endurecimiento posterior a 20260826230000_caja_sin_jwt.sql.
-- Sale de la auditoria del 26-ago-2026 sobre esa migracion.
--
-- Cierra tres agujeros CONFIRMADOS en produccion (probados con
-- `begin ... rollback`, sin dejar datos):
--
--   1. `authenticated` todavia podia TRUNCATE sales / sale_items / clients.
--      La migracion 20260826220000 le saco ese privilegio a `anon` y se
--      olvido de `authenticated`. Se tapo la mitad del agujero.
--
--   2. `created_at` de la venta lo elegia quien llamaba: se podian cargar
--      ventas con fecha inventada (probado: una venta quedo en 2020-01-01),
--      lo que ensucia cierres de caja, reportes por periodo y el dashboard.
--      La app NUNCA manda `created_at` en el cobro (verificado en
--      src/App.jsx, salePayload), asi que fijarlo no rompe nada.
--
--   3. `user_role` y `user_name` venian del payload sin validar: se podia
--      registrar una venta con rol 'owner' inventado. Ahora, si el
--      `user_id` corresponde a un usuario real de Rebu, el rol y el nombre
--      salen de `app_users`, no de lo que diga quien llama.
--
-- LO QUE ESTA MIGRACION NO RESUELVE (decision pendiente de Mikkel):
--   `edit_sale_transaction`, `void_sale_transaction` y
--   `apply_product_stock_delta` quedaron sin ningun control de acceso.
--   Con la anon key (que viaja dentro del instalador publicado) se pueden
--   anular y editar ventas. Aclaracion honesta: `anon` YA tenia
--   insert/update/delete directo sobre esas tablas desde antes, o sea que
--   la capacidad no es nueva — pero ahora hay una puerta mas comoda.
--   Cerrarlo de verdad exige un secreto por terminal (device token) o
--   volver a exigir sesion para anular/editar.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Nadie vacia las tablas de un saque. Ni `anon` ni `authenticated`.
--    La app nunca usa TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.
-- ---------------------------------------------------------------------
revoke truncate, references, trigger, maintain on table public.sales from authenticated;
revoke truncate, references, trigger, maintain on table public.sale_items from authenticated;
revoke truncate, references, trigger, maintain on table public.clients from authenticated;

-- ---------------------------------------------------------------------
-- 2) y 3) La fecha la pone la base, y el rol/nombre del vendedor salen de
--    `app_users` cuando el user_id es real. Si no lo es, se conserva lo que
--    mando la app para no romper el flujo (queda igual que antes).
-- ---------------------------------------------------------------------
create or replace function public.register_sale_transaction(p_sale jsonb, p_items jsonb, p_stock_deltas jsonb default '{}'::jsonb, p_client_points jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor jsonb;
  claimed_user_id text;
  known_user public.app_users%rowtype;
  safe_sale jsonb;
begin
  actor := private.current_rebu_transaction_actor();
  perform private.lock_expected_client_points(coalesce(p_client_points, '[]'::jsonb));

  -- Con sesion manda la sesion. Sin sesion, se usa el user_id que declara la
  -- app pero el rol y el nombre se buscan en app_users: asi nadie se inventa
  -- un rol 'owner' desde el payload.
  claimed_user_id := coalesce(actor ->> 'id', p_sale ->> 'user_id');

  if claimed_user_id is not null then
    select app_user.*
    into known_user
    from public.app_users as app_user
    where app_user.id::text = claimed_user_id
    limit 1;
  end if;

  safe_sale := coalesce(p_sale, '{}'::jsonb) || jsonb_build_object(
    'user_id', claimed_user_id,
    'user_role', coalesce(known_user.role, actor ->> 'role', p_sale ->> 'user_role'),
    'user_name', coalesce(known_user.display_name, actor ->> 'display_name', p_sale ->> 'user_name'),
    -- La fecha de la venta la decide la base, nunca el que llama.
    'created_at', to_jsonb(now())
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
-- ROLLBACK: reaplicar `register_sale_transaction` desde
--   supabase/migrations/20260826230000_caja_sin_jwt.sql
-- y devolver los privilegios con:
--   grant truncate, references, trigger, maintain on table public.sales to authenticated;
--   (idem sale_items y clients)
-- =====================================================================
