-- Una PC cuyo token rotó no podía volver a registrarse NUNCA.
--
-- `request_whatsapp_device_access` cerraba el upsert con
--   on conflict (device_id) do update ... where token_hash = excluded.token_hash
-- es decir: sólo actualizaba la fila si el hash guardado YA era igual al nuevo,
-- que es justamente el caso que nunca se da cuando el token se renovó del lado
-- de la PC. El update no tocaba nada, `not found` quedaba en true y la función
-- terminaba lanzando 42501 "La identidad local no coincide con el dispositivo
-- registrado". Resultado: el dispositivo no podía ni siquiera dejar anotado su
-- pedido, y quedaba trabado para siempre detrás del cartel "No estás habilitado
-- para usar WhatsApp en este dispositivo".
--
-- Ese `where` no aportaba seguridad: el propio `case` de adentro ya baja el
-- estado a 'pending' cuando el hash cambia, así que un token nuevo vuelve a
-- necesitar aprobación de Sistema igual. Lo único que hacía era bloquear.
--
-- Cambio: se saca el `where`. Un token nuevo re-registra el pedido como
-- 'pending' en vez de explotar. El resto de la función queda idéntico.
-- Respaldo de la definición previa en
-- supabase/backups/request_whatsapp_device_access-antes-18ago.sql

begin;

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
  set token_hash = excluded.token_hash,
      device_name = excluded.device_name,
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
  returning * into access_row;

  if not found then
    raise exception 'No se pudo registrar el dispositivo' using errcode = '42501';
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

revoke all on function public.request_whatsapp_device_access(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_whatsapp_device_access(uuid, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
