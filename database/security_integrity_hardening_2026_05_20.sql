-- Security and integrity hardening for Rebu Cotillon.
-- Run from Supabase SQL Editor after backing up the project.

-- ---------------------------------------------------------------------------
-- Sales soft-delete support
-- ---------------------------------------------------------------------------
alter table if exists public.sales
  add column if not exists status text not null default 'completed',
  add column if not exists voided_at timestamptz null;

create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_voided_at_idx on public.sales (voided_at desc) where voided_at is not null;

alter table if exists public.clients
  add column if not exists is_active boolean not null default true;

update public.clients
set is_active = true
where is_active is null;

alter table if exists public.clients
  alter column is_active set default true,
  alter column is_active set not null;

create index if not exists clients_is_active_name_idx on public.clients (is_active, name);

alter table if exists public.rewards
  add column if not exists is_active boolean not null default true;

create index if not exists rewards_is_active_points_idx on public.rewards (is_active, points_cost, id);

-- ---------------------------------------------------------------------------
-- Logs search support
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists logs_created_at_id_idx on public.logs (created_at desc, id desc);
create index if not exists logs_action_created_at_idx on public.logs (action, created_at desc);
create index if not exists logs_user_created_at_idx on public.logs ("user", created_at desc);
create index if not exists logs_action_trgm_idx on public.logs using gin (action gin_trgm_ops);
create index if not exists logs_user_trgm_idx on public.logs using gin ("user" gin_trgm_ops);
create index if not exists logs_reason_trgm_idx on public.logs using gin (reason gin_trgm_ops);
-- Optional heavy index: run manually during a quiet window if logs search over details is still slow.
-- create index if not exists logs_details_trgm_idx on public.logs using gin ((details::text) gin_trgm_ops);

create or replace function public.search_logs(
  p_search text default '',
  p_search_scope text default 'all',
  p_product_terms text[] default array[]::text[],
  p_actions text[] default array[]::text[],
  p_excluded_actions text[] default array[]::text[],
  p_action text default '',
  p_user_filter text default '',
  p_date_start timestamptz default null,
  p_date_end timestamptz default null,
  p_sort_column text default 'created_at',
  p_ascending boolean default false,
  p_offset integer default 0,
  p_limit integer default 101
)
returns setof public.logs
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_sort_column text := case
    when p_sort_column in ('action', 'user', 'created_at', 'id') then p_sort_column
    else 'created_at'
  end;
  safe_direction text := case when p_ascending then 'asc' else 'desc' end;
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  safe_limit integer := least(greatest(coalesce(p_limit, 101), 1), 250);
  normalized_search text := trim(coalesce(p_search, ''));
  normalized_scope text := lower(trim(coalesce(p_search_scope, 'all')));
  normalized_action text := trim(coalesce(p_action, ''));
  normalized_user text := trim(coalesce(p_user_filter, ''));
  user_id_filter text := '';
  user_name_filter text := '';
