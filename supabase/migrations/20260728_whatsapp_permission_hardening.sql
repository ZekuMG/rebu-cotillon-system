begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_rebu_transaction_actor()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión Supabase Auth requerida' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', app_user.id,
    'role', app_user.role,
    'display_name', app_user.display_name,
    'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
  )
  into actor
  from public.app_users as app_user
  where app_user.auth_user_id = (select auth.uid())
    and app_user.is_active = true
  limit 1;

  if actor is null then
    raise exception 'Usuario autenticado no vinculado a un usuario activo de Rebu'
      using errcode = '42501';
  end if;

  return actor;
end;
$$;

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
  actor_role text;
  permission_override jsonb;
  can_approve boolean;
begin
  if coalesce(trim(p_operation_key), '') = ''
     or length(p_operation_key) > 180 then
    raise exception 'Clave de operación inválida';
  end if;
  if jsonb_typeof(coalesce(p_budget, '{}'::jsonb)) <> 'object' then
    raise exception 'Presupuesto inválido';
  end if;
  if jsonb_typeof(coalesce(p_budget -> 'items_snapshot', '[]'::jsonb)) <> 'array' then
    raise exception 'Productos del presupuesto inválidos';
  end if;
  if coalesce((p_budget ->> 'total_amount')::numeric, 0) < 0 then
    raise exception 'Total del presupuesto inválido';
  end if;

  actor := private.current_rebu_transaction_actor();
  actor_role := lower(coalesce(actor ->> 'role', ''));
  permission_override := coalesce(actor -> 'permissions_override', '{}'::jsonb);
  can_approve := case
    when permission_override ? 'whatsapp.budget.approve'
      then coalesce((permission_override ->> 'whatsapp.budget.approve')::boolean, false)
    else actor_role in ('system', 'sistema', 'owner', 'dueño', 'dueno', 'admin')
  end;

  if not can_approve then
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

revoke all on function private.current_rebu_transaction_actor() from public;
revoke all on function public.create_whatsapp_budget_once(text, jsonb) from public, anon;
grant execute on function public.create_whatsapp_budget_once(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
