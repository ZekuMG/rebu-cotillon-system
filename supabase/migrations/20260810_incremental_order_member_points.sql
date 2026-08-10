begin;

create schema if not exists private;
revoke all on schema private from public;

-- The order owns points only after it has been touched by the new RPC. Historical
-- completed orders stay in legacy mode because their sale already credited points.
alter table public.orders
  add column if not exists points_credited bigint not null default 0,
  add column if not exists points_accounting_mode text not null default 'legacy',
  add column if not exists version bigint not null default 1;

alter table public.orders
  drop constraint if exists orders_points_credited_nonnegative,
  add constraint orders_points_credited_nonnegative check (points_credited >= 0),
  drop constraint if exists orders_points_accounting_mode_check,
  add constraint orders_points_accounting_mode_check
    check (points_accounting_mode in ('legacy', 'incremental')),
  drop constraint if exists orders_version_positive,
  add constraint orders_version_positive check (version >= 1);

comment on column public.orders.points_credited is
  'Points already owned by this order. Updated only by save_order_with_points_once.';
comment on column public.orders.points_accounting_mode is
  'legacy: the final sale owns points; incremental: payments on the order own points.';
comment on column public.orders.version is
  'Optimistic concurrency version used by order RPCs.';

-- Baseline completed historical orders without changing any client balance.
update public.orders
set points_credited = floor(
      least(greatest(coalesce(paid_total, 0), 0), greatest(coalesce(total_amount, 0), 0)) / 500
    )::bigint,
    points_accounting_mode = 'legacy'
where member_id is not null
  and is_active is true
  and lower(coalesce(status, '')) <> 'cancelado'
  and coalesce(total_amount, 0) > 0
  and coalesce(paid_total, 0) >= coalesce(total_amount, 0)
  and coalesce(points_credited, 0) = 0;

-- If an earlier draft of this change was installed, remove its unsafe trigger.
drop trigger if exists sync_order_member_points_trigger on public.orders;
drop function if exists private.sync_order_member_points();

alter table public.sales
  add column if not exists order_id uuid null references public.orders (id) on delete set null,
  add column if not exists points_source text not null default 'sale';

alter table public.sales
  drop constraint if exists sales_points_source_check,
  add constraint sales_points_source_check check (points_source in ('sale', 'order'));

comment on column public.sales.order_id is
  'Order that originated the sale. At most one sale can exist for an order.';
comment on column public.sales.points_source is
  'sale when sale lifecycle owns points; order when payment ledger owns them.';

-- Recover links written in logs by previous desktop versions. Those sales remain
-- points_source=sale because their points were credited by the legacy sale flow.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'logs' and column_name = 'details'
  ) then
    with log_values as materialized (
      select
        case
          when coalesce(to_jsonb(l.details) ->> 'orderId', '')
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (to_jsonb(l.details) ->> 'orderId')::uuid
          else null
        end as order_id,
        to_jsonb(l.details) ->> 'transactionId' as sale_id,
        l.created_at,
        l.id
      from public.logs l
      where jsonb_typeof(to_jsonb(l.details)) = 'object'
    ),
    candidates as (
      select distinct on (order_id) order_id, sale_id
      from log_values
      where order_id is not null and coalesce(sale_id, '') <> ''
      order by order_id, created_at desc, id desc
    )
    update public.sales s
    set order_id = c.order_id,
        points_source = 'sale'
    from candidates c
    where s.id::text = c.sale_id
      and s.order_id is null;
  end if;
end
$$;

-- Keep the newest link if historical logs revealed duplicates, then enforce the
-- invariant for every new finalization.
with ranked as (
  select id,
         row_number() over (partition by order_id order by created_at desc, id::text desc) as position
  from public.sales
  where order_id is not null
)
update public.sales s
set order_id = null
from ranked r
where s.id = r.id and r.position > 1;

create unique index if not exists sales_order_id_unique_idx
  on public.sales (order_id)
  where order_id is not null;

