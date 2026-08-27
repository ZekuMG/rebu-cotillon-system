with target_sale as (
  select * from public.sales where id = 1036
),
snapshot_matches as (
  select
    closure.id as closure_id,
    closure.created_at as closure_created_at,
    closure.date as closure_date,
    closure.user_name as closure_user,
    closure.total_sales,
    closure.sales_count,
    tx.value as snapshot
  from public.cash_closures as closure
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(closure.transactions_snapshot) = 'array'
        then closure.transactions_snapshot
      else '[]'::jsonb
    end
  ) as tx(value)
  where tx.value ->> 'id' = '1036'
),
same_client_sales as (
  select
    sale.id,
    sale.created_at,
    sale.total,
    sale.payment_method,
    sale.user_name,
    count(item.id) as item_count,
    coalesce(jsonb_agg(item.product_title order by item.id)
      filter (where item.id is not null), '[]'::jsonb) as item_titles
  from public.sales as sale
  left join public.sale_items as item on item.sale_id = sale.id
  where sale.client_id = (select client_id from target_sale)
    and sale.created_at >= '2026-04-24T03:00:00+00:00'::timestamptz
    and sale.created_at < '2026-04-25T03:00:00+00:00'::timestamptz
  group by sale.id
)
select jsonb_build_object(
  'sale', (
    select jsonb_build_object(
      'id', sale.id,
      'created_at', sale.created_at,
      'total', sale.total,
      'payment_method', sale.payment_method,
      'payment_breakdown', sale.payment_breakdown,
      'status', sale.status,
      'user_id', sale.user_id,
      'user_name', sale.user_name,
      'user_role', sale.user_role,
      'client_id', sale.client_id,
      'order_id', sale.order_id,
      'points_earned', sale.points_earned,
      'points_spent', sale.points_spent
    )
    from target_sale as sale
  ),
  'client', (
    select jsonb_build_object(
      'id', client.id,
      'name', client.name,
      'member_number', client.member_number,
      'current_points', client.points,
      'created_at', client.created_at
    )
    from target_sale as sale
    join public.clients as client on client.id = sale.client_id
  ),
  'sale_item_count', (
    select count(*) from public.sale_items where sale_id = 1036
  ),
  'exact_log_count', (
    select count(*)
    from public.logs as log
    where log.details ->> 'transactionId' = '1036'
      or log.details ->> 'saleId' = '1036'
      or log.details -> 'transaction' ->> 'id' = '1036'
  ),
  'point_ledger_entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', entry.id,
      'operation_key', entry.operation_key,
      'entry_type', entry.entry_type,
      'delta', entry.delta,
      'balance_after', entry.balance_after,
      'earned_at', entry.earned_at,
      'reason', entry.reason,
      'created_at', entry.created_at
    ) order by entry.created_at)
    from public.member_point_entries as entry
    where entry.sale_id = '1036'
  ), '[]'::jsonb),
  'closure_snapshot_matches', coalesce((
    select jsonb_agg(jsonb_build_object(
      'closure_id', match.closure_id,
      'closure_created_at', match.closure_created_at,
      'closure_date', match.closure_date,
      'closure_user', match.closure_user,
      'closure_total_sales', match.total_sales,
      'closure_sales_count', match.sales_count,
      'snapshot_total', match.snapshot -> 'total',
      'snapshot_payment', coalesce(match.snapshot ->> 'payment', match.snapshot ->> 'payment_method'),
      'snapshot_user', coalesce(match.snapshot ->> 'user', match.snapshot ->> 'user_name'),
      'snapshot_member_number', coalesce(
        match.snapshot -> 'client' ->> 'memberNumber',
        match.snapshot ->> 'memberNumber'
      ),
      'snapshot_item_count', case
        when jsonb_typeof(match.snapshot -> 'items') = 'array'
          then jsonb_array_length(match.snapshot -> 'items')
        else 0
      end,
      'snapshot_item_titles', coalesce((
        select jsonb_agg(coalesce(item.value ->> 'title', item.value ->> 'product_title'))
        from jsonb_array_elements(
          case
            when jsonb_typeof(match.snapshot -> 'items') = 'array'
              then match.snapshot -> 'items'
            else '[]'::jsonb
          end
        ) as item(value)
      ), '[]'::jsonb)
    ) order by match.closure_created_at)
    from snapshot_matches as match
  ), '[]'::jsonb),
  'same_client_sales_that_day', coalesce((
    select jsonb_agg(to_jsonb(sale) order by sale.id)
    from same_client_sales as sale
  ), '[]'::jsonb),
  'nearby_session_timeline', coalesce((
    select jsonb_agg(jsonb_build_object(
      'created_at', log.created_at,
      'action', log.action,
      'user', coalesce(log.user_name, log.user),
      'reason', log.reason
    ) order by log.created_at)
    from public.logs as log
    cross join target_sale as sale
    where log.created_at between sale.created_at - interval '30 minutes'
      and sale.created_at + interval '15 minutes'
      and (
        lower(log.action) like '%sesión%'
        or lower(log.action) like '%sesion%'
        or log.details ->> 'transactionId' = '1036'
      )
  ), '[]'::jsonb)
) as investigation;
