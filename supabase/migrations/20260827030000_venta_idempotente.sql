-- =====================================================================
-- La venta del mostrador deja de poder duplicarse.
--
-- POR QUE. `register_sale_transaction` era la unica RPC de plata SIN clave de
-- operacion. Las de pedidos (`register_order_sale_once`,
-- `save_order_with_points_once`, `adjust_member_points_once`) ya se protegen
-- con `pg_advisory_xact_lock` + busqueda en `private.rebu_operations` y
-- devuelven el resultado guardado con `_duplicate: true`. La venta comun no
-- tenia nada: cualquier repeticion del pedido creaba una venta nueva.
--
-- Escenarios reales que esto cubre, todos SIN sesion de por medio:
--   * el cajero hace doble clic en Cobrar;
--   * se corta la red despues de que la venta se guardo, el cajero ve un
--     error y vuelve a cobrar;
--   * un reintento automatico del cliente repite el POST.
--
-- COMO. Se agrega `p_operation_key text default null`. Si viene, la funcion se
-- comporta igual que las `_once`. Si NO viene, se comporta exactamente como
-- antes: asi ninguna llamada existente se rompe mientras la app se actualiza.
--
-- 🪤 Hay que DROP + CREATE, no `create or replace`: cambiar la lista de
-- argumentos crearia una segunda funcion sobrecargada y PostgREST podria
-- resolver la equivocada. Todo va en una transaccion, con lock, asi que la
-- ventana es de milisegundos.
--
-- Respaldo previo:
--   supabase/backups/register_sale_transaction-antes-idempotencia.sql
-- =====================================================================

begin;

drop function if exists public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb);

create function public.register_sale_transaction(
  p_sale jsonb,
  p_items jsonb,
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb,
  p_operation_key text default null
)
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
  clave text := nullif(trim(coalesce(p_operation_key, '')), '');
  resultado_guardado jsonb;
  resultado jsonb;
begin
  if clave is not null and length(clave) > 180 then
    raise exception 'Clave de operación inválida';
  end if;

  -- Con clave, esta venta no se puede registrar dos veces. El lock serializa
  -- los intentos simultaneos (doble clic) y la busqueda corta los repetidos.
  if clave is not null then
    perform pg_advisory_xact_lock(hashtext(clave));

    select operacion.result
    into resultado_guardado
    from private.rebu_operations as operacion
    where operacion.operation_key = clave;

    if resultado_guardado is not null then
      return resultado_guardado || jsonb_build_object('_duplicate', true);
    end if;
  end if;

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

  resultado := public.register_sale_transaction_unchecked_20260710(
    safe_sale,
    p_items,
    coalesce(p_stock_deltas, '{}'::jsonb),
    coalesce(p_client_points, '[]'::jsonb)
  );

  -- Se anota DENTRO de la misma transaccion: si la venta se revierte, la
  -- clave tampoco queda registrada, y el reintento vuelve a intentar de cero.
  if clave is not null then
    insert into private.rebu_operations(operation_key, action, order_id, actor_id, result)
    values (
      clave,
      'pos_sale',
      null,
      nullif(claimed_user_id, '')::uuid,
      resultado
    );
  end if;

  return resultado;
end;
$function$;

grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb, text) to anon;
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb, text) to service_role;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK: reaplicar
--   supabase/backups/register_sale_transaction-antes-idempotencia.sql
-- despues de un
--   drop function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb, text);
-- =====================================================================