create table if not exists public.member_point_entries (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.clients (id) on delete restrict,
  order_id uuid null references public.orders (id) on delete set null,
  sale_id text null,
  operation_key text not null,
  entry_type text not null,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  earned_at timestamptz not null default now(),
  reason text not null default '',
  actor_id uuid null references public.app_users (id) on delete set null,
  actor_name text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (operation_key, client_id)
);

create index if not exists member_point_entries_client_earned_idx
  on public.member_point_entries (client_id, earned_at, id);
create index if not exists member_point_entries_order_idx
  on public.member_point_entries (order_id, created_at)
  where order_id is not null;

comment on table public.member_point_entries is
  'Immutable audit ledger for member point credits, reversals, adjustments and expirations.';

create table if not exists private.rebu_operations (
  operation_key text primary key,
  action text not null,
  order_id uuid null,
  actor_id uuid null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on table private.rebu_operations from public, anon, authenticated;

create or replace function private.rebu_actor_can(
  p_actor jsonb,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text := lower(coalesce(p_actor ->> 'role', ''));
  overrides jsonb := coalesce(p_actor -> 'permissions_override', '{}'::jsonb);
begin
  if overrides ? p_permission then
    return coalesce((overrides ->> p_permission)::boolean, false);
  end if;

  if actor_role in ('system', 'sistema', 'owner', 'dueño', 'dueno', 'admin') then
    return true;
  end if;

  if actor_role = 'seller' then
    return p_permission = any(array[
      'orders.createOrder',
      'orders.editOrder',
      'orders.cancelOrder',
      'orders.deleteOrder',
      'orders.markRetired',
      'orders.registerPayment',
      'clients.edit'
    ]);
  end if;

  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

create or replace function private.require_rebu_permission(
  p_actor jsonb,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.rebu_actor_can(p_actor, p_permission) then
    raise exception 'No tenés permiso para esta operación (%)', p_permission
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.order_eligible_points(
  p_member_id bigint,
  p_paid_total numeric,
  p_total_amount numeric,
  p_status text,
  p_is_active boolean,
  p_keep_cancelled_payment boolean default false
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_member_id is null or p_is_active is false then 0::bigint
    when lower(coalesce(p_status, '')) = 'cancelado' and not p_keep_cancelled_payment then 0::bigint
    else floor(
      least(greatest(coalesce(p_paid_total, 0), 0), greatest(coalesce(p_total_amount, 0), 0)) / 500
    )::bigint
  end;
$$;

create or replace function private.post_member_point_delta(
  p_client_id bigint,
  p_order_id uuid,
  p_sale_id text,
  p_operation_key text,
  p_entry_type text,
  p_delta bigint,
  p_reason text,
  p_actor jsonb,
  p_earned_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_balance bigint;
  next_balance bigint;
begin
  if p_delta = 0 then
    select coalesce(points, 0)::bigint into current_balance
    from public.clients where id = p_client_id;
    return current_balance;
  end if;

  select coalesce(points, 0)::bigint
  into current_balance
  from public.clients
  where id = p_client_id and is_active is true
  for update;

  if not found then
    raise exception 'Socio inexistente o inactivo';
  end if;

  next_balance := current_balance + p_delta;
  if next_balance < 0 then
    raise exception 'El socio no tiene puntos suficientes para revertir esta operación. Saldo: %, reversión: %',
      current_balance, abs(p_delta)
      using errcode = '23514';
  end if;

  update public.clients set points = next_balance where id = p_client_id;

  insert into public.member_point_entries (
    client_id, order_id, sale_id, operation_key, entry_type, delta,
    balance_after, earned_at, reason, actor_id, actor_name, metadata
  ) values (
    p_client_id, p_order_id, p_sale_id, p_operation_key, p_entry_type, p_delta,
    next_balance, coalesce(p_earned_at, now()), coalesce(p_reason, ''),
    nullif(p_actor ->> 'id', '')::uuid, p_actor ->> 'display_name', coalesce(p_metadata, '{}'::jsonb)
  );

  return next_balance;
end;
$$;

revoke all on function private.rebu_actor_can(jsonb, text) from public, anon, authenticated;
revoke all on function private.require_rebu_permission(jsonb, text) from public, anon, authenticated;
revoke all on function private.order_eligible_points(bigint, numeric, numeric, text, boolean, boolean) from public, anon, authenticated;
revoke all on function private.post_member_point_delta(bigint, uuid, text, text, text, bigint, text, jsonb, timestamptz, jsonb) from public, anon, authenticated;

create or replace function public.save_order_with_points_once(
  p_operation_key text,
  p_action text,
  p_order_id uuid default null,
  p_order jsonb default '{}'::jsonb,
  p_expected_version bigint default null,
  p_stock_deltas jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  permission_key text;
  action_name text := lower(trim(coalesce(p_action, '')));
  old_order public.orders%rowtype;
  next_order public.orders%rowtype;
  stored_result jsonb;
  old_points bigint := 0;
  next_points bigint := 0;
  old_member bigint;
  next_member bigint;
  points_delta bigint := 0;
  preserve_legacy_sale_points boolean := false;
  keep_cancelled_payment boolean := false;
  point_entry_type text;
  allowed_keys constant text[] := array[
    'budget_id', 'member_id', 'customer_name', 'customer_phone', 'customer_note',
    'document_title', 'event_label', 'payment_method', 'payment_breakdown',
    'installments', 'items_snapshot', 'total_amount', 'deposit_amount',
    'paid_total', 'remaining_amount', 'pickup_date', 'status', 'is_active'
  ];
  unknown_key text;
  linked_sale_id text;
  linked_sale_points_source text;
  linked_sale_client_id bigint;
  linked_sale_points_earned bigint;
  linked_sale_points_spent bigint;
  linked_client_current_points bigint;
  linked_client_next_points bigint;
  linked_client_updates jsonb := '[]'::jsonb;
  effective_stock_deltas jsonb;
begin
  if coalesce(trim(p_operation_key), '') = '' or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if jsonb_typeof(coalesce(p_order, '{}'::jsonb)) <> 'object' then
    raise exception 'Pedido inválido';
  end if;
  if jsonb_typeof(coalesce(p_stock_deltas, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid stock adjustments';
  end if;
  if action_name <> all(array['create', 'edit', 'deposit', 'payment', 'cancel_keep_deposit', 'cancel_refund', 'retire', 'delete']) then
    raise exception 'Acción de pedido inválida (%)', action_name;
  end if;

  select key into unknown_key
  from jsonb_object_keys(coalesce(p_order, '{}'::jsonb)) as keys(key)
  where not (key = any(allowed_keys))
  limit 1;
  if unknown_key is not null then
    raise exception 'Campo de pedido no permitido (%)', unknown_key;
  end if;

  actor := private.current_rebu_transaction_actor();
  permission_key := case action_name
    when 'create' then 'orders.createOrder'
    when 'edit' then 'orders.editOrder'
    when 'deposit' then 'orders.registerPayment'
    when 'payment' then 'orders.registerPayment'
    when 'cancel_keep_deposit' then 'orders.cancelOrder'
    when 'cancel_refund' then 'orders.cancelOrder'
    when 'retire' then 'orders.markRetired'
    when 'delete' then 'orders.deleteOrder'
  end;
  perform private.require_rebu_permission(actor, permission_key);

  perform pg_advisory_xact_lock(hashtext(trim(p_operation_key)));
  select result into stored_result
  from private.rebu_operations
  where operation_key = trim(p_operation_key);
  if stored_result is not null then
    return stored_result || jsonb_build_object('_duplicate', true);
  end if;

  if action_name = 'create' then
    if p_order_id is not null then
      raise exception 'Un pedido nuevo no debe incluir id';
    end if;
    if p_order ? 'budget_id' and nullif(p_order ->> 'budget_id', '') is not null then
      perform pg_advisory_xact_lock(hashtext('budget:' || (p_order ->> 'budget_id')));
      select * into old_order
      from public.orders
      where budget_id = (p_order ->> 'budget_id')::uuid and is_active is true
      order by created_at desc
      limit 1
      for update;
      if old_order.id is not null then
        stored_result := to_jsonb(old_order) || jsonb_build_object(
          '_duplicate', true, '_points_delta', 0, '_points_managed', old_order.points_accounting_mode = 'incremental'
        );
        insert into private.rebu_operations(operation_key, action, order_id, actor_id, result)
        values (trim(p_operation_key), action_name, old_order.id, nullif(actor ->> 'id', '')::uuid, stored_result);
        return stored_result;
      end if;
    end if;

    next_order := jsonb_populate_record(null::public.orders, p_order);
    next_order.id := gen_random_uuid();
    next_order.customer_name := coalesce(next_order.customer_name, '');
    next_order.customer_phone := coalesce(next_order.customer_phone, '');
    next_order.customer_note := coalesce(next_order.customer_note, '');
    next_order.document_title := coalesce(next_order.document_title, 'PEDIDO');
    next_order.event_label := coalesce(next_order.event_label, '');
    next_order.installments := coalesce(next_order.installments, 0);
    next_order.items_snapshot := coalesce(next_order.items_snapshot, '[]'::jsonb);
    next_order.total_amount := coalesce(next_order.total_amount, 0);
    next_order.deposit_amount := coalesce(next_order.deposit_amount, 0);
    next_order.paid_total := coalesce(next_order.paid_total, 0);
    next_order.status := coalesce(next_order.status, 'Pendiente');
    next_order.is_active := coalesce(next_order.is_active, true);
    next_order.created_at := now();
    next_order.version := 1;
    next_order.points_accounting_mode := 'incremental';
  else
    if p_order_id is null then
      raise exception 'Falta el id del pedido';
    end if;

    select * into old_order from public.orders where id = p_order_id for update;
    if old_order.id is null then
      raise exception 'Pedido inexistente';
    end if;
    if p_expected_version is not null and old_order.version <> p_expected_version then
      raise exception 'El pedido cambió en otra caja. Recargá e intentá nuevamente.'
        using errcode = '40001';
    end if;

    if action_name in ('edit', 'deposit', 'payment') and exists (
      select 1 from public.sales
      where order_id = old_order.id
    ) then
      raise exception 'A finalized order cannot be edited; cancel it and create a new one';
    end if;

    next_order := old_order;
    if p_order ? 'budget_id' then next_order.budget_id := nullif(p_order ->> 'budget_id', '')::uuid; end if;
    if p_order ? 'member_id' then next_order.member_id := nullif(p_order ->> 'member_id', '')::bigint; end if;
    if p_order ? 'customer_name' then next_order.customer_name := coalesce(p_order ->> 'customer_name', ''); end if;
    if p_order ? 'customer_phone' then next_order.customer_phone := coalesce(p_order ->> 'customer_phone', ''); end if;
    if p_order ? 'customer_note' then next_order.customer_note := coalesce(p_order ->> 'customer_note', ''); end if;
    if p_order ? 'document_title' then next_order.document_title := coalesce(p_order ->> 'document_title', 'PEDIDO'); end if;
    if p_order ? 'event_label' then next_order.event_label := coalesce(p_order ->> 'event_label', ''); end if;
    if p_order ? 'payment_method' then next_order.payment_method := p_order ->> 'payment_method'; end if;
    if p_order ? 'payment_breakdown' then next_order.payment_breakdown := p_order -> 'payment_breakdown'; end if;
    if p_order ? 'installments' then next_order.installments := coalesce((p_order ->> 'installments')::integer, 0); end if;
    if p_order ? 'items_snapshot' then next_order.items_snapshot := coalesce(p_order -> 'items_snapshot', '[]'::jsonb); end if;
    if p_order ? 'total_amount' then next_order.total_amount := coalesce((p_order ->> 'total_amount')::numeric, 0); end if;
    if p_order ? 'deposit_amount' then next_order.deposit_amount := coalesce((p_order ->> 'deposit_amount')::numeric, 0); end if;
    if p_order ? 'paid_total' then next_order.paid_total := coalesce((p_order ->> 'paid_total')::numeric, 0); end if;
    if p_order ? 'pickup_date' then next_order.pickup_date := nullif(p_order ->> 'pickup_date', '')::date; end if;
    if p_order ? 'status' then next_order.status := coalesce(p_order ->> 'status', old_order.status); end if;
    if p_order ? 'is_active' then next_order.is_active := coalesce((p_order ->> 'is_active')::boolean, old_order.is_active); end if;

    if action_name = 'retire' then next_order.status := 'Retirado'; end if;
    if action_name in ('cancel_keep_deposit', 'cancel_refund') then next_order.status := 'Cancelado'; end if;
    if action_name = 'delete' then next_order.is_active := false; end if;
    next_order.version := old_order.version + 1;
  end if;

  if next_order.total_amount < 0 or next_order.paid_total < 0
     or next_order.deposit_amount < 0 or next_order.paid_total > next_order.total_amount
     or next_order.deposit_amount > next_order.paid_total then
    raise exception 'Importes del pedido inválidos';
  end if;
  if jsonb_typeof(coalesce(next_order.items_snapshot, '[]'::jsonb)) <> 'array' then
    raise exception 'Productos del pedido inválidos';
  end if;
  if next_order.payment_breakdown is not null
     and jsonb_typeof(next_order.payment_breakdown) <> 'array' then
    raise exception 'Historial de pagos inválido';
  end if;
  if action_name = 'payment' and next_order.paid_total <= old_order.paid_total then
    raise exception 'El pago debe aumentar el total abonado';
  end if;

  next_order.remaining_amount := case
    when lower(coalesce(next_order.status, '')) = 'cancelado' then 0
    else greatest(next_order.total_amount - next_order.paid_total, 0)
  end;

  old_member := case when action_name = 'create' then null else old_order.member_id end;
  next_member := next_order.member_id;
  old_points := case when action_name = 'create' then 0 else greatest(coalesce(old_order.points_credited, 0), 0) end;
  keep_cancelled_payment := action_name = 'cancel_keep_deposit';
  preserve_legacy_sale_points := action_name <> 'create'
    and old_order.points_accounting_mode = 'legacy'
    and old_order.total_amount > 0
    and old_order.paid_total >= old_order.total_amount;

  if preserve_legacy_sale_points then
    next_points := old_points;
    next_order.points_accounting_mode := 'legacy';
  else
    next_points := private.order_eligible_points(
      next_member, next_order.paid_total, next_order.total_amount,
      next_order.status, next_order.is_active, keep_cancelled_payment
    );
    next_order.points_accounting_mode := 'incremental';
  end if;
  next_order.points_credited := next_points;

  -- Insert first so ledger rows can safely reference a newly-created order.
  if action_name = 'create' then
    insert into public.orders (
      id, budget_id, member_id, customer_name, customer_phone, customer_note,
      document_title, event_label, payment_method, payment_breakdown, installments,
      items_snapshot, total_amount, deposit_amount, paid_total, points_credited,
      points_accounting_mode, remaining_amount, pickup_date, status, is_active,
      created_at, version
    ) values (
      next_order.id, next_order.budget_id, next_order.member_id, next_order.customer_name,
      next_order.customer_phone, next_order.customer_note, next_order.document_title,
      next_order.event_label, next_order.payment_method, next_order.payment_breakdown,
      next_order.installments, next_order.items_snapshot, next_order.total_amount,
      next_order.deposit_amount, next_order.paid_total, next_order.points_credited,
      next_order.points_accounting_mode, next_order.remaining_amount, next_order.pickup_date,
      next_order.status, next_order.is_active, next_order.created_at, next_order.version
    ) returning * into next_order;
  end if;

  if old_member is distinct from next_member then
    if old_member is not null and old_points > 0 and not preserve_legacy_sale_points then
      perform private.post_member_point_delta(
        old_member, coalesce(old_order.id, next_order.id), null, trim(p_operation_key) || ':from',
        'order_member_transfer', -old_points, 'Transferencia de socio del pedido', actor,
        now(), jsonb_build_object('action', action_name)
      );
    end if;
    if next_member is not null and next_points > 0 and not preserve_legacy_sale_points then
      perform private.post_member_point_delta(
        next_member, next_order.id, null, trim(p_operation_key) || ':to',
        'order_member_transfer', next_points, 'Transferencia de socio del pedido', actor,
        now(), jsonb_build_object('action', action_name)
      );
    end if;
    points_delta := next_points - old_points;
  else
    points_delta := next_points - old_points;
    if next_member is not null and points_delta <> 0 and not preserve_legacy_sale_points then
      point_entry_type := case
        when points_delta > 0 then 'order_payment'
        when action_name like 'cancel_%' then 'order_cancellation'
        when action_name = 'delete' then 'order_deletion'
        else 'order_correction'
      end;
      perform private.post_member_point_delta(
        next_member, next_order.id, null, trim(p_operation_key), point_entry_type,
        points_delta,
        case when points_delta > 0 then 'Puntos por pagos acumulados del pedido' else 'Reversión de puntos del pedido' end,
        actor, now(),
        jsonb_build_object('action', action_name, 'paid_total', next_order.paid_total, 'total_amount', next_order.total_amount)
      );
    end if;
  end if;

  if action_name <> 'create' then
    update public.orders set
      budget_id = next_order.budget_id,
      member_id = next_order.member_id,
      customer_name = next_order.customer_name,
      customer_phone = next_order.customer_phone,
      customer_note = next_order.customer_note,
      document_title = next_order.document_title,
      event_label = next_order.event_label,
      payment_method = next_order.payment_method,
      payment_breakdown = next_order.payment_breakdown,
      installments = next_order.installments,
      items_snapshot = next_order.items_snapshot,
      total_amount = next_order.total_amount,
      deposit_amount = next_order.deposit_amount,
      paid_total = next_order.paid_total,
      points_credited = next_order.points_credited,
      points_accounting_mode = next_order.points_accounting_mode,
      remaining_amount = next_order.remaining_amount,
      pickup_date = next_order.pickup_date,
      status = next_order.status,
      is_active = next_order.is_active,
      version = next_order.version
    where id = next_order.id
    returning * into next_order;
  end if;

  -- Order-owned sales must be voided together with the order so stock and points
  -- cannot diverge across two independent operations.
  if action_name in ('cancel_keep_deposit', 'cancel_refund', 'delete') then
    select id::text, points_source, client_id, coalesce(points_earned, 0), coalesce(points_spent, 0)
    into linked_sale_id, linked_sale_points_source, linked_sale_client_id,
         linked_sale_points_earned, linked_sale_points_spent
    from public.sales
    where order_id = next_order.id
      and coalesce(status, 'completed') = 'completed'
    limit 1
    for update;

    if linked_sale_id is not null then
      linked_client_updates := '[]'::jsonb;
      if linked_sale_points_source = 'sale' and linked_sale_client_id is not null then
        select coalesce(points, 0)::bigint into linked_client_current_points
        from public.clients
        where id = linked_sale_client_id
        for update;
        linked_client_next_points := linked_client_current_points
          - linked_sale_points_earned + linked_sale_points_spent;
        if linked_client_next_points < 0 then
          raise exception 'The member does not have enough points to void the legacy order sale';
        end if;
        linked_client_updates := jsonb_build_array(jsonb_build_object(
          'client_id', linked_sale_client_id::text,
          'points', linked_client_next_points,
          'expected_points', linked_client_current_points
        ));
      end if;

      effective_stock_deltas := coalesce(p_stock_deltas, '{}'::jsonb);
      if effective_stock_deltas = '{}'::jsonb then
        select coalesce(jsonb_object_agg(grouped.product_id, grouped.quantity), '{}'::jsonb)
        into effective_stock_deltas
        from (
          select product_id::text as product_id, sum(coalesce(quantity, 0)) as quantity
          from public.sale_items
          where sale_id::text = linked_sale_id and product_id is not null
          group by product_id::text
        ) as grouped;
      end if;
      perform public.void_sale_transaction(
        linked_sale_id,
        now(),
        effective_stock_deltas,
        linked_client_updates
      );

      if linked_sale_points_source = 'sale' then
        update public.orders
        set points_credited = 0
        where id = next_order.id
        returning * into next_order;
        points_delta := -old_points;
      end if;
    elsif preserve_legacy_sale_points then
      raise exception 'The historical order sale is not linked; reconcile it before cancelling the order';
    end if;
  end if;

  stored_result := to_jsonb(next_order) || jsonb_build_object(
    '_duplicate', false,
    '_points_delta', points_delta,
    '_points_managed', next_order.points_accounting_mode = 'incremental'
  );
  insert into private.rebu_operations(operation_key, action, order_id, actor_id, result)
  values (trim(p_operation_key), action_name, next_order.id, nullif(actor ->> 'id', '')::uuid, stored_result);

  return stored_result;
end;
$$;

create or replace function public.register_order_sale_once(
  p_operation_key text,
  p_order_id uuid,
  p_sale jsonb,
  p_items jsonb,
  p_stock_deltas jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      'user_id', actor ->> 'id',
      'user_role', actor ->> 'role',
      'user_name', actor ->> 'display_name',
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
$$;

create or replace function public.adjust_member_points_once(
  p_operation_key text,
  p_client_id bigint,
  p_delta bigint,
  p_reason text default '',
  p_entry_type text default 'manual_adjustment',
  p_earned_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  stored_result jsonb;
  next_balance bigint;
begin
  if coalesce(trim(p_operation_key), '') = '' or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if p_client_id is null or p_delta = 0 then raise exception 'Ajuste de puntos inválido'; end if;
  if p_entry_type not in ('manual_adjustment', 'expiration', 'initial_balance', 'correction') then
    raise exception 'Tipo de ajuste inválido';
  end if;

  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'clients.edit');
  perform pg_advisory_xact_lock(hashtext(trim(p_operation_key)));
  select result into stored_result from private.rebu_operations
  where operation_key = trim(p_operation_key);
  if stored_result is not null then
    return stored_result || jsonb_build_object('_duplicate', true);
  end if;

  next_balance := private.post_member_point_delta(
    p_client_id, null, null, trim(p_operation_key), p_entry_type, p_delta,
    coalesce(p_reason, ''), actor, coalesce(p_earned_at, now()), '{}'::jsonb
  );
  stored_result := jsonb_build_object(
    'client_id', p_client_id, 'delta', p_delta, 'points', next_balance, '_duplicate', false
  );
  insert into private.rebu_operations(operation_key, action, actor_id, result)
  values (trim(p_operation_key), p_entry_type, nullif(actor ->> 'id', '')::uuid, stored_result);
  return stored_result;
end;
$$;

revoke all on function public.save_order_with_points_once(text, text, uuid, jsonb, bigint, jsonb) from public, anon;
revoke all on function public.register_order_sale_once(text, uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.adjust_member_points_once(text, bigint, bigint, text, text, timestamptz) from public, anon;
grant execute on function public.save_order_with_points_once(text, text, uuid, jsonb, bigint, jsonb) to authenticated;
grant execute on function public.register_order_sale_once(text, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.adjust_member_points_once(text, bigint, bigint, text, text, timestamptz) to authenticated;

revoke all on table public.member_point_entries from public, anon;
grant select on table public.member_point_entries to authenticated;

notify pgrst, 'reload schema';

commit;
