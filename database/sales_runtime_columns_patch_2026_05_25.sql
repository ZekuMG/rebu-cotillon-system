-- Safe runtime schema patch for sales and sale_items.
-- Idempotent: it only adds columns/indexes that do not already exist.

alter table if exists public.sales
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists total numeric(12, 2) not null default 0,
  add column if not exists payment_method text null,
  add column if not exists payment_breakdown jsonb null,
  add column if not exists installments integer not null default 0,
  add column if not exists client_id bigint null,
  add column if not exists points_earned bigint not null default 0,
  add column if not exists points_spent bigint not null default 0,
  add column if not exists cash_received numeric(12, 2) null,
  add column if not exists cash_change numeric(12, 2) null,
  add column if not exists status text not null default 'completed',
  add column if not exists voided_at timestamptz null,
  add column if not exists user_id text null,
  add column if not exists user_role text null,
  add column if not exists user_name text null;

alter table if exists public.sale_items
  add column if not exists sale_id text null,
  add column if not exists product_id text null,
  add column if not exists product_title text null,
  add column if not exists quantity numeric(12, 3) not null default 0,
  add column if not exists price numeric(12, 2) not null default 0,
  add column if not exists subtotal numeric(12, 2) null,
  add column if not exists is_reward boolean not null default false,
  add column if not exists product_type text not null default 'quantity',
  add column if not exists cost numeric(12, 2) not null default 0,
  add column if not exists is_custom boolean not null default false,
  add column if not exists is_discount boolean not null default false,
  add column if not exists is_combo boolean not null default false;

create index if not exists sales_created_at_idx on public.sales (created_at desc);
create index if not exists sales_client_id_idx on public.sales (client_id);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_user_id_idx on public.sales (user_id);
create index if not exists sales_voided_at_idx on public.sales (voided_at desc) where voided_at is not null;

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

notify pgrst, 'reload schema';
