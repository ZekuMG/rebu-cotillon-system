select jsonb_agg(jsonb_build_object(
  'barcode', duplicate.barcode,
  'products', duplicate.products
) order by duplicate.barcode) as duplicate_barcodes
from (
  select
    trim(product.barcode) as barcode,
    jsonb_agg(jsonb_build_object(
      'id', product.id,
      'title', product.title,
      'brand', product.brand,
      'stock', product.stock,
      'price', product.price,
      'purchase_price', product."purchasePrice",
      'created_at', product.created_at,
      'updated_at', product.updated_at
    ) order by product.id) as products
  from public.products as product
  where product.is_active is true
    and product.deleted_at is null
    and trim(coalesce(product.barcode, '')) <> ''
  group by trim(product.barcode)
  having count(*) > 1
) as duplicate;
