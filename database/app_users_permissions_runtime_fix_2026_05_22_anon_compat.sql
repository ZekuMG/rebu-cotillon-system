-- Optional compatibility patch for the current custom login model.
-- Use only if user creation/profile/password/permissions actions fail with 42501/PGRST permission errors.
-- This widens the anon surface for app_users RPCs; each function must validate p_actor_id internally.

do $$
begin
  grant execute on function public.create_app_user(uuid, text, text, text, text, text, text, text) to anon;
exception when undefined_function then
  grant execute on function public.create_app_user(uuid, text, text, text, text, text, text) to anon;
end;
$$;

do $$
begin
  grant execute on function public.update_app_user_profile(uuid, uuid, text, text, text, text, text, text) to anon;
exception when undefined_function then
  grant execute on function public.update_app_user_profile(uuid, uuid, text, text, text, text, text) to anon;
end;
$$;

grant execute on function public.update_app_user_password(uuid, uuid, text) to anon;
grant execute on function public.set_app_user_active(uuid, uuid, boolean) to anon;
grant execute on function public.update_app_user_permissions(uuid, uuid, jsonb, boolean) to anon;

notify pgrst, 'reload schema';
