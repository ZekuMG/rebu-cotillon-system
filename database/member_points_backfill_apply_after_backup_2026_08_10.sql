-- MUTATING / MANUAL. Take a backup, run the preview first, and execute only after
-- confirming the historical policy. This is idempotent by operation_key.
begin;

with candidates as (
  select
    o.id as order_id,
    o.member_id,
    (
      floor(least(greatest(o.paid_total, 0), greatest(o.total_amount, 0)) / 500)::bigint
      - o.points_credited
    ) as delta,
    o.paid_total,
    o.total_amount,
    'backfill:order:' || o.id::text as operation_key
  from public.orders o
  where o.is_active is true
    and lower(coalesce(o.status, '')) <> 'cancelado'
    and o.paid_total > 0
    and o.paid_total < o.total_amount
    and o.points_accounting_mode = 'legacy'
), pending as (
  select c.*
  from candidates c
  where c.delta > 0
    and not exists (
      select 1 from public.member_point_entries e
      where e.operation_key = c.operation_key and e.client_id = c.member_id
    )
), locked_clients as (
  select client.id, coalesce(client.points, 0)::bigint as previous_points
  from public.clients client
  where client.id in (select member_id from pending)
  order by client.id
  for update
), per_client as (
  select p.member_id, sum(p.delta)::bigint as total_delta, lc.previous_points
  from pending p
  join locked_clients lc on lc.id = p.member_id
  group by p.member_id, lc.previous_points
), updated_clients as (
  update public.clients client
  set points = pc.previous_points + pc.total_delta
  from per_client pc
  where client.id = pc.member_id
  returning client.id, client.points::bigint as final_points
), running_entries as (
  select
    p.*,
    pc.previous_points
      + sum(p.delta) over (
          partition by p.member_id
          order by p.order_id
          rows between unbounded preceding and current row
        ) as balance_after
  from pending p
  join per_client pc on pc.member_id = p.member_id
), inserted_entries as (
  insert into public.member_point_entries (
    client_id, order_id, operation_key, entry_type, delta, balance_after,
    earned_at, reason, actor_name, metadata
  )
  select
    member_id,
    order_id,
    operation_key,
    'order_payment_backfill',
    delta,
    balance_after,
    now(),
    'Backfill confirmado de pagos parciales anteriores',
    'SQL backfill 2026-08-10',
    jsonb_build_object('paid_total', paid_total, 'total_amount', total_amount)
  from running_entries
  returning order_id
)
update public.orders o
set points_credited = floor(least(greatest(o.paid_total, 0), greatest(o.total_amount, 0)) / 500)::bigint,
    points_accounting_mode = 'incremental',
    version = o.version + 1
where o.id in (select order_id from inserted_entries);

commit;

