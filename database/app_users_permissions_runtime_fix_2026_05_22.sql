-- Runtime permissions fix for the custom Rebu app login.
-- Safer variant:
-- - Keeps app_users_public minimal.
-- - Returns permissions only after password/RPC validation.
-- - Does not grant anon access to create/update/password/admin user RPCs.
-- Safe to run more than once.

create or replace function public.verify_app_user_login_private(
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
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
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
      u.created_by
    from public.app_users u
    where u.id = matched_user.id;
  end if;
end;
$$;

create or replace function public.list_app_users_private(
  p_actor_id uuid,
  p_include_inactive boolean default false
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
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
begin
  select *
  into actor_user
  from public.app_users
  where app_users.id = p_actor_id
    and app_users.is_active = true
  limit 1;

  if actor_user.id is null then
    raise exception 'Usuario actor invalido o inactivo.';
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
    u.created_by
  from public.app_users u
  where (p_include_inactive or u.is_active = true)
    and (
      actor_user.role = 'system'
      or (actor_user.role = 'owner' and (u.role = 'seller' or u.id = actor_user.id))
      or u.id = actor_user.id
    )
  order by u.role asc, u.display_name asc;
end;
$$;

revoke all on function public.verify_app_user_login_private(uuid, text) from public;
revoke all on function public.list_app_users_private(uuid, boolean) from public;

grant execute on function public.verify_app_user_login_private(uuid, text) to anon, authenticated;
grant execute on function public.list_app_users_private(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
