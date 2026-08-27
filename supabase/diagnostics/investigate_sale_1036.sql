with target_sale as (
  select * from public.sales where id = 1036
),
target_time as (
  select created_at from target_sale
),
snapshot_matches as (
  select
    closure.id as closure_id,
    closure.created_at as closure_created_at,
    closure.date as closure_date,
    closure.open_time,
    closure.close_time,
    closure.user_name as closure_user,
    closure.total_sales,
    closure.sales_count,
    transaction_snapshot.value as transaction_snapshot
  from public.cash_closures as closure
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(closure.transactions_snapshot) = 'array'
      then closure.transactions_snapshot else '[]'::jsonb end
  ) as transaction_snapshot(value)
  where transaction_snapshot.value ->> 'id' = '1036'
),
exact_logs as (
  select log.*
  from public.logs as log
  where log.details ->> 'transactionId' = '1036'
    or log.details ->> 'saleId' = '1036'
    or log.details -> 'transaction' ->> 'id' = '1036'
),
nearby_logs as (
  select log.*
  from public.logs as log
  cross join target_time
  where log.created_at between target_time.created_at - interval '2 hours'
    and target_time.created_at + interval '2 hours'
),
nearby_sales as (
  select sale.*
  from public.sales as sale
  where sale.id between 1030 and 1042
)
select jsonb_build_object(
  'sale', (
    select to_jsonb(sale) - 'payment_breakdown'
      || jsonb_build_object('payment_breakdown', sale.payment_breakdown)
    from target_sale as sale
  ),
  'sale_items', coalesce((
    select jsonb_agg(to_jsonb(item) order by item.id)
    from public.sale_items as item
    where item.sale_id = 1036
  ), '[]'::jsonb),
  'client', (
    select jsonb_build_object(
      'id', client.id,
      'name', client.name,
      'member_number', client.member_number
    )
    from target_sale as sale
    join public.clients as client on client.id = sale.client_id
  ),
  'linked_order', (
    select to_jsonb(order_row)
    from target_sale as sale
    join public.orders as order_row on order_row.id = sale.order_id
  ),
  'exact_logs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'created_at', log.created_at,
      'action', log.action,
      'user', coalesce(log.user_name, log.user),
      'reason', log.reason,
      'details', log.details
    ) order by log.created_at)
    from exact_logs as log
  ), '[]'::jsonb),
  'nearby_log_timeline', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'created_at', log.created_at,
      'action', log.action,
      'user', coalesce(log.user_name, log.user),
      'transaction_id', log.details ->> 'transactionId',
      'total', coalesce(log.details ->> 'total', log.details ->> 'saleTotal'),
      'item_count', case
        when jsonb_typeof(log.details -> 'itemsSnapshot') = 'array'
          then jsonb_array_length(log.details -> 'itemsSnapshot')
        when jsonb_typeof(log.details -> 'items') = 'array'
          then jsonb_array_length(log.details -> 'items')
        else null
      end
    ) order by log.created_at)
    from nearby_logs as log
  ), '[]'::jsonb),
  'cash_closure_snapshot_matches', coalesce((
    select jsonb_agg(to_jsonb(snapshot_match) order by closure_created_at)
    from snapshot_matches as snapshot_match
  ), '[]'::jsonb),
  'same_local_day_closures', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', closure.id,
      'created_at', closure.created_at,
      'date', closure.date,
      'open_time', closure.open_time,
      'close_time', closure.close_time,
      'user', closure.user_name,
      'total_sales', closure.total_sales,
      'sales_count', closure.sales_count,
      'snapshot_count', case
        when jsonb_typeof(closure.transactions_snapshot) = 'array'
          then jsonb_array_length(closure.transactions_snapshot)
        else null
      end
    ) order by closure.created_at)
    from public.cash_closures as closure
    where closure.created_at >= '2026-04-24T03:00:00+00:00'::timestamptz
      and closure.created_at < '2026-04-25T03:00:00+00:00'::timestamptz
  ), '[]'::jsonb),
  'nearby_sales', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sale.id,
      'created_at', sale.created_at,
      'total', sale.total,
      'payment_method', sale.payment_method,
      'status', sale.status,
      'user_name', sale.user_name,
      'client_id', sale.client_id,
      'order_id', sale.order_id,
      'item_count', (select count(*) from public.sale_items as item where item.sale_id = sale.id),
      'item_titles', coalesce((
        select jsonb_agg(item.product_title order by item.id)
        from public.sale_items as item where item.sale_id = sale.id
      ), '[]'::jsonb)
    ) order by sale.id)
    from nearby_sales as sale
  ), '[]'::jsonb)
) as investigation;
