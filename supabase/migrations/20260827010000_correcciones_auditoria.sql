-- =====================================================================
-- Correcciones que salieron de la auditoria de 20260827000000.
-- Generado a partir de las definiciones VIVAS de produccion, para que el
-- resto del cuerpo quede byte a byte igual. Respaldo previo en
-- supabase/backups/pedidos-presupuestos-antes-27ago.sql
--
--   1. BLOQUEANTE: register_order_sale_once pisaba user_id/user_role/user_name
--      con el actor, que ahora es NULL sin sesion => toda venta cerrada desde
--      un pedido quedaba SIN VENDEDOR. Ahora cae al que declara la app, y
--      register_sale_transaction igual valida el rol contra app_users.
--   2. create_whatsapp_budget_once tiene el chequeo de permiso copiado inline
--      (no usa require_rebu_permission), asi que se quedo afuera del cambio y
--      fallaba sin sesion. Se le da el mismo trato.
--   3. current_rebu_transaction_actor devolvia NULL en dos casos distintos:
--      "no hay sesion" (correcto que pase) y "hay sesion pero el usuario esta
--      desactivado o no existe" (NO debe pasar). Ahora el segundo devuelve un
--      actor sin rol y vuelve a bloquear: desactivar un usuario sirve de nuevo.
-- =====================================================================

begin;

