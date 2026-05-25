-- Safe patch for sale_items custom item metadata.
-- Run after taking a backup. This script is idempotent.

alter table if exists public.sale_items
  add column if not exists cost numeric default 0,
  add column if not exists is_custom boolean default false,
  add column if not exists is_discount boolean default false,
  add column if not exists is_combo boolean default false,
  add column if not exists product_type text default 'quantity';

comment on column public.sale_items.cost is
  'Costo unitario congelado al momento de la venta. En productos por peso se guarda por gramo, igual que price.';

comment on column public.sale_items.product_type is
  'Tipo de producto vendido: quantity, weight u otro valor historico compatible.';
