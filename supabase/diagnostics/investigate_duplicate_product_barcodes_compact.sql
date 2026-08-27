with target_products as (
  select *
  from public.products
  where id in (885, 2395, 426, 2596)
),
usage as (
  select
    product.id as product_id,
    count(distinct item.sale_id) as sale_count,
    coalesce(sum(item.quantity), 0) as quantity_sold,
    coalesce(sum(item.subtotal), 0) as sales_amount,
    min(sale.created_at) as first_sale_at,
    max(sale.created_at) as last_sale_at,
    coalesce(jsonb_agg(distinct item.product_title)
      filter (where item.id is not null), '[]'::jsonb) as sale_titles
  from target_products as product
  left join public.sale_items as item on item.product_id = product.id
  left join public.sales as sale on sale.id = item.sale_id
  group by product.id
),
direct_logs as (
  select log.*
  from public.logs as log
  where log.details ->> 'productId' in ('885', '2395', '426', '2596')
    or log.details ->> 'product_id' in ('885', '2395', '426', '2596')
    or log.details -> 'product' ->> 'id' in ('885', '2395', '426', '2596')
    or log.details -> 'item' ->> 'productId' in ('885', '2395', '426', '2596')
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
      'quantity_sold', usage.quantity_sold,
      'sales_amount', usage.sales_amount,
      'first_sale_at', usage.first_sale_at,
      'last_sale_at', usage.last_sale_at,
      'sale_titles', usage.sale_titles,
      'catalog_count', (
        select count(*)
        from public.web_catalog_products as catalog
        where catalog.source_product_id = product.id
      )
    ) order by product.barcode, product.id)
    from target_products as product
    join usage on usage.product_id = product.id
  ), '[]'::jsonb),
  'direct_log_summaries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'created_at', log.created_at,
      'action', log.action,
      'user', coalesce(log.user_name, log.user),
      'reason', log.reason,
      'product_id', coalesce(
        log.details ->> 'productId',
        log.details ->> 'product_id',
        log.details -> 'product' ->> 'id',
        log.details -> 'item' ->> 'productId'
      ),
      'detail_keys', (select jsonb_agg(key order by key) from jsonb_object_keys(log.details) as key)
    ) order by log.created_at)
    from direct_logs as log
  ), '[]'::jsonb)
) as investigation;
