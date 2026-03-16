create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  member_id bigint null references public.clients (id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_note text not null default '',
  document_title text not null default 'PRESUPUESTO',
  event_label text not null default '',
  items_snapshot jsonb not null default '[]'::jsonb,
  total_amount numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists budgets_created_at_idx on public.budgets (created_at desc);
create index if not exists budgets_member_id_idx on public.budgets (member_id);
create index if not exists budgets_is_active_idx on public.budgets (is_active);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid null references public.budgets (id) on delete set null,
  member_id bigint null references public.clients (id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_note text not null default '',
  document_title text not null default 'PEDIDO',
  event_label text not null default '',
  items_snapshot jsonb not null default '[]'::jsonb,
  total_amount numeric(12, 2) not null default 0,
  deposit_amount numeric(12, 2) not null default 0,
  paid_total numeric(12, 2) not null default 0,
  remaining_amount numeric(12, 2) not null default 0,
  pickup_date date null,
  status text not null default 'Pendiente',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_budget_id_idx on public.orders (budget_id);
create index if not exists orders_member_id_idx on public.orders (member_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_is_active_idx on public.orders (is_active);
