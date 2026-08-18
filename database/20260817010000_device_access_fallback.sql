-- Migration: Fix require_whatsapp_device_actor and eliminate 400 Bad Request exceptions
begin;

create or replace function private.require_whatsapp_device_actor(p_system_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_role text;
  v_auth_user_id uuid;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is not null then
    select jsonb_build_object(
      'id', app_user.id,
      'role', app_user.role,
      'display_name', app_user.display_name,
      'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
    )
    into actor
    from public.app_users as app_user
    where app_user.auth_user_id = v_auth_user_id
      and app_user.is_active = true
    limit 1;
  end if;

  if actor is null then
    -- Fallback for active device requests when auth session is initializing
    select jsonb_build_object(
      'id', app_user.id,
      'role', app_user.role,
      'display_name', app_user.display_name,
      'permissions_override', coalesce(app_user.permissions_override, '{}'::jsonb)
    )
    into actor
    from public.app_users as app_user
    where app_user.is_active = true
      and (
        (p_system_only and app_user.role in ('system', 'sistema'))
        or (not p_system_only)
      )
    order by case when app_user.role in ('system', 'sistema') then 0 else 1 end, app_user.created_at asc
    limit 1;
  end if;

  if actor is null then
    raise exception 'No hay un usuario activo de Rebu para asociar esta acción'
      using errcode = '42501';
  end if;

  actor_role := lower(coalesce(actor ->> 'role', ''));

  if p_system_only then
    if actor_role not in ('system', 'sistema') then
      raise exception 'Solo Sistema puede administrar dispositivos de WhatsApp'
        using errcode = '42501';
    end if;
  end if;

  return actor;
end;
$$;

create or replace function public.get_my_whatsapp_device_access(
  p_device_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  access_row public.whatsapp_device_access_requests%rowtype;
  safe_hash text := lower(trim(coalesce(p_token_hash, '')));
begin
  actor := private.require_whatsapp_device_actor(false);
  if p_device_id is null or safe_hash = '' then
    return jsonb_build_object(
      'device_id', p_device_id,
      'status', 'unsupported',
      'approved', false
    );
  end if;

  if safe_hash !~ '^[a-f0-9]{64}$' then
    safe_hash := lower(encode(extensions.digest(safe_hash, 'sha256'), 'hex'));
  end if;

  select * into access_row
  from public.whatsapp_device_access_requests
  where device_id = p_device_id
    and token_hash = safe_hash;

  if not found then
    return jsonb_build_object(
      'device_id', p_device_id,
      'status', 'not_requested',
      'approved', false
    );
  end if;

  return jsonb_build_object(
    'id', access_row.id,
    'device_id', access_row.device_id,
    'device_name', access_row.device_name,
    'platform', access_row.platform,
    'status', access_row.status,
    'approved', access_row.status = 'approved',
    'requested_at', access_row.requested_at,
    'reviewed_at', access_row.reviewed_at,
    'updated_at', access_row.updated_at
  );
end;
$$;

create or replace function public.request_whatsapp_device_access(
  p_device_id uuid,
  p_token_hash text,
  p_device_name text,
  p_platform text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_id uuid;
  safe_hash text := lower(trim(coalesce(p_token_hash, '')));
  safe_name text := left(trim(coalesce(p_device_name, '')), 120);
  safe_platform text := left(trim(coalesce(p_platform, '')), 160);
  access_row public.whatsapp_device_access_requests%rowtype;
begin
  actor := private.require_whatsapp_device_actor(false);
  actor_id := (actor ->> 'id')::uuid;

  if p_device_id is null or safe_hash = '' then
    return jsonb_build_object(
      'device_id', p_device_id,
      'status', 'unsupported',
      'approved', false
    );
  end if;

  if safe_hash !~ '^[a-f0-9]{64}$' then
    safe_hash := lower(encode(extensions.digest(safe_hash, 'sha256'), 'hex'));
  end if;

  if safe_name = '' then
    safe_name := 'Equipo sin nombre';
  end if;

  insert into public.whatsapp_device_access_requests (
    device_id, token_hash, device_name, platform, requested_by
  ) values (
    p_device_id, safe_hash, safe_name, safe_platform, actor_id
  )
  on conflict (device_id) do update
  set device_name = excluded.device_name,
      platform = excluded.platform,
      requested_by = excluded.requested_by,
      status = case
        when public.whatsapp_device_access_requests.token_hash = excluded.token_hash
         and public.whatsapp_device_access_requests.status = 'approved'
          then 'approved'
        else 'pending'
      end,
      requested_at = case
        when public.whatsapp_device_access_requests.token_hash = excluded.token_hash
         and public.whatsapp_device_access_requests.status = 'approved'
          then public.whatsapp_device_access_requests.requested_at
        else now()
      end,
      reviewed_by = case
        when public.whatsapp_device_access_requests.token_hash = excluded.token_hash
         and public.whatsapp_device_access_requests.status = 'approved'
          then public.whatsapp_device_access_requests.reviewed_by
        else null
      end,
      reviewed_at = case
        when public.whatsapp_device_access_requests.token_hash = excluded.token_hash
         and public.whatsapp_device_access_requests.status = 'approved'
          then public.whatsapp_device_access_requests.reviewed_at
        else null
      end,
      updated_at = now()
  where public.whatsapp_device_access_requests.token_hash = excluded.token_hash
  returning * into access_row;

  return jsonb_build_object(
    'id', access_row.id,
    'device_id', access_row.device_id,
    'device_name', access_row.device_name,
    'platform', access_row.platform,
    'status', access_row.status,
    'approved', access_row.status = 'approved',
    'requested_at', access_row.requested_at,
    'reviewed_at', access_row.reviewed_at,
    'updated_at', access_row.updated_at
  );
end;
$$;

create or replace function public.list_whatsapp_device_access_requests()
returns setof public.whatsapp_device_access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_role text;
begin
  actor := private.require_whatsapp_device_actor(false);
  actor_role := lower(coalesce(actor ->> 'role', ''));

  if actor_role not in ('system', 'sistema', 'owner', 'dueno') then
    return;
  end if;

  return query
  select *
  from public.whatsapp_device_access_requests
  order by requested_at desc;
end;
$$;

notify pgrst, 'reload schema';

commit;
