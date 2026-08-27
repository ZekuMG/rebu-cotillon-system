do $$
declare
  actor_profile jsonb;
  actor_auth_id uuid;
  target_product public.products%rowtype;
  post_test_product public.products%rowtype;
  returned_stock numeric;
  sale_result jsonb;
  test_sale_id text;
  test_marker text := 'codex_core_rpc_smoke_' || txid_current()::text;
  function_name text;
  function_signature text;
  function_is_definer boolean;
  function_config text[];
begin
  select
    jsonb_build_object(
      'id', app_user.id,
      'role', app_user.role,
      'display_name', app_user.display_name
    ),
    app_user.auth_user_id
  into actor_profile, actor_auth_id
  from public.app_users as app_user
  where app_user.is_active = true
    and app_user.auth_user_id is not null
  order by app_user.id
  limit 1;

  if actor_auth_id is null then
    raise exception 'No active authenticated actor is available for the core sales smoke test';
  end if;

  select product.*
  into target_product
  from public.products as product
  where product.is_active is true and product.deleted_at is null
  order by product.id
  limit 1;

  if target_product.id is null then
    raise exception 'No active product is available for the core sales smoke test';
  end if;

  perform set_config('request.jwt.claim.sub', actor_auth_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    returned_stock := public.apply_product_stock_delta(target_product.id::text, 0);
    if returned_stock is distinct from target_product.stock then
      raise exception 'Stock RPC returned an unexpected value: expected %, received %',
        target_product.stock, returned_stock;
    end if;

    sale_result := public.register_sale_transaction(
      jsonb_build_object(
        'total', 1,
        'payment_method', 'Efectivo',
        'payment_breakdown', jsonb_build_array(jsonb_build_object(
          'method', 'Efectivo',
          'amount', 1,
          'surcharge', 0,
          'chargedAmount', 1
        )),
        'installments', 0,
        'cash_received', 1,
        'cash_change', 0,
        'points_earned', 0,
        'pointsSpent', 0,
        'status', 'completed'
      ),
      jsonb_build_array(jsonb_build_object(
        'product_id', null,
        'product_title', test_marker,
        'quantity', 1,
        'price', 1,
        'subtotal', 1,
        'cost', 0,
        'is_custom', true,
        'is_reward', false,
        'is_discount', false,
        'product_type', 'quantity'
      )),
      '{}'::jsonb,
      '[]'::jsonb
    );

    test_sale_id := sale_result ->> 'id';
    if coalesce(test_sale_id, '') = '' then
      raise exception 'Sale RPC did not return a sale id: %', sale_result;
    end if;
    if not exists (
      select 1 from public.sales as sale
      where sale.id::text = test_sale_id
        and sale.user_id::text = actor_profile ->> 'id'
    ) then
      raise exception 'Sale RPC did not persist the authenticated actor';
    end if;
    if not exists (
      select 1 from public.sale_items as item
      where item.sale_id::text = test_sale_id
        and item.product_title = test_marker
        and item.quantity = 1
        and item.price = 1
    ) then
      raise exception 'Sale RPC did not persist its item correctly';
    end if;

    -- The exact sentinel rolls back the product touch, sale and sale item.
    raise exception 'CORE_SALES_SMOKE_ROLLBACK';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CORE_SALES_SMOKE_ROLLBACK' then
      raise;
    end if;
  end;

  select product.*
  into post_test_product
  from public.products as product
  where product.id = target_product.id;

  if post_test_product.stock is distinct from target_product.stock
    or post_test_product.updated_at is distinct from target_product.updated_at then
    raise exception 'Core sales smoke test did not roll back the product update';
  end if;
  if exists (
    select 1 from public.sale_items as item where item.product_title = test_marker
  ) then
    raise exception 'Core sales smoke test left a sale item behind';
  end if;

  for function_name, function_signature in
    values
      ('apply_product_stock_delta', 'public.apply_product_stock_delta(text,numeric)'),
      ('register_sale_transaction', 'public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb)'),
      ('edit_sale_transaction', 'public.edit_sale_transaction(text,jsonb,jsonb,jsonb,jsonb)'),
      ('void_sale_transaction', 'public.void_sale_transaction(text,timestamptz,jsonb,jsonb)')
  loop
    select function_info.prosecdef, function_info.proconfig
    into function_is_definer, function_config
    from pg_catalog.pg_proc as function_info
    where function_info.oid = function_signature::regprocedure;

    if not function_is_definer or not (function_config @> array['search_path=""']) then
      raise exception 'Security configuration is invalid for %', function_name;
    end if;
    if has_function_privilege('anon', function_signature, 'execute') then
      raise exception 'Anonymous role can execute %', function_name;
    end if;
    if not has_function_privilege('authenticated', function_signature, 'execute') then
      raise exception 'Authenticated role cannot execute %', function_name;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.register_sale_transaction_unchecked_20260710(jsonb,jsonb,jsonb,jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.apply_product_stock_delta_unchecked_20260710(text,numeric)',
    'execute'
  ) then
    raise exception 'Authenticated role can bypass the protected sales wrappers';
  end if;

  raise notice 'Core sales RPC smoke test passed; all writes rolled back and permissions are correct';
end;
$$;
