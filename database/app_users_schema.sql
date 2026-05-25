-- LEGACY BASELINE SCRIPT.
-- Prefer `app_users_safe_upgrade_2026_05_22.sql` for production or existing Supabase projects.
-- This file is kept as historical baseline/reference and may be unsafe to rerun on a DB
-- that already has app_users RPCs depending on app_users_public.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  display_name citext not null unique,
  role text not null check (role in ('system', 'owner', 'seller')),
  avatar text not null default '',
  name_color text not null default '#0f172a',
  theme text not null default 'light',
  metrics_view_mode text not null default 'modern' check (metrics_view_mode in ('modern', 'legacy')),
  password_hash text not null,
  is_active boolean not null default true,
  permissions_override jsonb not null default '{}'::jsonb,
  permissions_version integer not null default 1,
  force_reauth_permissions_version integer not null default 0,
  created_by uuid null references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users
  add column if not exists permissions_override jsonb not null default '{}'::jsonb;

alter table public.app_users
  add column if not exists permissions_version integer not null default 1;

alter table public.app_users
  add column if not exists force_reauth_permissions_version integer not null default 0;

alter table public.app_users
  add column if not exists metrics_view_mode text not null default 'modern';

alter table public.app_users
  drop constraint if exists app_users_metrics_view_mode_check;

alter table public.app_users
  add constraint app_users_metrics_view_mode_check check (metrics_view_mode in ('modern', 'legacy'));

create index if not exists app_users_role_idx on public.app_users (role);
create index if not exists app_users_is_active_idx on public.app_users (is_active);

create or replace function public.set_app_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_app_users_updated_at();

drop view if exists public.app_users_public;
create or replace view public.app_users_public as
select
  id,
  display_name,
  role,
  avatar,
  name_color,
  theme,
  metrics_view_mode,
  is_active
from public.app_users;

revoke all on public.app_users_public from public;
grant select on public.app_users_public to anon, authenticated;

create or replace function public.bootstrap_app_users(
  p_system_user jsonb,
  p_seller_user jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count from public.app_users;
  if existing_count > 0 then
    return;
  end if;

  insert into public.app_users (
    display_name,
    role,
    avatar,
    name_color,
    theme,
    metrics_view_mode,
    password_hash
  ) values (
    coalesce(nullif(trim(p_system_user ->> 'display_name'), ''), 'Sistema'),
    'system',
    coalesce(nullif(trim(p_system_user ->> 'avatar'), ''), 'SI'),
    coalesce(nullif(trim(p_system_user ->> 'name_color'), ''), '#4f46e5'),
    coalesce(nullif(trim(p_system_user ->> 'theme'), ''), 'light'),
    case when p_system_user ->> 'metrics_view_mode' = 'legacy' or p_system_user ->> 'metricsViewMode' = 'legacy' then 'legacy' else 'modern' end,
    extensions.crypt(coalesce(p_system_user ->> 'password', '1234'), extensions.gen_salt('bf'))
  );

  insert into public.app_users (
    display_name,
    role,
    avatar,
    name_color,
    theme,
    metrics_view_mode,
    password_hash,
    created_by
  )
  select
    coalesce(nullif(trim(p_seller_user ->> 'display_name'), ''), 'Caja'),
    'seller',
    coalesce(nullif(trim(p_seller_user ->> 'avatar'), ''), 'VE'),
    coalesce(nullif(trim(p_seller_user ->> 'name_color'), ''), '#059669'),
    coalesce(nullif(trim(p_seller_user ->> 'theme'), ''), 'light'),
    case when p_seller_user ->> 'metrics_view_mode' = 'legacy' or p_seller_user ->> 'metricsViewMode' = 'legacy' then 'legacy' else 'modern' end,
    extensions.crypt(coalesce(p_seller_user ->> 'password', '4321'), extensions.gen_salt('bf')),
    id
  from public.app_users
  where role = 'system'
  order by created_at asc
  limit 1;
end;
$$;

create or replace function public.verify_app_user_login(
  p_user_id uuid,
  p_password text
)
returns setof public.app_users_public
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
  where id = p_user_id
    and is_active = true
  limit 1;

  if matched_user.id is null then
    return;
  end if;

  if matched_user.password_hash = extensions.crypt(coalesce(p_password, ''), matched_user.password_hash) then
    return query
    select *
    from public.app_users_public
    where id = matched_user.id;
  end if;
end;
$$;

create or replace function public.create_app_user(
  p_actor_id uuid,
  p_display_name text,
  p_role text,
  p_password text,
  p_avatar text default '',
  p_name_color text default '#0f172a',
  p_theme text default 'light',
  p_metrics_view_mode text default 'modern'
)
returns setof public.app_users_public
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
  created_user_id uuid;
begin
  select *
  into actor_user
  from public.app_users
  where id = p_actor_id
    and is_active = true
  limit 1;

  if actor_user.id is null or actor_user.role <> 'system' then
    raise exception 'Solo Sistema puede crear usuarios';
  end if;

  if p_role not in ('owner', 'seller') then
    raise exception 'Rol invalido';
  end if;

  insert into public.app_users (
    display_name,
    role,
    avatar,
    name_color,
    theme,
    metrics_view_mode,
    password_hash,
    created_by
  ) values (
    trim(p_display_name),
    p_role,
    coalesce(nullif(trim(p_avatar), ''), upper(left(trim(p_display_name), 2))),
    coalesce(nullif(trim(p_name_color), ''), '#0f172a'),
    coalesce(nullif(trim(p_theme), ''), 'light'),
    case when p_metrics_view_mode = 'legacy' then 'legacy' else 'modern' end,
    extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf')),
    actor_user.id
  )
  returning id into created_user_id;

  return query
  select *
  from public.app_users_public
  where id = created_user_id;
end;
$$;

create or replace function public.update_app_user_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_display_name text,
  p_role text,
  p_avatar text,
  p_name_color text,
  p_theme text,
  p_metrics_view_mode text default 'modern'
)
returns setof public.app_users_public
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
  next_role text;
