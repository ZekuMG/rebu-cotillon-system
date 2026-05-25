-- Safer direct grants for the custom Rebu app users model.
-- Keeps login user list readable but prevents direct table/view writes.
-- Safe to run more than once.

revoke all on table public.app_users from public;
revoke all on table public.app_users from anon;
revoke all on table public.app_users from authenticated;

revoke all on table public.app_users_public from public;
revoke all on table public.app_users_public from anon;
revoke all on table public.app_users_public from authenticated;

grant select on table public.app_users_public to anon, authenticated;

notify pgrst, 'reload schema';
