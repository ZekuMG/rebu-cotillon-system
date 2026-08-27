with sales_without_items as (
  select sale.id, sale.created_at, sale.total, sale.payment_method, sale.status
  from public.sales as sale
  where not exists (
    select 1 from public.sale_items as item where item.sale_id = sale.id
  )
),
snapshot_coverage as (
  select
    sale.id,
    exists (
      select 1
      from public.logs as log
      where log.details ->> 'transactionId' = sale.id::text
        and (
          log.action in (
            'Venta Realizada',
            'Modificacion Pedido',
            'Modificacion de Pedido',
            'Venta Modificada',
            'Venta Restaurada'
          )
          or (lower(log.action) like '%venta%' and lower(log.action) like '%realizada%')
          or (lower(log.action) like '%venta%' and lower(log.action) like '%restaurada%')
          or (lower(log.action) like '%modificaci%' and lower(log.action) like '%pedido%')
        )
        and (
          (jsonb_typeof(log.details -> 'itemsSnapshot') = 'array' and jsonb_array_length(log.details -> 'itemsSnapshot') > 0)
          or (jsonb_typeof(log.details -> 'items') = 'array' and jsonb_array_length(log.details -> 'items') > 0)
          or (jsonb_typeof(log.details -> 'itemsRestored') = 'array' and jsonb_array_length(log.details -> 'itemsRestored') > 0)
        )
    ) as recoverable_from_log
  from sales_without_items as sale
),
catalog_sources_with_missing_timestamp as (
  select count(*) as affected
  from public.web_catalog_products as catalog_product
  join public.products as product on product.id::text = catalog_product.source_product_id::text
  where product.updated_at is null
),
payment_shapes as (
  select coalesce(jsonb_typeof(payment_breakdown), 'null') as shape, count(*) as count
  from public.sales
  group by coalesce(jsonb_typeof(payment_breakdown), 'null')
)
select jsonb_build_object(
  'sales_without_items', jsonb_build_object(
    'total', (select count(*) from snapshot_coverage),
    'recoverable_from_logs', (select count(*) from snapshot_coverage where recoverable_from_log),
    'not_recoverable_from_logs', (select count(*) from snapshot_coverage where not recoverable_from_log),
    'unrecoverable_ids', coalesce((
      select jsonb_agg(id order by id) from snapshot_coverage where not recoverable_from_log
    ), '[]'::jsonb),
    'unrecoverable_summary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sale.id,
        'created_at', sale.created_at,
        'total', sale.total,
        'payment_method', sale.payment_method,
        'status', sale.status
      ) order by sale.id)
      from sales_without_items as sale
      join snapshot_coverage as coverage on coverage.id = sale.id
      where not coverage.recoverable_from_log
    ), '[]'::jsonb)
  ),
  'catalog_sources_with_missing_product_updated_at',
    (select affected from catalog_sources_with_missing_timestamp),
  'payment_breakdown_shapes', coalesce((
    select jsonb_object_agg(shape, count) from payment_shapes
  ), '{}'::jsonb)
) as classification;
