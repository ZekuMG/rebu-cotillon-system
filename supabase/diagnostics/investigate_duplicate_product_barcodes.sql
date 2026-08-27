with duplicate_products as (
  select product.*
  from public.products as product
  where product.id in (885, 2395, 426, 2596)
),
sale_usage as (
  select
    product.id as product_id,
    count(distinct item.sale_id) as sale_count,
    coalesce(sum(item.quantity), 0) as total_quantity,
    min(sale.created_at) as first_sale_at,
    max(sale.created_at) as last_sale_at,
    jsonb_agg(distinct item.product_title) as titles_at_sale
  from duplicate_products as product
  left join public.sale_items as item on item.product_id = product.id
  left join public.sales as sale on sale.id = item.sale_id
  group by product.id
),
catalog_usage as (
  select source_product_id as product_id, count(*) as catalog_count,
    jsonb_agg(jsonb_build_object(
      'catalog_code', catalog_code,
      'status', status,
      'source_state', source_state
    ) order by catalog_code) as catalog_entries
  from public.web_catalog_products
  where source_product_id in (885, 2395, 426, 2596)
  group by source_product_id
),
product_logs as (
  select log.*
  from public.logs as log
  where log.details::text ~ '"(productId|product_id|id)"\s*:\s*"?(885|2395|426|2596)"?'
    or log.details::text like '%6920250626109%'
    or log.details::text like '%7798132038888%'
)
select jsonb_build_object(
  'products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', product.id,
      'barcode', product.barcode,
      'title', product.title,
      'brand', product.brand,
      'category', product.category,
      'product_type', product.product_type,
      'price', product.price,
      'purchase_price', product."purchasePrice",
      'stock', product.stock,
      'is_active', product.is_active,
      'created_at', product.created_at,
      'updated_at', product.updated_at,
      'image_fingerprint', md5(coalesce(product.image, '')),
      'image_thumb_fingerprint', md5(coalesce(product.image_thumb, '')),
      'supplier_links', product.supplier_links,
      'sale_count', usage.sale_count,
      'total_quantity', usage.total_quantity,
      'first_sale_at', usage.first_sale_at,
      'last_sale_at', usage.last_sale_at,
      'titles_at_sale', usage.titles_at_sale,
      'catalog_count', coalesce(catalog.catalog_count, 0),
      'catalog_entries', coalesce(catalog.catalog_entries, '[]'::jsonb)
    ) order by product.barcode, product.id)
    from duplicate_products as product
    join sale_usage as usage on usage.product_id = product.id
    left join catalog_usage as catalog on catalog.product_id = product.id
  ), '[]'::jsonb),
  'related_logs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'created_at', log.created_at,
      'action', log.action,
      'user', coalesce(log.user_name, log.user),
      'reason', log.reason,
      'details', log.details
    ) order by log.created_at)
    from product_logs as log
  ), '[]'::jsonb),
  'orders_containing_products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', order_row.id,
      'created_at', order_row.created_at,
      'status', order_row.status,
      'total_amount', order_row.total_amount
    ) order by order_row.created_at)
    from public.orders as order_row
    where order_row.items_snapshot::text ~ '"(productId|product_id|id)"\s*:\s*"?(885|2395|426|2596)"?'
  ), '[]'::jsonb),
  'budgets_containing_products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', budget.id,
      'created_at', budget.created_at,
      'total_amount', budget.total_amount
    ) order by budget.created_at)
    from public.budgets as budget
    where budget.items_snapshot::text ~ '"(productId|product_id|id)"\s*:\s*"?(885|2395|426|2596)"?'
  ), '[]'::jsonb)
) as investigation;
