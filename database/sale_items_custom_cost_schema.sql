-- Guarda el costo unitario de articulos libres/personalizados vendidos.
-- No es retroactivo: las filas antiguas quedan con NULL/0 y el calculo las toma como costo 0.

alter table if exists public.sale_items
  add column if not exists cost numeric default 0,
  add column if not exists is_custom boolean default false,
  add column if not exists is_discount boolean default false,
  add column if not exists is_combo boolean default false;

comment on column public.sale_items.cost is
  'Costo unitario congelado al momento de la venta. En productos por peso se guarda por gramo, igual que price.';
