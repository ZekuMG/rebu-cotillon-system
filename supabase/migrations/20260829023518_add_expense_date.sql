alter table public.expenses
  add column if not exists expense_date date;

update public.expenses
set expense_date = coalesce(
  (created_at at time zone 'America/Argentina/Buenos_Aires')::date,
  (now() at time zone 'America/Argentina/Buenos_Aires')::date
)
where expense_date is null;

alter table public.expenses
  alter column expense_date
  set default ((now() at time zone 'America/Argentina/Buenos_Aires')::date);

alter table public.expenses
  alter column expense_date set not null;

comment on column public.expenses.expense_date is
  'Fecha operativa imputada al gasto; created_at conserva la fecha de registro.';
