do $do$
begin
  if to_regclass('public.app_users') is not null then
    execute 'alter table public.app_users add column if not exists auth_user_id uuid null';
    execute 'alter table public.app_users add column if not exists auth_email citext null';
    execute 'create unique index if not exists app_users_auth_user_id_key on public.app_users (auth_user_id) where auth_user_id is not null';
    execute 'create unique index if not exists app_users_auth_email_key on public.app_users (auth_email) where auth_email is not null';
  end if;

  execute $fn$
    create or replace function public.verify_app_user_login_auth_bridge(
      p_user_id uuid,
      p_password text
    )
    returns table (
      id uuid,
      display_name text,
      role text,
      avatar text,
      name_color text,
      theme text,
      metrics_view_mode text,
      is_active boolean,
      permissions_override jsonb,
      permissions_version integer,
      force_reauth_permissions_version integer,
      created_at timestamptz,
      updated_at timestamptz,
      created_by uuid,
      auth_user_id uuid,
      auth_email text
    )
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      matched_user public.app_users;
    begin
      select *
      into matched_user
      from public.app_users
      where app_users.id = p_user_id
        and app_users.is_active = true
      limit 1;

      if matched_user.id is null then
        return;
      end if;

      if matched_user.password_hash = extensions.crypt(coalesce(p_password, ''), matched_user.password_hash) then
        return query
        select
          u.id,
          u.display_name::text,
          u.role,
          u.avatar,
          u.name_color,
          u.theme,
          u.metrics_view_mode,
          u.is_active,
          u.permissions_override,
          u.permissions_version,
          u.force_reauth_permissions_version,
          u.created_at,
          u.updated_at,
          u.created_by,
          u.auth_user_id,
          u.auth_email::text
        from public.app_users u
        where u.id = matched_user.id;
      end if;
    end;
    $body$
  $fn$;

  execute $fn$
    create or replace function public.get_current_auth_app_user()
    returns table (
      id uuid,
      display_name text,
      role text,
      avatar text,
      name_color text,
      theme text,
      metrics_view_mode text,
      is_active boolean,
      permissions_override jsonb,
      permissions_version integer,
      force_reauth_permissions_version integer,
      created_at timestamptz,
      updated_at timestamptz,
      created_by uuid,
      auth_user_id uuid,
      auth_email text
    )
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      current_auth_user_id uuid := auth.uid();
    begin
      if current_auth_user_id is null then
        raise exception 'Sesion de Supabase Auth requerida.';
      end if;

      return query
      select
        u.id,
        u.display_name::text,
        u.role,
        u.avatar,
        u.name_color,
        u.theme,
        u.metrics_view_mode,
        u.is_active,
        u.permissions_override,
        u.permissions_version,
        u.force_reauth_permissions_version,
        u.created_at,
        u.updated_at,
        u.created_by,
        u.auth_user_id,
        u.auth_email::text
      from public.app_users u
      where u.auth_user_id = current_auth_user_id
        and u.is_active = true
      limit 1;
    end;
    $body$
  $fn$;

  execute $fn$
    create or replace function public.link_current_auth_user_to_app_user(
      p_app_user_id uuid,
      p_password text
    )
    returns table (
      id uuid,
      auth_user_id uuid,
      auth_email text
    )
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      current_auth_user_id uuid := auth.uid();
      current_auth_email text := nullif(auth.jwt() ->> 'email', '');
      matched_user public.app_users;
    begin
      if current_auth_user_id is null then
        raise exception 'Sesion de Supabase Auth requerida.';
      end if;

      select *
      into matched_user
      from public.app_users
      where app_users.id = p_app_user_id
        and app_users.is_active = true
      limit 1;

      if matched_user.id is null then
        raise exception 'Usuario Rebu invalido o inactivo.';
      end if;

      if matched_user.password_hash <> extensions.crypt(coalesce(p_password, ''), matched_user.password_hash) then
        raise exception 'Contrasena Rebu incorrecta.';
      end if;

      if matched_user.auth_user_id is not null and matched_user.auth_user_id <> current_auth_user_id then
        raise exception 'Este usuario Rebu ya esta vinculado a otra cuenta Auth.';
      end if;

      update public.app_users
      set
        auth_user_id = current_auth_user_id,
        auth_email = coalesce(current_auth_email::citext, auth_email),
        updated_at = now()
      where app_users.id = p_app_user_id;

      return query
      select u.id, u.auth_user_id, u.auth_email::text
      from public.app_users u
      where u.id = p_app_user_id;
    end;
    $body$
  $fn$;

  execute 'revoke all on function public.verify_app_user_login_auth_bridge(uuid, text) from public';
  execute 'revoke all on function public.get_current_auth_app_user() from public';
  execute 'revoke all on function public.link_current_auth_user_to_app_user(uuid, text) from public';

  execute 'grant execute on function public.verify_app_user_login_auth_bridge(uuid, text) to anon, authenticated';
  execute 'grant execute on function public.get_current_auth_app_user() to authenticated';
  execute 'grant execute on function public.link_current_auth_user_to_app_user(uuid, text) to authenticated';

  perform pg_notify('pgrst', 'reload schema');
end
$do$;
