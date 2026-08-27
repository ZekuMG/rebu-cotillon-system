with item_expectations as (
  select
    item.*,
    case
      when coalesce(product.product_type, nullif(item.product_type, ''), 'quantity') = 'weight'
        and item.price >= 100
        then item.price * (item.quantity / 1000.0)
      else item.price * item.quantity
    end as expected_subtotal
  from public.sale_items as item
  left join public.products as product on product.id = item.product_id
),
sale_item_totals as (
  select sale_id, sum(expected_subtotal) as item_total
  from item_expectations
  group by sale_id
),
sale_surcharges as (
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
sale_expectations as (
  select
    sale.id,
    sale.total,
    case
      when jsonb_typeof(sale.payment_breakdown) = 'array'
        then totals.item_total + surcharge.recorded_surcharge
      when sale.payment_method = 'Credito'
        then totals.item_total * 1.1
      else totals.item_total
    end as expected_total
  from public.sales as sale
  join sale_item_totals as totals on totals.sale_id = sale.id
  join sale_surcharges as surcharge on surcharge.sale_id = sale.id
),
sales_without_items as (
  select sale.id
  from public.sales as sale
  where not exists (
    select 1 from public.sale_items as item where item.sale_id = sale.id
  )
),
sales_without_items_coverage as (
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
)
select jsonb_build_object(
  'products', jsonb_build_object(
    'total', (select count(*) from public.products),
    'active', (select count(*) from public.products where is_active is true and deleted_at is null),
    'negative_price', (select count(*) from public.products where price < 0),
    'negative_purchase_price', (select count(*) from public.products where "purchasePrice" < 0),
    'negative_stock', (select count(*) from public.products where stock < 0),
    'missing_updated_at', (select count(*) from public.products where updated_at is null),
    'invalid_supplier_links', (
      select count(*) from public.products
      where supplier_links is null or jsonb_typeof(supplier_links) <> 'object'
    ),
    'duplicate_active_barcodes', (
      select count(*)
      from (
        select trim(barcode)
        from public.products
        where is_active is true and deleted_at is null and trim(coalesce(barcode, '')) <> ''
        group by trim(barcode)
        having count(*) > 1
      ) as duplicate_barcode
    )
  ),
  'sales', jsonb_build_object(
    'total', (select count(*) from public.sales),
    'status_counts', (
      select coalesce(jsonb_object_agg(status, status_count), '{}'::jsonb)
      from (
        select status, count(*) as status_count
        from public.sales
        group by status
      ) as sale_status
    ),
    'negative_total', (select count(*) from public.sales where total < 0),
    'missing_created_at', (select count(*) from public.sales where created_at is null),
    'orphan_client', (
      select count(*)
      from public.sales as sale
      left join public.clients as client on client.id = sale.client_id
      where sale.client_id is not null and client.id is null
    ),
    'without_items', (select count(*) from sales_without_items_coverage),
    'without_items_recoverable_from_logs', (
      select count(*) from sales_without_items_coverage where recoverable_from_log
    ),
    'without_items_unrecoverable', (
      select count(*) from sales_without_items_coverage where not recoverable_from_log
    ),
    'legacy_test_total_mismatch', (
      select count(*)
      from sale_expectations as expectation
      where abs(expectation.total - expectation.expected_total) > 0.02
        and exists (
          select 1 from public.sale_items as item
          where item.sale_id = expectation.id
            and lower(trim(item.product_title)) like 'test%'
        )
    ),
    'unexpected_total_vs_items_mismatch', (
      select count(*)
      from sale_expectations as expectation
      where abs(expectation.total - expectation.expected_total) > 0.02
        and not exists (
          select 1 from public.sale_items as item
          where item.sale_id = expectation.id
            and lower(trim(item.product_title)) like 'test%'
        )
    )
  ),
  'sale_items', jsonb_build_object(
    'total', (select count(*) from public.sale_items),
    'orphan_sale', (
      select count(*)
      from public.sale_items as item
      left join public.sales as sale on sale.id = item.sale_id
      where sale.id is null
    ),
    'invalid_quantity', (select count(*) from public.sale_items where quantity <= 0),
    'legacy_negative_discount_or_reward', (
      select count(*) from public.sale_items
      where price < 0
        and coalesce(is_discount, false) is false
        and (
          lower(trim(product_title)) like 'descuento manual%'
          or lower(trim(product_title)) like 'canje:%'
        )
    ),
    'unexpected_negative_price', (
      select count(*) from public.sale_items
      where price < 0
        and coalesce(is_discount, false) is false
        and lower(trim(product_title)) not like 'descuento manual%'
        and lower(trim(product_title)) not like 'canje:%'
    ),
    'subtotal_mismatch', (
      select count(*) from item_expectations
      where subtotal is not null and abs(subtotal - expected_subtotal) > 0.02
    )
  ),
  'clients', jsonb_build_object(
    'total', (select count(*) from public.clients),
    'negative_points', (
      select count(*) from public.clients
      where coalesce(points, current_points, 0) < 0
    ),
    'duplicate_member_number', (
      select count(*)
      from (
        select member_number
        from public.clients
        where member_number is not null
        group by member_number
        having count(*) > 1
      ) as duplicate_member
    )
  ),
  'relations', jsonb_build_object(
    'duplicate_sale_order_link', (
      select count(*)
      from (
        select order_id
        from public.sales
        where order_id is not null
        group by order_id
        having count(*) > 1
      ) as duplicate_order
    ),
    'orphan_whatsapp_requester', (
      select count(*)
      from public.whatsapp_device_access_requests as request
      left join public.app_users as app_user on app_user.id = request.requested_by
      where app_user.id is null
    )
  )
) as audit;
