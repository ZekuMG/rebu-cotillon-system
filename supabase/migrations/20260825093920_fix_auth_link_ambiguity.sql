begin;

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
set search_path = ''
as $$
declare
  current_auth_user_id uuid := auth.uid();
  current_auth_email text := nullif(auth.jwt() ->> 'email', '');
  matched_user public.app_users%rowtype;
begin
  if current_auth_user_id is null then
    raise exception 'Sesion de Supabase Auth requerida.';
  end if;

  select target_user.*
  into matched_user
  from public.app_users as target_user
  where target_user.id = p_app_user_id
    and target_user.is_active = true
  limit 1;

  if matched_user.id is null then
    raise exception 'Usuario Rebu invalido o inactivo.';
  end if;

  if matched_user.password_hash
    <> extensions.crypt(coalesce(p_password, ''), matched_user.password_hash) then
    raise exception 'Contrasena Rebu incorrecta.';
  end if;

  if matched_user.auth_user_id is not null
    and matched_user.auth_user_id <> current_auth_user_id then
    raise exception 'Este usuario Rebu ya esta vinculado a otra cuenta Auth.';
  end if;

  update public.app_users as target_user
  set auth_user_id = current_auth_user_id,
      auth_email = coalesce(current_auth_email, target_user.auth_email::text),
      updated_at = now()
  where target_user.id = p_app_user_id;

  return query
  select target_user.id, target_user.auth_user_id, target_user.auth_email::text
  from public.app_users as target_user
  where target_user.id = p_app_user_id;
end;
$$;

revoke all on function public.link_current_auth_user_to_app_user(uuid, text)
from public, anon, authenticated;
grant execute on function public.link_current_auth_user_to_app_user(uuid, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
