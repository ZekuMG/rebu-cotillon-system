do $$
declare
  actor_profile jsonb;
  actor_auth_id uuid;
  target_product public.products%rowtype;
  post_test_product public.products%rowtype;
  rpc_result jsonb;
  function_is_definer boolean;
  function_config text[];
begin
  select
    jsonb_build_object(
      'id', app_user.id,
      'role', app_user.role,
      'display_name', app_user.display_name,
      'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
    ),
    app_user.auth_user_id
  into actor_profile, actor_auth_id
  from public.app_users as app_user
  where app_user.is_active = true
    and app_user.auth_user_id is not null
    and private.rebu_actor_can(
      jsonb_build_object(
        'id', app_user.id,
        'role', app_user.role,
        'display_name', app_user.display_name,
        'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
      ),
      'bulkEditor.view'
    )
    and private.rebu_actor_can(
      jsonb_build_object(
        'id', app_user.id,
        'role', app_user.role,
        'display_name', app_user.display_name,
        'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
      ),
      'inventory.edit'
    )
  order by app_user.id
  limit 1;

  if actor_auth_id is null then
    raise exception 'No active authorized actor is available for the supplier batch smoke test';
  end if;

  select product.*
  into target_product
  from public.products as product
  order by product.id
  limit 1;

  if target_product.id is null then
    raise exception 'No product is available for the supplier batch smoke test';
  end if;

  perform set_config('request.jwt.claim.sub', actor_auth_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    rpc_result := public.apply_supplier_product_updates_batch(
      'review',
      jsonb_build_array(
        jsonb_build_object(
          'product_id', target_product.id,
          'expected_updated_at', target_product.updated_at,
          'purchase_price', null,
          'sale_price', null,
          'apply_purchase_price', false,
          'apply_sale_price', false,
          'supplier_links', coalesce(target_product.supplier_links, '{}'::jsonb)
        )
      )
    );

    if (rpc_result ->> 'count')::integer <> 1 then
      raise exception 'Supplier batch smoke test returned an unexpected result: %', rpc_result;
    end if;

    -- An exception rolls back every write made inside this nested block. The
    -- handler only accepts this exact sentinel and rethrows any real failure.
    raise exception 'SUPPLIER_BATCH_SMOKE_ROLLBACK';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'SUPPLIER_BATCH_SMOKE_ROLLBACK' then
      raise;
    end if;
  end;

  select product.*
  into post_test_product
  from public.products as product
  where product.id = target_product.id;

  if post_test_product.updated_at is distinct from target_product.updated_at
    or post_test_product.supplier_links is distinct from target_product.supplier_links
    or post_test_product."purchasePrice" is distinct from target_product."purchasePrice"
    or post_test_product.price is distinct from target_product.price then
    raise exception 'Supplier batch smoke test did not roll back the product update';
  end if;

  select function_info.prosecdef, function_info.proconfig
  into function_is_definer, function_config
  from pg_catalog.pg_proc as function_info
  where function_info.oid = 'public.apply_supplier_product_updates_batch(text,jsonb)'::regprocedure;

  if not function_is_definer or not (function_config @> array['search_path=""']) then
    raise exception 'Supplier batch function security configuration is invalid';
  end if;

  if has_function_privilege('anon', 'public.apply_supplier_product_updates_batch(text,jsonb)', 'execute') then
    raise exception 'Anonymous role can execute the supplier batch function';
  end if;

  if not has_function_privilege('authenticated', 'public.apply_supplier_product_updates_batch(text,jsonb)', 'execute') then
    raise exception 'Authenticated role cannot execute the supplier batch function';
  end if;

  raise notice 'Supplier batch smoke test passed; write was rolled back and function permissions are correct';
end;
$$;
