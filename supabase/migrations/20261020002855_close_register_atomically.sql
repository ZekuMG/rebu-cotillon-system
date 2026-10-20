-- El cambio de estado y el informe de un cierre se confirman juntos.
-- SECURITY INVOKER respeta los permisos de tablas y sus políticas RLS cuando están activas.
begin;

create or replace function public.close_register_once(
  p_expected_opened_at timestamptz,
  p_closure jsonb,
  p_save_report boolean,
  p_last_updated_by text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_is_open boolean;
  v_opened_at timestamptz;
  v_report_id bigint;
  v_report_created_at timestamptz;
begin
  select state.is_open, state.opened_at
    into v_is_open, v_opened_at
    from public.register_state as state
   where state.id = 1
   for update;

  if not found then
    raise exception 'No existe el estado de la caja' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_open, false) then
    return jsonb_build_object('status', 'already_closed');
  end if;

  if v_opened_at is distinct from p_expected_opened_at then
    return jsonb_build_object('status', 'cycle_changed');
  end if;

  if p_save_report then
    if jsonb_typeof(p_closure) is distinct from 'object' then
      raise exception 'Faltan los datos del informe de caja' using errcode = '22023';
    end if;

    insert into public.cash_closures (
      date, open_time, close_time, user_id, user_role, user_name, type,
      opening_balance, total_sales, final_balance, total_cost,
      total_expenses, net_profit, sales_count, average_ticket,
      payment_methods_summary, items_sold_list, new_clients_list,
      expenses_snapshot, transactions_snapshot
    ) values (
      p_closure ->> 'date',
      p_closure ->> 'open_time',
      p_closure ->> 'close_time',
      p_closure ->> 'user_id',
      p_closure ->> 'user_role',
      p_closure ->> 'user_name',
      p_closure ->> 'type',
      (p_closure ->> 'opening_balance')::numeric,
      (p_closure ->> 'total_sales')::numeric,
      (p_closure ->> 'final_balance')::numeric,
      (p_closure ->> 'total_cost')::numeric,
      (p_closure ->> 'total_expenses')::numeric,
      (p_closure ->> 'net_profit')::numeric,
      (p_closure ->> 'sales_count')::integer,
      (p_closure ->> 'average_ticket')::numeric,
      p_closure -> 'payment_methods_summary',
      p_closure -> 'items_sold_list',
      p_closure -> 'new_clients_list',
      p_closure -> 'expenses_snapshot',
      p_closure -> 'transactions_snapshot'
    ) returning id, created_at into v_report_id, v_report_created_at;
  end if;

  update public.register_state
     set is_open = false,
         opening_balance = 0,
         opened_at = null,
         last_updated_by = p_last_updated_by
   where id = 1;

  return jsonb_build_object(
    'status', 'closed',
    'report_id', v_report_id,
    'report_created_at', v_report_created_at
  );
end;
$function$;

revoke all on function public.close_register_once(timestamptz, jsonb, boolean, text)
  from public, anon, authenticated;
grant execute on function public.close_register_once(timestamptz, jsonb, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
