begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.whatsapp_device_access_requests (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  device_name text not null check (char_length(device_name) between 1 and 120),
  platform text not null default '' check (char_length(platform) <= 160),
  requested_by uuid not null references public.app_users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid null references public.app_users (id) on delete set null,
  reviewed_at timestamptz null,
  last_authorized_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_device_access_status_requested_idx
  on public.whatsapp_device_access_requests (status, requested_at desc);

alter table public.whatsapp_device_access_requests enable row level security;
revoke all on table public.whatsapp_device_access_requests from public, anon, authenticated;
grant all on table public.whatsapp_device_access_requests to service_role;

create or replace function private.require_whatsapp_device_actor(p_system_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_role text;
begin
  actor := private.current_rebu_transaction_actor();
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
  if p_device_id is null or safe_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Identidad de dispositivo inválida' using errcode = '22023';
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

  if p_device_id is null or safe_hash !~ '^[a-f0-9]{64}$' or safe_name = '' then
    raise exception 'Identidad de dispositivo inválida' using errcode = '22023';
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

  if not found then
    raise exception 'La identidad local no coincide con el dispositivo registrado'
      using errcode = '42501';
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

create or replace function public.list_whatsapp_device_access_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  result jsonb;
begin
  actor := private.require_whatsapp_device_actor(true);

  select coalesce(jsonb_agg(to_jsonb(request_row) order by
    case request_row.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    request_row.requested_at desc
  ), '[]'::jsonb)
  into result
  from (
    select
      request.id,
      request.device_id,
      request.device_name,
      request.platform,
      request.status,
      request.requested_at,
      request.reviewed_at,
      request.last_authorized_at,
      requester.display_name as requested_by_name,
      reviewer.display_name as reviewed_by_name
    from public.whatsapp_device_access_requests as request
    left join public.app_users as requester on requester.id = request.requested_by
    left join public.app_users as reviewer on reviewer.id = request.reviewed_by
    order by
      case request.status when 'pending' then 0 when 'approved' then 1 else 2 end,
      request.requested_at desc
    limit 100
  ) as request_row;

  return result;
end;
$$;

create or replace function public.review_whatsapp_device_access(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_id uuid;
  decision text := lower(trim(coalesce(p_decision, '')));
  access_row public.whatsapp_device_access_requests%rowtype;
begin
  actor := private.require_whatsapp_device_actor(true);
  actor_id := (actor ->> 'id')::uuid;
  if decision not in ('approved', 'rejected', 'revoked') then
    raise exception 'Decisión de acceso inválida' using errcode = '22023';
  end if;

  update public.whatsapp_device_access_requests
  set status = decision,
      reviewed_by = actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into access_row;

  if not found then
    raise exception 'Solicitud de dispositivo inexistente' using errcode = 'P0002';
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

create or replace function public.authorize_whatsapp_device_access(
  p_device_id uuid,
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  safe_token text := trim(coalesce(p_device_token, ''));
  safe_hash text;
  access_row public.whatsapp_device_access_requests%rowtype;
begin
  actor := private.require_whatsapp_device_actor(false);
  if p_device_id is null or char_length(safe_token) < 32 or char_length(safe_token) > 180 then
    return jsonb_build_object('allowed', false, 'status', 'not_requested');
  end if;
  safe_hash := encode(extensions.digest(convert_to(safe_token, 'UTF8'), 'sha256'), 'hex');

  select * into access_row
  from public.whatsapp_device_access_requests
  where device_id = p_device_id
    and token_hash = safe_hash;

  if not found then
    return jsonb_build_object('allowed', false, 'status', 'not_requested');
  end if;

  if access_row.status = 'approved' then
    update public.whatsapp_device_access_requests
    set last_authorized_at = now()
    where id = access_row.id
      and (last_authorized_at is null or last_authorized_at < now() - interval '5 minutes');
  end if;

  return jsonb_build_object(
    'allowed', access_row.status = 'approved',
    'status', access_row.status,
    'device_id', access_row.device_id,
    'device_name', access_row.device_name
  );
end;
$$;

revoke all on function public.get_my_whatsapp_device_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.request_whatsapp_device_access(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.list_whatsapp_device_access_requests()
  from public, anon, authenticated;
revoke all on function public.review_whatsapp_device_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.authorize_whatsapp_device_access(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_my_whatsapp_device_access(uuid, text) to authenticated;
grant execute on function public.request_whatsapp_device_access(uuid, text, text, text) to authenticated;
grant execute on function public.list_whatsapp_device_access_requests() to authenticated;
grant execute on function public.review_whatsapp_device_access(uuid, text) to authenticated;
grant execute on function public.authorize_whatsapp_device_access(uuid, text) to authenticated;

revoke all on function private.require_whatsapp_device_actor(boolean)
  from public, anon, authenticated;

-- Make the new RPCs available to PostgREST immediately after this transaction commits.
notify pgrst, 'reload schema';

commit;
