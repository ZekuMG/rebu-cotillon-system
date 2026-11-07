begin;

-- Exact inventory counts belong to authenticated Rebu operators. The existing
-- published catalog view already projects availability without exposing counts.
revoke select on public.products from public, anon;
revoke select(stock) on public.products from public, anon;
grant select(id,title,brand,price,category,barcode,image,image_thumb,product_type,is_active,created_at,updated_at,deleted_at)
  on public.products to anon;
revoke all on public.web_catalog_admin_products from public, anon;

-- Deliberate, audited public projection: the view owner can compute a boolean
-- availability from private counts. The fixed published/active predicates and
-- security barrier prevent exposing unpublished rows or raw inventory fields.
alter view public.web_catalog_public_products set (security_invoker = false, security_barrier = true);
revoke insert, update, delete on public.web_catalog_public_products from public, anon, authenticated;

-- Historical source snapshots also contain stock and purchase costs. Remove
-- blanket SELECT grants, retaining the public editorial columns and their RLS.
do $migration$
declare relation_name text; safe_columns text;
begin
  foreach relation_name in array array['web_catalog_products','web_catalog_product_color_links'] loop
    execute format('revoke select on public.%I from public, anon', relation_name);
    execute format('revoke select(source_snapshot,source_fingerprint) on public.%I from public, anon', relation_name);
    select string_agg(quote_ident(a.attname), ',' order by a.attnum) into safe_columns
      from pg_attribute a where a.attrelid = format('public.%I', relation_name)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attname not in ('source_snapshot','source_fingerprint');
    execute format('grant select(%s) on public.%I to anon', safe_columns, relation_name);
  end loop;
end;
$migration$;

-- Published variants must not become a second route for private stock/cost
-- fields. Existing variants are compatible; edits keep the same public shape.
alter table public.web_catalog_products add constraint web_catalog_variants_no_private_inventory
check (variants::text !~* '"(stock|stock_quantity|inventory_stock|purchasePrice|purchase_price|source_snapshot)"[[:space:]]*:') not valid;
alter table public.web_catalog_products validate constraint web_catalog_variants_no_private_inventory;

notify pgrst, 'reload schema';
commit;
