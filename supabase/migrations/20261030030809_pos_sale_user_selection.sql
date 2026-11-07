-- Seleccion explicita de responsable por venta; mantiene permisos e idempotencia.
begin;

CREATE OR REPLACE FUNCTION public.register_sale_transaction(p_sale jsonb, p_items jsonb, p_stock_deltas jsonb DEFAULT '{}'::jsonb, p_client_points jsonb DEFAULT '[]'::jsonb, p_operation_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor jsonb;
  claimed_user_id text;
  known_user public.app_users%rowtype;
  safe_sale jsonb;
  clave text := nullif(trim(coalesce(p_operation_key, '')), '');
  resultado_guardado jsonb;
  resultado jsonb;
begin
  perform private.require_rebu_permission(private.current_rebu_transaction_actor(), 'pos.view');
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

  -- La seleccion del POS es atribucion comercial. Los permisos siguen
  -- comprobando al operador autenticado, nunca al usuario seleccionado.
  -- Los clientes anteriores conservan la atribucion de sesion.
  if p_sale ? 'pos_user_id' then
    claimed_user_id := nullif(trim(p_sale ->> 'pos_user_id'), '');
    if claimed_user_id is null then
      raise exception using errcode = '22023', message = 'Elegí un usuario para registrar esta venta.';
    end if;
  else
    claimed_user_id := coalesce(actor ->> 'id', p_sale ->> 'user_id');
  end if;

  if claimed_user_id is not null then
    select app_user.*
    into known_user
    from public.app_users as app_user
    where app_user.id::text = claimed_user_id
    for share;
  end if;

  if p_sale ? 'pos_user_id' and (known_user.id is null or known_user.is_active is not true) then
    raise exception using errcode = '22023', message = 'El usuario de la venta no existe o está inactivo.';
  end if;

  safe_sale := (coalesce(p_sale, '{}'::jsonb) - 'pos_user_id') || jsonb_build_object(
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
      nullif(coalesce(actor ->> 'id', claimed_user_id), '')::uuid,
      resultado
    );
  end if;

  return resultado;
end;
$function$;

notify pgrst, 'reload schema';
commit;
