begin;

-- The column predated the catalog migration, so ADD COLUMN IF NOT EXISTS could
-- not retrofit its default or NOT NULL constraint. Backfill without presenting
-- the timestamp-only repair as a product/content change to the web catalog.
lock table public.products in share row exclusive mode;
lock table public.web_catalog_products in share row exclusive mode;

alter table public.products disable trigger trg_products_updated_at;
alter table public.products disable trigger trg_web_catalog_source_updated;
alter table public.web_catalog_products disable trigger trg_web_catalog_prepare_product;
alter table public.web_catalog_products disable trigger trg_web_catalog_audit_product;

update public.products
set updated_at = coalesce(created_at, now())
where updated_at is null;

-- updated_at participates in the source fingerprint. Refresh only that source
-- snapshot while keeping publication/review state and catalog timestamps intact.
update public.web_catalog_products as catalog_product
set source_snapshot = private.web_catalog_source_snapshot(product),
    source_fingerprint = private.web_catalog_source_fingerprint(product)
from public.products as product
where product.id = catalog_product.source_product_id;

alter table public.products enable trigger trg_products_updated_at;
alter table public.products enable trigger trg_web_catalog_source_updated;
alter table public.web_catalog_products enable trigger trg_web_catalog_prepare_product;
alter table public.web_catalog_products enable trigger trg_web_catalog_audit_product;

alter table public.products
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if exists (select 1 from public.products where updated_at is null) then
    raise exception 'Product updated_at backfill left null values';
  end if;
  if exists (
    select 1
    from public.web_catalog_products as catalog_product
    join public.products as product on product.id = catalog_product.source_product_id
    where catalog_product.source_fingerprint
      is distinct from private.web_catalog_source_fingerprint(product)
  ) then
    raise exception 'Web catalog source fingerprints are not aligned after product backfill';
  end if;
end;
$$;

commit;