begin
  select * into actor_user from public.app_users where id = p_actor_id limit 1;
  select * into target_user from public.app_users where id = p_target_id limit 1;

  if actor_user.id is null or target_user.id is null then
    raise exception 'Usuario invalido';
  end if;

  if actor_user.id <> target_user.id and actor_user.role <> 'system' then
    raise exception 'No autorizado para editar este usuario';
  end if;

  next_role := target_user.role;
  if actor_user.role = 'system' and target_user.role <> 'system' and p_role in ('owner', 'seller') then
    next_role := p_role;
  end if;

  update public.app_users
  set
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    role = next_role,
    avatar = coalesce(nullif(trim(p_avatar), ''), avatar),
    name_color = coalesce(nullif(trim(p_name_color), ''), name_color),
    theme = coalesce(nullif(trim(p_theme), ''), theme),
    metrics_view_mode = case
      when p_metrics_view_mode in ('modern', 'legacy') then p_metrics_view_mode
      else metrics_view_mode
    end
  where id = target_user.id;

  return query
  select *
  from public.app_users_public
  where id = target_user.id;
end;
$$;

create or replace function public.update_app_user_password(
  p_actor_id uuid,
  p_target_id uuid,
  p_password text
)
returns setof public.app_users_public
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
begin
  select * into actor_user from public.app_users where id = p_actor_id limit 1;
  select * into target_user from public.app_users where id = p_target_id limit 1;

  if actor_user.id is null or target_user.id is null then
    raise exception 'Usuario invalido';
  end if;

  if actor_user.id <> target_user.id and actor_user.role <> 'system' then
    raise exception 'No autorizado para cambiar esta contraseña';
  end if;

  update public.app_users
  set password_hash = extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf'))
  where id = target_user.id;

  return query
  select *
  from public.app_users_public
  where id = target_user.id;
end;
$$;

create or replace function public.set_app_user_active(
  p_actor_id uuid,
  p_target_id uuid,
  p_is_active boolean
)
returns setof public.app_users_public
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
begin
  select * into actor_user from public.app_users where id = p_actor_id limit 1;
  select * into target_user from public.app_users where id = p_target_id limit 1;

  if actor_user.id is null or actor_user.role <> 'system' then
    raise exception 'Solo Sistema puede activar o desactivar usuarios';
  end if;

  if target_user.id is null then
    raise exception 'Usuario no encontrado';
  end if;

  if target_user.role = 'system' then
    raise exception 'No se puede desactivar el usuario Sistema';
  end if;

  update public.app_users
  set is_active = p_is_active
  where id = target_user.id;

  return query
  select *
  from public.app_users_public
  where id = target_user.id;
end;
$$;

create or replace function public.update_app_user_permissions(
  p_actor_id uuid,
  p_target_id uuid,
  p_permissions_override jsonb,
  p_apply_now boolean
)
returns setof public.app_users_public
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
  next_permissions_version integer;
begin
  select * into actor_user from public.app_users where id = p_actor_id limit 1;
  select * into target_user from public.app_users where id = p_target_id limit 1;

  if actor_user.id is null or target_user.id is null then
    raise exception 'Usuario invalido';
  end if;

  if target_user.role = 'system' then
    raise exception 'No se pueden editar permisos del usuario Sistema';
  end if;

  if actor_user.role = 'system' then
    if target_user.role not in ('owner', 'seller') then
      raise exception 'Rol objetivo invalido';
    end if;
  elsif actor_user.role = 'owner' then
    if target_user.role <> 'seller' then
      raise exception 'Dueño solo puede editar permisos de Usuarios de Caja';
    end if;
  else
    raise exception 'No autorizado para editar permisos';
  end if;

  next_permissions_version := greatest(coalesce(target_user.permissions_version, 1) + 1, 1);

  update public.app_users
  set
    permissions_override = coalesce(p_permissions_override, '{}'::jsonb),
    permissions_version = next_permissions_version,
    force_reauth_permissions_version = case
      when coalesce(p_apply_now, false) then next_permissions_version
      else force_reauth_permissions_version
    end
  where id = target_user.id;

  return query
  select *
  from public.app_users_public
  where id = target_user.id;
end;
$$;

revoke execute on function public.bootstrap_app_users(jsonb, jsonb) from anon;
grant execute on function public.bootstrap_app_users(jsonb, jsonb) to authenticated;
grant execute on function public.verify_app_user_login(uuid, text) to anon, authenticated;
revoke execute on function public.create_app_user(uuid, text, text, text, text, text, text, text) from anon;
revoke execute on function public.update_app_user_profile(uuid, uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.update_app_user_password(uuid, uuid, text) from anon;
revoke execute on function public.set_app_user_active(uuid, uuid, boolean) from anon;
revoke execute on function public.update_app_user_permissions(uuid, uuid, jsonb, boolean) from anon;
grant execute on function public.create_app_user(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_app_user_profile(uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_app_user_password(uuid, uuid, text) to authenticated;
grant execute on function public.set_app_user_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.update_app_user_permissions(uuid, uuid, jsonb, boolean) to authenticated;
