do $$
declare
  actor_before public.app_users%rowtype;
  actor_after public.app_users%rowtype;
  linked_user record;
  test_password text := 'codex-auth-link-smoke-only';
  function_is_definer boolean;
  function_config text[];
begin
  select app_user.* into actor_before
  from public.app_users as app_user
  where app_user.is_active = true
    and app_user.auth_user_id is not null
  order by app_user.id
  limit 1;

  if actor_before.id is null then
    raise exception 'No linked active actor is available for the auth-link smoke test';
  end if;

  perform set_config('request.jwt.claim.sub', actor_before.auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claim.email',
    coalesce(actor_before.auth_email::text, 'codex-auth-link-smoke@rebu.app'),
    true
  );

  begin
    update public.app_users
    set password_hash = extensions.crypt(test_password, extensions.gen_salt('bf'))
    where id = actor_before.id;

    select * into linked_user
    from public.link_current_auth_user_to_app_user(actor_before.id, test_password);

    if linked_user.id is distinct from actor_before.id
      or linked_user.auth_user_id is distinct from actor_before.auth_user_id then
      raise exception 'Auth-link RPC returned an unexpected user';
    end if;

    raise exception 'AUTH_LINK_SMOKE_ROLLBACK';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'AUTH_LINK_SMOKE_ROLLBACK' then
      raise;
    end if;
  end;

  select app_user.* into actor_after
  from public.app_users as app_user
  where app_user.id = actor_before.id;

  if actor_after.password_hash is distinct from actor_before.password_hash
    or actor_after.auth_user_id is distinct from actor_before.auth_user_id
    or actor_after.auth_email is distinct from actor_before.auth_email
    or actor_after.updated_at is distinct from actor_before.updated_at then
    raise exception 'Auth-link smoke test did not roll back the actor update';
  end if;

  select function_info.prosecdef, function_info.proconfig
  into function_is_definer, function_config
  from pg_catalog.pg_proc as function_info
  where function_info.oid = 'public.link_current_auth_user_to_app_user(uuid,text)'::regprocedure;

  if not function_is_definer or not (function_config @> array['search_path=""']) then
    raise exception 'Auth-link function security configuration is invalid';
  end if;
  if has_function_privilege('anon', 'public.link_current_auth_user_to_app_user(uuid,text)', 'execute') then
    raise exception 'Anonymous role can execute the auth-link function';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.link_current_auth_user_to_app_user(uuid,text)',
    'execute'
  ) then
    raise exception 'Authenticated role cannot execute the auth-link function';
  end if;

  raise notice 'Auth-link RPC smoke test passed; update rolled back and permissions are correct';
end;
$$;
