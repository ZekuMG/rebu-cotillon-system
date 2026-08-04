begin;

alter table public.budgets
  add column if not exists whatsapp_operation_key text;

create unique index if not exists budgets_whatsapp_operation_key_uidx
  on public.budgets (whatsapp_operation_key)
  where whatsapp_operation_key is not null;

create or replace function public.create_whatsapp_budget_once(
  p_operation_key text,
  p_budget jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  normalized public.budgets%rowtype;
  created public.budgets%rowtype;
begin
  if coalesce(trim(p_operation_key), '') = ''
     or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if jsonb_typeof(coalesce(p_budget, '{}'::jsonb)) <> 'object' then
    raise exception 'Presupuesto inválido';
  end if;

  actor := private.current_rebu_transaction_actor();
  if lower(actor ->> 'role') not in ('system', 'sistema', 'owner', 'dueño', 'dueno', 'admin') then
    raise exception 'No tenés permiso para aprobar presupuestos de WhatsApp'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_operation_key)));

  select *
  into created
  from public.budgets
  where whatsapp_operation_key = trim(p_operation_key)
  limit 1;

  if created.id is not null then
    return to_jsonb(created) || jsonb_build_object('duplicate', true);
  end if;

  normalized := jsonb_populate_record(
    null::public.budgets,
    coalesce(p_budget, '{}'::jsonb) || jsonb_build_object(
      'whatsapp_operation_key', trim(p_operation_key),
      'is_active', true
    )
  );

  insert into public.budgets (
    member_id,
    customer_name,
    customer_phone,
    customer_note,
    document_title,
    event_label,
    payment_method,
    payment_breakdown,
    installments,
    items_snapshot,
    total_amount,
    is_active,
    whatsapp_operation_key
  ) values (
    normalized.member_id,
    coalesce(normalized.customer_name, ''),
    coalesce(normalized.customer_phone, ''),
    coalesce(normalized.customer_note, ''),
    coalesce(normalized.document_title, 'PRESUPUESTO'),
    coalesce(normalized.event_label, ''),
    coalesce(normalized.payment_method, 'Efectivo'),
    normalized.payment_breakdown,
    coalesce(normalized.installments, 1),
    coalesce(normalized.items_snapshot, '[]'::jsonb),
    coalesce(normalized.total_amount, 0),
    true,
    trim(p_operation_key)
  )
  returning * into created;

  return to_jsonb(created) || jsonb_build_object('duplicate', false);
end;
$$;

revoke all on function public.create_whatsapp_budget_once(text, jsonb) from public, anon;
grant execute on function public.create_whatsapp_budget_once(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
