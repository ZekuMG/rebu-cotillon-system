do $$
declare
  publication_tables text[];
  request_device_definition text;
  whatsapp_budget_definition text;
  invalid_auth_links integer;
  product_supplier_default text;
  failures text[] := array[]::text[];
begin
  -- 20260609_product_supplier_links
  select column_info.column_default
  into product_supplier_default
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'products'
    and column_info.column_name = 'supplier_links'
    and column_info.data_type = 'jsonb'
    and column_info.is_nullable = 'NO';

  if product_supplier_default is null
    or to_regclass('public.products_supplier_links_gin_idx') is null then
    failures := array_append(failures, 'product supplier links');
  end if;

  -- 20260710192217_harden_transaction_rpc_auth_and_points
  if to_regprocedure('private.lock_expected_client_points(jsonb)') is null
    or to_regprocedure('public.apply_product_stock_delta(text,numeric)') is null
    or to_regprocedure('public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.edit_sale_transaction(text,jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.void_sale_transaction(text,timestamptz,jsonb,jsonb)') is null
    or to_regprocedure('public.apply_product_stock_delta_unchecked_20260710(text,numeric)') is null
    or to_regprocedure('public.register_sale_transaction_unchecked_20260710(jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.edit_sale_transaction_unchecked_20260710(text,jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.void_sale_transaction_unchecked_20260710(text,timestamptz,jsonb,jsonb)') is null then
    failures := array_append(failures, 'protected sales RPCs');
  end if;

  if has_function_privilege('anon', 'public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.register_sale_transaction(jsonb,jsonb,jsonb,jsonb)', 'execute')
    or coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.register_sale_transaction_unchecked_20260710(jsonb,jsonb,jsonb,jsonb)')::oid,
      'execute'
    ), true) then
    failures := array_append(failures, 'sales RPC privileges');
  end if;

  -- 20260727_whatsapp_budget_idempotency and the later permission hardening.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'whatsapp_operation_key'
  )
    or to_regclass('public.budgets_whatsapp_operation_key_uidx') is null
    or to_regprocedure('public.create_whatsapp_budget_once(text,jsonb)') is null then
    failures := array_append(failures, 'WhatsApp budget idempotency');
  end if;

  select pg_get_functiondef('public.create_whatsapp_budget_once(text,jsonb)'::regprocedure)
  into whatsapp_budget_definition;
  if position('whatsapp.budget.approve' in whatsapp_budget_definition) = 0
    or position('items_snapshot' in whatsapp_budget_definition) = 0
    or has_function_privilege('anon', 'public.create_whatsapp_budget_once(text,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.create_whatsapp_budget_once(text,jsonb)', 'execute') then
    failures := array_append(failures, 'WhatsApp budget permission hardening');
  end if;

  -- 20260728000000_realtime_publication
  select array_agg(publication_table.tablename order by publication_table.tablename)
  into publication_tables
  from pg_publication_tables as publication_table
  where publication_table.pubname = 'supabase_realtime'
    and publication_table.schemaname = 'public';

  if not array[
    'agenda_contacts', 'app_users', 'cash_closures', 'categories', 'clients',
    'expenses', 'logs', 'offers', 'products', 'register_state', 'rewards', 'sales'
  ]::text[] <@ coalesce(publication_tables, array[]::text[]) then
    failures := array_append(failures, 'Realtime publication');
  end if;

  -- 20260803_read_path_indexes
  if to_regclass('public.sales_created_at_id_idx') is null
    or to_regclass('public.logs_created_at_id_idx') is null
    or to_regclass('public.logs_action_created_at_id_idx') is null
    or to_regclass('public.logs_user_id_created_at_id_idx') is null
    or to_regclass('public.expenses_created_at_id_idx') is null
    or to_regclass('public.cash_closures_created_at_id_idx') is null then
    failures := array_append(failures, 'read-path indexes');
  end if;

  -- 20260816234500, 20260817010000 and 20260818230000 device access chain.
  if to_regclass('public.whatsapp_device_access_requests') is null
    or not coalesce((
      select relation.relrowsecurity
      from pg_class as relation
      where relation.oid = 'public.whatsapp_device_access_requests'::regclass
    ), false)
    or to_regprocedure('private.require_whatsapp_device_actor(boolean)') is null
    or to_regprocedure('public.get_my_whatsapp_device_access(uuid,text)') is null
    or to_regprocedure('public.request_whatsapp_device_access(uuid,text,text,text)') is null
    or to_regprocedure('public.list_whatsapp_device_access_requests()') is null
    or to_regprocedure('public.review_whatsapp_device_access(uuid,text)') is null
    or to_regprocedure('public.authorize_whatsapp_device_access(uuid,text)') is null then
    failures := array_append(failures, 'WhatsApp device access objects');
  end if;

  select pg_get_functiondef('public.request_whatsapp_device_access(uuid,text,text,text)'::regprocedure)
  into request_device_definition;
  if position('token_hash = excluded.token_hash' in request_device_definition) = 0
    or has_function_privilege('anon', 'public.request_whatsapp_device_access(uuid,text,text,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.request_whatsapp_device_access(uuid,text,text,text)', 'execute') then
    failures := array_append(failures, 'rotated WhatsApp device token handling');
  end if;

  -- 20260817000000_sync_app_users_supabase_auth
  select count(*)::integer
  into invalid_auth_links
  from public.app_users as app_user
  left join auth.users as auth_user on auth_user.id = app_user.auth_user_id
  where app_user.is_active = true
    and app_user.password_hash is not null
    and (
      app_user.auth_user_id is null
      or app_user.auth_email is null
      or auth_user.id is null
      or not exists (
        select 1
        from auth.identities as identity
        where identity.user_id = app_user.auth_user_id
          and identity.provider = 'email'
      )
    );

  if invalid_auth_links <> 0 then
    failures := array_append(failures, format('%s active users are not linked to Supabase Auth', invalid_auth_links));
  end if;

  -- 20260822110000_product_images_authenticated_storage
  if to_regprocedure('private.is_active_rebu_storage_user()') is null
    or has_function_privilege('anon', 'private.is_active_rebu_storage_user()', 'execute')
    or not has_function_privilege('authenticated', 'private.is_active_rebu_storage_user()', 'execute')
    or (
      select count(*)
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'rebu_product_images_authenticated_select',
          'rebu_product_images_authenticated_insert',
          'rebu_product_images_authenticated_update',
          'rebu_product_images_authenticated_delete'
        )
    ) <> 4 then
    failures := array_append(failures, 'authenticated product image storage');
  end if;

  if cardinality(failures) > 0 then
    raise exception 'Historical verification failed: %', array_to_string(failures, '; ');
  end if;

  raise notice 'All historical migration effects are present in production';
end;
$$;
