begin;

-- Extend the shared authenticated actor snapshot so the existing permission
-- helpers can authorize supplier-price mutations inside the database.
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
    raise exception 'Sesion Supabase Auth requerida' using errcode = '42501';
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

revoke all on function private.current_rebu_transaction_actor()
from public, anon, authenticated;

create or replace function public.apply_supplier_product_updates_batch(
  p_action text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  requested_count integer;
  locked_count integer;
  updated_count integer;
  updated_products jsonb;
begin
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'bulkEditor.view');
  perform private.require_rebu_permission(actor, 'inventory.edit');

  if normalized_action <> all(array['review', 'ignore', 'approve', 'undo', 'link']) then
    raise exception 'Accion de costos de proveedor invalida';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'El lote de costos debe ser un arreglo JSON';
  end if;

  requested_count := jsonb_array_length(p_updates);
  if requested_count < 1 or requested_count > 500 then
    raise exception 'El lote debe contener entre 1 y 500 productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz,
      purchase_price numeric,
      sale_price numeric,
      apply_purchase_price boolean,
      apply_sale_price boolean,
      supplier_links jsonb
    )
    where update_row.product_id is null
      or update_row.supplier_links is null
      or jsonb_typeof(update_row.supplier_links) <> 'object'
      or (
        coalesce(update_row.apply_purchase_price, false)
        and (update_row.purchase_price is null or update_row.purchase_price <= 0)
      )
      or (
        coalesce(update_row.apply_sale_price, false)
        and (update_row.sale_price is null or update_row.sale_price <= 0)
      )
  ) then
    raise exception 'El lote contiene datos de producto invalidos';
  end if;

  if (
    select count(distinct update_row.product_id)
    from jsonb_to_recordset(p_updates) as update_row(product_id bigint)
  ) <> requested_count then
    raise exception 'El lote contiene productos duplicados';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(
      apply_purchase_price boolean,
      apply_sale_price boolean
    )
    where (
      normalized_action in ('review', 'ignore', 'link')
      and (
        coalesce(update_row.apply_purchase_price, false)
        or coalesce(update_row.apply_sale_price, false)
      )
    ) or (
      normalized_action = 'undo'
      and (
        not coalesce(update_row.apply_purchase_price, false)
        or coalesce(update_row.apply_sale_price, false)
      )
    ) or (
      normalized_action = 'approve'
      and not coalesce(update_row.apply_purchase_price, false)
    )
  ) then
    raise exception 'La accion no coincide con los campos solicitados';
  end if;

  -- Deterministic locking keeps the transaction short and prevents deadlocks
  -- when two terminals happen to touch overlapping product sets.
  perform product.id
  from public.products as product
  join jsonb_to_recordset(p_updates) as update_row(product_id bigint)
    on product.id = update_row.product_id
  order by product.id
  for update of product;
  get diagnostics locked_count = row_count;

  if locked_count <> requested_count then
    raise exception 'Uno o mas productos del lote ya no existen';
  end if;

  if exists (
    select 1
    from public.products as product
    join jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz
    ) on product.id = update_row.product_id
    where update_row.expected_updated_at is not null
      and product.updated_at is distinct from update_row.expected_updated_at
  ) then
    raise exception 'El inventario cambio en otra terminal. Recarga y volve a intentar.'
      using errcode = '40001';
  end if;

  with input_rows as (
    select *
    from jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz,
      purchase_price numeric,
      sale_price numeric,
      apply_purchase_price boolean,
      apply_sale_price boolean,
      supplier_links jsonb
    )
  ),
  updated as (
    update public.products as product
    set
      "purchasePrice" = case
        when normalized_action in ('approve', 'undo')
          and coalesce(input_rows.apply_purchase_price, false)
          then input_rows.purchase_price
        else product."purchasePrice"
      end,
      price = case
        when normalized_action = 'approve'
          and coalesce(input_rows.apply_sale_price, false)
          then input_rows.sale_price
        else product.price
      end,
      supplier_links = input_rows.supplier_links
    from input_rows
    where product.id = input_rows.product_id
    returning product.*
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(updated) order by updated.id), '[]'::jsonb)
  into updated_count, updated_products
  from updated;

  if updated_count <> requested_count then
    raise exception 'No se pudo completar el lote de costos';
  end if;

  return jsonb_build_object(
    'action', normalized_action,
    'count', updated_count,
    'products', updated_products
  );
end;
$$;

revoke all on function public.apply_supplier_product_updates_batch(text, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_supplier_product_updates_batch(text, jsonb)
to authenticated;

notify pgrst, 'reload schema';

commit;
