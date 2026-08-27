with line_totals as (
  select
    item.sale_id,
    sum(case
      when coalesce(product.product_type, nullif(item.product_type, ''), 'quantity') = 'weight'
        and item.price >= 100
        then item.price * (item.quantity / 1000.0)
      else item.price * item.quantity
    end) as calculated_item_total,
    sum(coalesce(item.subtotal, 0)) as stored_item_total
  from public.sale_items as item
  left join public.products as product on product.id = item.product_id
  group by item.sale_id
),
payment_surcharges as (
  select
    sale.id as sale_id,
    coalesce(sum(case
      when line.value ->> 'surcharge' ~ '^-?[0-9]+(?:\.[0-9]+)?$'
        then (line.value ->> 'surcharge')::numeric
      else 0
    end), 0) as recorded_surcharge
  from public.sales as sale
  left join lateral jsonb_array_elements(
    case when jsonb_typeof(sale.payment_breakdown) = 'array'
      then sale.payment_breakdown else '[]'::jsonb end
  ) as line(value) on true
  group by sale.id
),
mismatches as (
  select
    sale.id,
    sale.created_at,
    sale.total,
    sale.payment_method,
    sale.installments,
    totals.calculated_item_total,
    totals.stored_item_total,
    surcharge.recorded_surcharge,
    sale.payment_breakdown
  from public.sales as sale
  join line_totals as totals on totals.sale_id = sale.id
  join payment_surcharges as surcharge on surcharge.sale_id = sale.id
  where abs(sale.total - totals.calculated_item_total - surcharge.recorded_surcharge) > 0.02
    and not (
      sale.payment_method = 'Credito'
      and abs(sale.total - (totals.calculated_item_total * 1.1)) <= 0.02
    )
)
select jsonb_build_object(
  'remaining_total_mismatches', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'created_at', created_at,
      'total', total,
      'payment_method', payment_method,
      'installments', installments,
      'calculated_item_total', calculated_item_total,
      'stored_item_total', stored_item_total,
      'recorded_surcharge', recorded_surcharge,
      'payment_breakdown', payment_breakdown
    ) order by id)
    from mismatches
  ), '[]'::jsonb),
  'remaining_mismatch_items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'sale_id', item.sale_id,
      'product_id', item.product_id,
      'title', item.product_title,
      'quantity', item.quantity,
      'price', item.price,
      'subtotal', item.subtotal,
      'sale_item_product_type', item.product_type,
      'current_product_type', product.product_type,
      'is_custom', item.is_custom,
      'is_discount', item.is_discount,
      'is_reward', item.is_reward
    ) order by item.sale_id, item.id)
    from public.sale_items as item
    left join public.products as product on product.id = item.product_id
    where item.sale_id in (select id from mismatches)
  ), '[]'::jsonb),
  'sale_1036_nearby_logs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'created_at', log.created_at,
      'action', log.action,
      'transaction_id', log.details ->> 'transactionId',
      'details_keys', (
        select jsonb_agg(key order by key) from jsonb_object_keys(log.details) as key
      )
    ) order by log.created_at)
    from public.logs as log
    where log.created_at between
      '2026-04-24T18:51:00.564047+00:00'::timestamptz
      and '2026-04-24T19:01:00.564047+00:00'::timestamptz
  ), '[]'::jsonb)
) as inspection;
