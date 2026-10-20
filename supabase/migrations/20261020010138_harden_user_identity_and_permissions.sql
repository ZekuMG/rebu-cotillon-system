-- La identidad del actor la decide el JWT, nunca p_actor_id del cliente.
-- Esta migracion se puede aplicar antes del corte general de anon: no cambia
-- las tablas de caja ni las RPC de ventas usadas por versiones anteriores.
begin;

create or replace function private.assert_rebu_actor(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or (select auth.uid()) is null or not exists (
    select 1 from public.app_users u
    where u.id = p_actor_id
      and u.auth_user_id = (select auth.uid())
      and u.is_active is true
  ) then
    raise exception 'La sesion no corresponde al usuario de Rebu.'
      using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_rebu_actor(uuid) from public, anon, authenticated;

-- Las cuatro funciones restantes conservan su logica comercial actual. Se
-- inserta la comprobacion al principio del cuerpo y se falla si cambia alguna
-- firma: no se debe crear una migracion que deje una funcion sin proteger.
do $$
declare
  f record;
  original_definition text;
  secured_definition text;
  secured_count integer := 0;
begin
  for f in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'list_app_users_private', 'set_app_user_active',
        'update_app_user_permissions', 'update_app_user_profile'
      ])
      and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) like 'p_actor_id uuid%'
  loop
    original_definition := pg_get_functiondef(f.oid);
    secured_definition := regexp_replace(
      original_definition,
      '\mbegin\M',
      E'begin\n  perform private.assert_rebu_actor(p_actor_id);',
      'i'
    );
    if secured_definition = original_definition then
      raise exception 'No se pudo proteger la funcion %', f.signature;
    end if;
    execute secured_definition;
    execute format('revoke all on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated', f.signature);
    secured_count := secured_count + 1;
  end loop;
  if secured_count <> 4 then
    raise exception 'Se esperaban cuatro funciones administrativas y se encontraron %', secured_count;
  end if;
end;
$$;

-- El alta crea el perfil y la identidad Auth en una sola transaccion. Es la
-- misma estructura de Auth usada por la migracion historica de vinculacion.
create or replace function public.create_app_user(
  p_actor_id uuid, p_display_name text, p_role text, p_password text,
  p_avatar text default '', p_name_color text default '#0f172a',
  p_theme text default 'light', p_metrics_view_mode text default 'modern'
)
returns table (
  id uuid, display_name text, role text, avatar text, name_color text,
  theme text, metrics_view_mode text, is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user public.app_users;
  created_user_id uuid;
  new_auth_id uuid := gen_random_uuid();
  new_email text;
  new_hash text;
begin
  perform private.assert_rebu_actor(p_actor_id);
  select * into actor_user from public.app_users u where u.id = p_actor_id;
  if actor_user.role <> 'system' then
    raise exception 'Solo Sistema puede crear usuarios' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'seller') then
    raise exception 'Rol invalido' using errcode = '22023';
  end if;
  if nullif(trim(p_display_name), '') is null or length(coalesce(p_password, '')) < 4 then
    raise exception 'Nombre y clave de al menos cuatro caracteres requeridos'
      using errcode = '22023';
  end if;

  new_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  insert into public.app_users (
    display_name, role, avatar, name_color, theme, metrics_view_mode,
    password_hash, created_by
  ) values (
    trim(p_display_name), p_role,
    coalesce(nullif(trim(p_avatar), ''), upper(left(trim(p_display_name), 2))),
    coalesce(nullif(trim(p_name_color), ''), '#0f172a'),
    coalesce(nullif(trim(p_theme), ''), 'light'),
    case when p_metrics_view_mode = 'legacy' then 'legacy' else 'modern' end,
    new_hash, actor_user.id
  ) returning app_users.id into created_user_id;

  new_email := 'rebu-' || created_user_id::text || '@rebu.app';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    new_auth_id, 'authenticated', 'authenticated', new_email, new_hash,
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', trim(p_display_name), 'email_verified', true),
    false, false, now(), now()
  );
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_auth_id::text, new_auth_id,
    jsonb_build_object('sub', new_auth_id::text, 'email', new_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  update public.app_users u
  set auth_user_id = new_auth_id, auth_email = new_email
  where u.id = created_user_id;

  return query select u.id, u.display_name::text, u.role, u.avatar,
    u.name_color, u.theme, u.metrics_view_mode, u.is_active
  from public.app_users_public u where u.id = created_user_id;
end;
$$;
revoke all on function public.create_app_user(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_app_user(uuid, text, text, text, text, text, text, text)
  to authenticated;

-- La clave de Rebu y la de Auth se modifican atomicamente. Si falta el
-- vinculo, la operacion se revierte en vez de dejar dos claves distintas.
create or replace function public.update_app_user_password(
  p_actor_id uuid, p_target_id uuid, p_password text
)
returns table (
  id uuid, display_name text, role text, avatar text, name_color text,
  theme text, metrics_view_mode text, is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
  new_hash text;
begin
  perform private.assert_rebu_actor(p_actor_id);
  select * into actor_user from public.app_users u where u.id = p_actor_id;
  select * into target_user from public.app_users u where u.id = p_target_id for update;
  if target_user.id is null then
    raise exception 'Usuario no encontrado' using errcode = '22023';
  end if;
  if actor_user.id <> target_user.id and actor_user.role <> 'system' then
    raise exception 'No autorizado para cambiar esta clave' using errcode = '42501';
  end if;
  if target_user.auth_user_id is null or length(coalesce(p_password, '')) < 4 then
    raise exception 'Vinculo Auth y clave de al menos cuatro caracteres requeridos'
      using errcode = '22023';
  end if;

  new_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  update auth.users au
  set encrypted_password = new_hash, updated_at = now()
  where au.id = target_user.auth_user_id;
  if not found then
    raise exception 'Cuenta Auth no encontrada; clave sin modificar'
      using errcode = '23503';
  end if;
  update public.app_users u set password_hash = new_hash where u.id = target_user.id;

  return query select u.id, u.display_name::text, u.role, u.avatar,
    u.name_color, u.theme, u.metrics_view_mode, u.is_active
  from public.app_users_public u where u.id = target_user.id;
end;
$$;
revoke all on function public.update_app_user_password(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_app_user_password(uuid, uuid, text)
  to authenticated;

-- Una instalacion no debe poder resembrar usuarios ni usar validadores viejos.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'bootstrap_app_users', 'verify_app_user_login',
      'verify_app_user_login_private'
    ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