CREATE OR REPLACE FUNCTION private.current_rebu_transaction_actor()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Hay sesion pero no hay usuario activo detras: la base SI sabe, y app_users
  -- dijo que no. Se devuelve un actor sin rol (no NULL) para que
  -- require_rebu_permission siga bloqueando: desactivar un usuario debe frenarlo.
  if actor is null then
    return '{"role":""}'::jsonb;
  end if;

  return actor;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_order_sale_once(p_operation_key text, p_order_id uuid, p_sale jsonb, p_items jsonb, p_stock_deltas jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor jsonb;
  source_order public.orders%rowtype;
  stored_result jsonb;
  sale_result jsonb;
  existing_sale_id text;
  expected_points bigint;
begin
  if coalesce(trim(p_operation_key), '') = '' or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if jsonb_typeof(coalesce(p_sale, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_stock_deltas, '{}'::jsonb)) <> 'object' then
    raise exception 'Datos de venta del pedido inválidos';
  end if;

  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'orders.registerPayment');
  perform pg_advisory_xact_lock(hashtext(trim(p_operation_key)));

  select result into stored_result from private.rebu_operations
  where operation_key = trim(p_operation_key);
  if stored_result is not null then
    return stored_result || jsonb_build_object('_duplicate', true);
  end if;

  select * into source_order from public.orders where id = p_order_id for update;
  if source_order.id is null then raise exception 'Pedido inexistente'; end if;

  select id::text into existing_sale_id
  from public.sales where order_id = p_order_id limit 1;
  if existing_sale_id is not null then
    stored_result := jsonb_build_object('id', existing_sale_id, 'order_id', p_order_id, '_duplicate', true);
    insert into private.rebu_operations(operation_key, action, order_id, actor_id, result)
    values (trim(p_operation_key), 'order_sale', p_order_id, nullif(actor ->> 'id', '')::uuid, stored_result);
    return stored_result;
  end if;

  if source_order.is_active is false or lower(coalesce(source_order.status, '')) = 'cancelado'
     or source_order.total_amount <= 0 or source_order.paid_total < source_order.total_amount then
    raise exception 'El pedido no está totalmente pagado o ya no está activo';
  end if;
  if source_order.points_accounting_mode <> 'incremental' then
    raise exception 'El pedido todavía usa contabilidad legacy de puntos';
  end if;

  expected_points := private.order_eligible_points(
    source_order.member_id, source_order.paid_total, source_order.total_amount,
    source_order.status, source_order.is_active, false
  );
  if source_order.points_credited <> expected_points then
    raise exception 'Los puntos del pedido no están conciliados';
  end if;

  sale_result := public.register_sale_transaction(
    coalesce(p_sale, '{}'::jsonb) || jsonb_build_object(
      'client_id', source_order.member_id,
      'points_earned', 0,
      'points_spent', 0,
      'user_id', coalesce(actor ->> 'id', p_sale ->> 'user_id'),
      'user_role', coalesce(actor ->> 'role', p_sale ->> 'user_role'),
      'user_name', coalesce(actor ->> 'display_name', p_sale ->> 'user_name'),
      'status', 'completed'
    ),
    p_items,
    coalesce(p_stock_deltas, '{}'::jsonb),
    '[]'::jsonb
  );

  update public.sales
  set order_id = p_order_id, points_source = 'order', points_earned = 0, points_spent = 0
  where id::text = sale_result ->> 'id';
  if not found then raise exception 'No se pudo enlazar la venta con el pedido'; end if;

  stored_result := sale_result || jsonb_build_object(
    'order_id', p_order_id, 'points_source', 'order', '_duplicate', false
  );
  insert into private.rebu_operations(operation_key, action, order_id, actor_id, result)
  values (trim(p_operation_key), 'order_sale', p_order_id, nullif(actor ->> 'id', '')::uuid, stored_result);
  return stored_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_whatsapp_budget_once(p_operation_key text, p_budget jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor jsonb;
  normalized public.budgets%rowtype;
  created public.budgets%rowtype;
  actor_role text;
  permission_override jsonb;
  can_approve boolean;
begin
  if coalesce(trim(p_operation_key), '') = ''
     or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if jsonb_typeof(coalesce(p_budget, '{}'::jsonb)) <> 'object' then
    raise exception 'Presupuesto inválido';
  end if;
  if jsonb_typeof(coalesce(p_budget -> 'items_snapshot', '[]'::jsonb)) <> 'array' then
    raise exception 'Productos del presupuesto inválidos';
  end if;
  if coalesce((p_budget ->> 'total_amount')::numeric, 0) < 0 then
    raise exception 'Total del presupuesto inválido';
  end if;

  actor := private.current_rebu_transaction_actor();
  actor_role := lower(coalesce(actor ->> 'role', ''));
  permission_override := coalesce(actor -> 'permissions_override', '{}'::jsonb);
  can_approve := case
    when actor is null then true
    when permission_override ? 'whatsapp.budget.approve'
      then coalesce((permission_override ->> 'whatsapp.budget.approve')::boolean, false)
    else actor_role in ('system', 'sistema', 'owner', 'dueño', 'dueno', 'admin')
  end;

  if not can_approve then
    raise exception 'No tenés permiso para aprobar presupuestos de WhatsApp'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_operation_key)));

  select *
  into created
  from public.budgets
  where whatsapp_operation_key = trim(p_operation_key)
  limit 1;

  if created.id is not null then
    return to_jsonb(created) || jsonb_build_object('duplicate', true);
  end if;

  normalized := jsonb_populate_record(
    null::public.budgets,
    coalesce(p_budget, '{}'::jsonb) || jsonb_build_object(
      'whatsapp_operation_key', trim(p_operation_key),
      'is_active', true
    )
  );

  insert into public.budgets (
    member_id,
    customer_name,
    customer_phone,
    customer_note,
    document_title,
    event_label,
    payment_method,
    payment_breakdown,
    installments,
    items_snapshot,
    total_amount,
    is_active,
    whatsapp_operation_key
  ) values (
    normalized.member_id,
    coalesce(normalized.customer_name, ''),
    coalesce(normalized.customer_phone, ''),
    coalesce(normalized.customer_note, ''),
    coalesce(normalized.document_title, 'PRESUPUESTO'),
    coalesce(normalized.event_label, ''),
    coalesce(normalized.payment_method, 'Efectivo'),
    normalized.payment_breakdown,
    coalesce(normalized.installments, 1),
    coalesce(normalized.items_snapshot, '[]'::jsonb),
    coalesce(normalized.total_amount, 0),
    true,
    trim(p_operation_key)
  )
  returning * into created;

  return to_jsonb(created) || jsonb_build_object('duplicate', false);
end;
$function$
;

grant execute on function public.create_whatsapp_budget_once(p_operation_key text, p_budget jsonb) to anon;

notify pgrst, 'reload schema';

commit;
