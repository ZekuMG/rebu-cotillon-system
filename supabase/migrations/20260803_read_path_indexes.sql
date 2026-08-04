-- Additive indexes for Rebu's most frequent ordered and incremental reads.
-- This migration does not update or delete application rows.

create index if not exists sales_created_at_id_idx
  on public.sales (created_at desc, id desc);

create index if not exists logs_created_at_id_idx
  on public.logs (created_at desc, id desc);

create index if not exists logs_action_created_at_id_idx
  on public.logs (action, created_at desc, id desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'logs'
      and column_name = 'user_id'
  ) then
    execute 'create index if not exists logs_user_id_created_at_id_idx
      on public.logs (user_id, created_at desc, id desc)';
  end if;
end
$$;

create index if not exists expenses_created_at_id_idx
  on public.expenses (created_at desc, id desc);

create index if not exists cash_closures_created_at_id_idx
  on public.cash_closures (created_at desc, id desc);
