with target_products as (
  select * from public.products where id in (885, 2395, 426, 2596)
),
barcode_log_summary as (
  select
    log.action,
    coalesce(log.user_name, log.user) as actor,
    count(*) as occurrences,
    min(log.created_at) as first_at,
    max(log.created_at) as last_at
  from public.logs as log
  where log.details::text like '%6920250626109%'
    or log.details::text like '%7798132038888%'
  group by log.action, coalesce(log.user_name, log.user)
)
select jsonb_build_object(
  'image_metadata', (
    select jsonb_agg(jsonb_build_object(
      'id', product.id,
      'image_length', length(coalesce(product.image, '')),
      'image_prefix', left(coalesce(product.image, ''), 120),
      'thumb_length', length(coalesce(product.image_thumb, '')),
      'thumb_prefix', left(coalesce(product.image_thumb, ''), 120)
    ) order by product.id)
    from target_products as product
  ),
  'sale_item_rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', item.product_id,
      'sale_id', item.sale_id,
      'sale_created_at', sale.created_at,
      'sale_status', sale.status,
      'product_title', item.product_title,
      'quantity', item.quantity,
      'price', item.price,
      'subtotal', item.subtotal,
      'is_reward', item.is_reward
    ) order by sale.created_at), '[]'::jsonb)
    from public.sale_items as item
    join public.sales as sale on sale.id = item.sale_id
    where item.product_id in (885, 2395, 426, 2596)
  ),
  'barcode_log_summary', coalesce((
    select jsonb_agg(to_jsonb(summary) order by summary.first_at)
    from barcode_log_summary as summary
  ), '[]'::jsonb),
  'order_reference_count', (
    select count(*)
    from public.orders as order_row
    where order_row.items_snapshot::text ~ '"(productId|product_id|id)"\\s*:\\s*"?(885|2395|426|2596)"?'
  ),
  'budget_reference_count', (
    select count(*)
    from public.budgets as budget
    where budget.items_snapshot::text ~ '"(productId|product_id|id)"\\s*:\\s*"?(885|2395|426|2596)"?'
  )
) as investigation;
