-- Vinculos externos por proveedor para productos de Rebu.
-- Es seguro ejecutarlo varias veces desde Supabase SQL Editor.
--
-- Estructura esperada:
-- {
--   "casa_alberto": {
--     "providerCode": "779395700011",
--     "casaAlbertoId": "18626",
--     "productUrl": "https://.../detalle.php?idp=18626",
--     "matchedBy": "barcode_exact",
--     "verifiedAt": "2026-06-09T..."
--   }
-- }

alter table if exists public.products
  add column if not exists supplier_links jsonb not null default '{}'::jsonb;

update public.products
set supplier_links = '{}'::jsonb
where supplier_links is null
   or jsonb_typeof(supplier_links) <> 'object';

alter table if exists public.products
  alter column supplier_links set default '{}'::jsonb,
  alter column supplier_links set not null;

create index if not exists products_supplier_links_gin_idx
  on public.products using gin (supplier_links jsonb_path_ops);

comment on column public.products.supplier_links is
  'Identidades y metadatos externos del producto, agrupados por proveedor.';

notify pgrst, 'reload schema';
