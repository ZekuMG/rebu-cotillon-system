-- Hotfix de schema para alinear Supabase con las columnas que usa la app.
-- Es seguro ejecutarlo varias veces: todas las columnas usan IF NOT EXISTS.

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

alter table if exists public.products
  add column if not exists active_offers jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz null;

alter table if exists public.clients
  add column if not exists "extraInfo" text null,
  add column if not exists updated_at timestamptz null;

alter table if exists public.sale_items
  add column if not exists subtotal numeric(12, 2) null,
  add column if not exists product_type text not null default 'quantity';

alter table if exists public.sales
  add column if not exists payment_breakdown jsonb null,
  add column if not exists cash_received numeric(12, 2) null,
  add column if not exists cash_change numeric(12, 2) null,
  add column if not exists status text not null default 'completed',
  add column if not exists voided_at timestamptz null,
  add column if not exists user_id text null,
  add column if not exists user_role text null;

alter table if exists public.logs
  add column if not exists user_name text null,
  add column if not exists user_id text null,
  add column if not exists user_role text null;

alter table if exists public.expenses
  add column if not exists user_id text null,
  add column if not exists user_role text null;

alter table if exists public.cash_closures
  add column if not exists user_id text null,
  add column if not exists user_role text null;

alter table if exists public.budgets
  add column if not exists payment_method text null,
  add column if not exists payment_breakdown jsonb null,
  add column if not exists installments integer not null default 0;

alter table if exists public.orders
  add column if not exists payment_method text null,
  add column if not exists payment_breakdown jsonb null,
  add column if not exists installments integer not null default 0;

create index if not exists sales_user_id_idx on public.sales (user_id);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_voided_at_idx on public.sales (voided_at desc) where voided_at is not null;
create index if not exists logs_user_id_idx on public.logs (user_id);
create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists cash_closures_user_id_idx on public.cash_closures (user_id);

notify pgrst, 'reload schema';
