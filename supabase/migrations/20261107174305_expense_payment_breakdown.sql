-- NULL preserves legacy expenses, which use payment_method for the full amount.
-- No backfill or table rewrite is needed.
alter table public.expenses
  add column if not exists payment_breakdown jsonb
  constraint expenses_payment_breakdown_array
  check (payment_breakdown is null or jsonb_typeof(payment_breakdown) = 'array');

comment on column public.expenses.payment_breakdown is
  'Importe final por método de pago del gasto, sin recargos de venta. NULL usa payment_method y amount.';

notify pgrst, 'reload schema';
