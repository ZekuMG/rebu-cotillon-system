begin;

-- Supports the renderer's bounded product catch-up ordered by the same keys.
create index if not exists products_updated_at_id_idx
  on public.products (updated_at, id);

commit;
