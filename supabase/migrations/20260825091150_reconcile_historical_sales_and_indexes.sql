begin;

-- Production received the original sale implementations before authenticated
-- wrappers were tracked in migration history. Preserve those implementations
-- behind private execution privileges and expose only authenticated wrappers.
create or replace function private.lock_expected_client_points(p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  point_entry jsonb;
  client_id text;
  expected_points numeric;
  next_points numeric;
begin
  if p_updates is null then
    return;
  end if;
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Actualizaciones de puntos invalidas';
  end if;

  for point_entry in
    select value
    from jsonb_array_elements(p_updates)
    order by value ->> 'client_id'
  loop
    client_id := point_entry ->> 'client_id';
    next_points := (point_entry ->> 'points')::numeric;

    if client_id is null or trim(client_id) = '' or next_points is null or next_points < 0 then
      raise exception 'Actualizacion de puntos invalida';
    end if;

    if point_entry ? 'expected_points' then
      expected_points := (point_entry ->> 'expected_points')::numeric;
      perform 1
      from public.clients
      where id::text = client_id
        and coalesce(points, 0) = expected_points
      for update;

      if not found then
        raise exception 'Los puntos del socio cambiaron en otra caja. Recarga e intenta nuevamente.'
          using errcode = '40001';
      end if;
    else
      perform 1
      from public.clients
      where id::text = client_id
      for update;

      if not found then
        raise exception 'Socio inexistente';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function private.lock_expected_client_points(jsonb)
from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.apply_product_stock_delta_unchecked_20260710(text,numeric)') is null then
    alter function public.apply_product_stock_delta(text, numeric)
      rename to apply_product_stock_delta_unchecked_20260710;
  end if;
  if to_regprocedure('public.register_sale_transaction_unchecked_20260710(jsonb,jsonb,jsonb,jsonb)') is null then
    alter function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb)
      rename to register_sale_transaction_unchecked_20260710;
  end if;
  if to_regprocedure('public.edit_sale_transaction_unchecked_20260710(text,jsonb,jsonb,jsonb,jsonb)') is null then
    alter function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb)
      rename to edit_sale_transaction_unchecked_20260710;
  end if;
  if to_regprocedure('public.void_sale_transaction_unchecked_20260710(text,timestamptz,jsonb,jsonb)') is null then
    alter function public.void_sale_transaction(text, timestamptz, jsonb, jsonb)
      rename to void_sale_transaction_unchecked_20260710;
  end if;
end;
$$;

revoke all on function public.apply_product_stock_delta_unchecked_20260710(text, numeric)
from public, anon, authenticated;
revoke all on function public.register_sale_transaction_unchecked_20260710(jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.edit_sale_transaction_unchecked_20260710(text, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.void_sale_transaction_unchecked_20260710(text, timestamptz, jsonb, jsonb)
from public, anon, authenticated;

create or replace function public.apply_product_stock_delta(
  p_product_id text,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.current_rebu_transaction_actor();
  return public.apply_product_stock_delta_unchecked_20260710(p_product_id, p_delta);
end;
$$;

create or replace function public.register_sale_transaction(
  p_sale jsonb,
  p_items jsonb,
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  safe_sale jsonb;
begin
  actor := private.current_rebu_transaction_actor();
  perform private.lock_expected_client_points(coalesce(p_client_points, '[]'::jsonb));
  safe_sale := coalesce(p_sale, '{}'::jsonb) || jsonb_build_object(
    'user_id', actor ->> 'id',
    'user_role', actor ->> 'role',
    'user_name', actor ->> 'display_name'
  );

  return public.register_sale_transaction_unchecked_20260710(
    safe_sale,
    p_items,
    coalesce(p_stock_deltas, '{}'::jsonb),
    coalesce(p_client_points, '[]'::jsonb)
  );
end;
$$;

create or replace function public.edit_sale_transaction(
  p_sale_id text,
  p_sale_patch jsonb,
  p_items jsonb,
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.current_rebu_transaction_actor();
  perform private.lock_expected_client_points(coalesce(p_client_points, '[]'::jsonb));
  return public.edit_sale_transaction_unchecked_20260710(
    p_sale_id,
    p_sale_patch,
    p_items,
    coalesce(p_stock_deltas, '{}'::jsonb),
    coalesce(p_client_points, '[]'::jsonb)
  );
end;
$$;

create or replace function public.void_sale_transaction(
  p_sale_id text,
  p_voided_at timestamptz default now(),
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.current_rebu_transaction_actor();
  perform private.lock_expected_client_points(coalesce(p_client_points, '[]'::jsonb));
  return public.void_sale_transaction_unchecked_20260710(
    p_sale_id,
    p_voided_at,
    coalesce(p_stock_deltas, '{}'::jsonb),
    coalesce(p_client_points, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.apply_product_stock_delta(text, numeric)
from public, anon, authenticated;
revoke all on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.apply_product_stock_delta(text, numeric) to authenticated;
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) to authenticated;

-- Additive indexes for the most frequent ordered and incremental reads.
create index if not exists sales_created_at_id_idx
  on public.sales (created_at desc, id desc);
create index if not exists logs_created_at_id_idx
  on public.logs (created_at desc, id desc);
create index if not exists logs_action_created_at_id_idx
  on public.logs (action, created_at desc, id desc);
create index if not exists logs_user_id_created_at_id_idx
  on public.logs (user_id, created_at desc, id desc);
create index if not exists expenses_created_at_id_idx
  on public.expenses (created_at desc, id desc);
create index if not exists cash_closures_created_at_id_idx
  on public.cash_closures (created_at desc, id desc);

notify pgrst, 'reload schema';

commit;