begin
  if normalized_user like 'id:%' then
    user_id_filter := split_part(split_part(normalized_user, '|', 1), ':', 2);
    user_name_filter := nullif(split_part(normalized_user, '|name:', 2), '');
  elsif normalized_user like 'name:%' then
    user_name_filter := substring(normalized_user from 6);
  else
    user_name_filter := normalized_user;
  end if;

  return query execute format(
    'select l.*
       from public.logs l
      where (coalesce(array_length($1, 1), 0) = 0 or l.action = any($1))
        and (coalesce(array_length($2, 1), 0) = 0 or not (l.action = any($2)))
        and (
          $3 = ''''
          or ($3 = ''Venta Modificada'' and l.action = any(array[''Venta Modificada'', ''Modificación Pedido'', ''Modificacion Pedido'']))
          or l.action = $3
        )
        and ($4 is null or l.created_at >= $4)
        and ($5 is null or l.created_at <= $5)
        and (
          $6 = ''''
          or l.id::text = $6
          or ($7 <> '''' and l."user" ilike ''%%'' || $7 || ''%%'')
        )
        and (
          $8 = ''''
          or (
            $9 = ''user''
            and l."user" ilike ''%%'' || $8 || ''%%''
          )
          or (
            $9 = ''action''
            and (l.action ilike ''%%'' || $8 || ''%%'' or coalesce(l.reason, '''') ilike ''%%'' || $8 || ''%%'')
          )
          or (
            $9 in (''id'', ''product'')
            and coalesce(l.details::text, '''') ilike ''%%'' || $8 || ''%%''
          )
          or (
            $9 not in (''user'', ''action'', ''id'', ''product'')
            and (
              l.action ilike ''%%'' || $8 || ''%%''
              or coalesce(l.reason, '''') ilike ''%%'' || $8 || ''%%''
              or l."user" ilike ''%%'' || $8 || ''%%''
              or l.created_at::text ilike ''%%'' || $8 || ''%%''
              or coalesce(l.details::text, '''') ilike ''%%'' || $8 || ''%%''
            )
          )
        )
        and (
          coalesce(array_length($10, 1), 0) = 0
          or exists (
            select 1
              from unnest($10) as product_term
             where coalesce(l.details::text, '''') ilike ''%%'' || product_term || ''%%''
          )
        )
      order by %I %s, l.created_at desc, l.id desc
      offset $11
      limit $12',
    safe_sort_column,
    safe_direction
  )
  using
    coalesce(p_actions, array[]::text[]),
    coalesce(p_excluded_actions, array[]::text[]),
    normalized_action,
    p_date_start,
    p_date_end,
    coalesce(user_id_filter, ''),
    coalesce(user_name_filter, ''),
    normalized_search,
    normalized_scope,
    coalesce(p_product_terms, array[]::text[]),
    safe_offset,
    safe_limit;
end;
$$;

revoke all on function public.search_logs(text, text, text[], text[], text[], text, text, timestamptz, timestamptz, text, boolean, integer, integer) from public;
grant execute on function public.search_logs(text, text, text[], text[], text[], text, text, timestamptz, timestamptz, text, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic stock updates
-- ---------------------------------------------------------------------------
create or replace function public.apply_product_stock_delta(
  p_product_id text,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  next_stock numeric;
begin
  if p_product_id is null or trim(p_product_id) = '' then
    raise exception 'Producto invalido';
  end if;

  update public.products
  set stock = stock + coalesce(p_delta, 0)
  where id::text = p_product_id::text
    and stock + coalesce(p_delta, 0) >= 0
  returning stock into next_stock;

  if next_stock is null then
    raise exception 'Stock insuficiente o producto no encontrado';
  end if;

  return next_stock;
end;
$$;

revoke all on function public.apply_product_stock_delta(text, numeric) from public;
grant execute on function public.apply_product_stock_delta(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Transactional sale registration
-- ---------------------------------------------------------------------------
create or replace function public.register_sale_transaction(
  p_sale jsonb,
  p_items jsonb,
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_sale_columns constant text[] := array[
    'total',
    'payment_method',
    'payment_breakdown',
    'installments',
    'client_id',
    'points_earned',
    'points_spent',
    'user_id',
    'user_role',
    'user_name',
    'cash_received',
    'cash_change',
    'created_at',
    'status'
  ];
  allowed_item_columns constant text[] := array[
    'sale_id',
    'product_id',
    'product_title',
    'quantity',
    'price',
    'subtotal',
    'product_type',
    'is_reward',
    'cost',
    'is_custom',
    'is_discount',
    'is_combo'
  ];
  sale_columns text[];
  item_columns text[];
  sale_id text;
  item_payload jsonb;
  stock_entry record;
  points_entry record;
  sql text;
begin
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    raise exception 'Payload de venta invalido';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Payload de items invalido';
  end if;

  select array_agg(column_name order by array_position(allowed_sale_columns, column_name))
  into sale_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sales'
    and column_name = any(allowed_sale_columns)
    and p_sale ? column_name;

  if coalesce(array_length(sale_columns, 1), 0) = 0 then
    raise exception 'No hay columnas validas para insertar venta';
  end if;

  sql := format(
    'insert into public.sales (%1$s) select %1$s from jsonb_populate_record(null::public.sales, $1) returning id::text',
    array_to_string(array(select quote_ident(column_name) from unnest(sale_columns) as column_name), ', ')
  );
  execute sql using p_sale into sale_id;

  item_payload := (
    select coalesce(
      jsonb_agg(jsonb_set(item, '{sale_id}', to_jsonb(sale_id), true)),
      '[]'::jsonb
    )
    from jsonb_array_elements(p_items) as item
  );

  select array_agg(column_name order by array_position(allowed_item_columns, column_name))
  into item_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sale_items'
    and column_name = any(allowed_item_columns)
    and (
      column_name = 'sale_id'
      or exists (
        select 1
        from jsonb_array_elements(item_payload) as item
        where item ? column_name
      )
    );

  if coalesce(jsonb_array_length(item_payload), 0) > 0 and coalesce(array_length(item_columns, 1), 0) > 0 then
    sql := format(
      'insert into public.sale_items (%1$s) select %1$s from jsonb_populate_recordset(null::public.sale_items, $1)',
      array_to_string(array(select quote_ident(column_name) from unnest(item_columns) as column_name), ', ')
    );
    execute sql using item_payload;
  end if;

  for stock_entry in
    select key as product_id, value::text::numeric as delta
    from jsonb_each(coalesce(p_stock_deltas, '{}'::jsonb))
  loop
    perform public.apply_product_stock_delta(stock_entry.product_id, stock_entry.delta);
  end loop;

  for points_entry in
    select
      value ->> 'client_id' as client_id,
      (value ->> 'points')::numeric as points
    from jsonb_array_elements(coalesce(p_client_points, '[]'::jsonb))
  loop
    if points_entry.client_id is not null then
      update public.clients
      set points = points_entry.points
      where id::text = points_entry.client_id;
    end if;
  end loop;

  return jsonb_build_object('id', sale_id);
end;
$$;

revoke all on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) to authenticated;

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
set search_path = public
as $$
declare
  allowed_sale_columns constant text[] := array[
    'total',
    'payment_method',
    'payment_breakdown',
    'installments',
    'client_id',
    'points_earned',
    'points_spent',
    'cash_received',
    'cash_change',
    'status'
  ];
  allowed_item_columns constant text[] := array[
    'sale_id',
    'product_id',
    'product_title',
    'quantity',
    'price',
    'subtotal',
    'product_type',
    'is_reward',
    'cost',
    'is_custom',
    'is_discount',
    'is_combo'
  ];
  sale_columns text[];
  item_columns text[];
  item_payload jsonb;
  stock_entry record;
  points_entry record;
  sql text;
begin
  if p_sale_id is null or trim(p_sale_id) = '' then
    raise exception 'Venta invalida';
  end if;

  if p_sale_patch is null or jsonb_typeof(p_sale_patch) <> 'object' then
    raise exception 'Payload de venta invalido';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Payload de items invalido';
  end if;

  perform 1
  from public.sales
  where id::text = p_sale_id;

  if not found then
    raise exception 'Venta inexistente';
  end if;

  select array_agg(column_name order by array_position(allowed_sale_columns, column_name))
  into sale_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sales'
    and column_name = any(allowed_sale_columns)
    and p_sale_patch ? column_name;

  if coalesce(array_length(sale_columns, 1), 0) > 0 then
    sql := format(
      'update public.sales as target set %s from jsonb_populate_record(null::public.sales, $1) as patch where target.id::text = $2',
      array_to_string(array(
        select format('%1$I = patch.%1$I', column_name)
        from unnest(sale_columns) as column_name
      ), ', ')
    );
    execute sql using p_sale_patch, p_sale_id;
  end if;

  delete from public.sale_items where sale_id::text = p_sale_id;

  item_payload := (
    select coalesce(
      jsonb_agg(jsonb_set(item, '{sale_id}', to_jsonb(p_sale_id), true)),
      '[]'::jsonb
    )
    from jsonb_array_elements(p_items) as item
  );

  select array_agg(column_name order by array_position(allowed_item_columns, column_name))
  into item_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sale_items'
    and column_name = any(allowed_item_columns)
    and (
      column_name = 'sale_id'
      or exists (
        select 1
        from jsonb_array_elements(item_payload) as item
        where item ? column_name
      )
    );

  if coalesce(jsonb_array_length(item_payload), 0) > 0 and coalesce(array_length(item_columns, 1), 0) > 0 then
    sql := format(
      'insert into public.sale_items (%1$s) select %1$s from jsonb_populate_recordset(null::public.sale_items, $1)',
      array_to_string(array(select quote_ident(column_name) from unnest(item_columns) as column_name), ', ')
    );
    execute sql using item_payload;
  end if;

  for stock_entry in
    select key as product_id, value::text::numeric as delta
    from jsonb_each(coalesce(p_stock_deltas, '{}'::jsonb))
  loop
    perform public.apply_product_stock_delta(stock_entry.product_id, stock_entry.delta);
  end loop;

  for points_entry in
    select
      value ->> 'client_id' as client_id,
      (value ->> 'points')::numeric as points
    from jsonb_array_elements(coalesce(p_client_points, '[]'::jsonb))
  loop
    if points_entry.client_id is not null then
      update public.clients
      set points = points_entry.points
      where id::text = points_entry.client_id;
    end if;
  end loop;

  return jsonb_build_object('id', p_sale_id);
end;
$$;

revoke all on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.void_sale_transaction(
  p_sale_id text,
  p_voided_at timestamptz default now(),
  p_stock_deltas jsonb default '{}'::jsonb,
  p_client_points jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_entry record;
  points_entry record;
  affected_rows integer;
begin
  if p_sale_id is null or trim(p_sale_id) = '' then
    raise exception 'Venta invalida';
  end if;

  update public.sales
  set
    status = 'voided',
    voided_at = coalesce(p_voided_at, now())
  where id::text = p_sale_id
    and coalesce(status, 'completed') <> 'voided';

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'Venta inexistente o ya anulada';
  end if;

  for stock_entry in
    select key as product_id, value::text::numeric as delta
    from jsonb_each(coalesce(p_stock_deltas, '{}'::jsonb))
  loop
    perform public.apply_product_stock_delta(stock_entry.product_id, stock_entry.delta);
  end loop;

  for points_entry in
    select
      value ->> 'client_id' as client_id,
      (value ->> 'points')::numeric as points
    from jsonb_array_elements(coalesce(p_client_points, '[]'::jsonb))
  loop
    if points_entry.client_id is not null then
      update public.clients
      set points = points_entry.points
      where id::text = points_entry.client_id;
    end if;
  end loop;

  return jsonb_build_object('id', p_sale_id, 'status', 'voided');
end;
$$;

revoke all on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) from public;
grant execute on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) to authenticated;

-- These transactional RPCs intentionally require Supabase Auth (or a trusted backend)
-- and must not be granted to anon while the desktop app still ships an anon key.

notify pgrst, 'reload schema';
