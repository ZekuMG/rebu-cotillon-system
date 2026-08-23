begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_active_rebu_storage_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.app_users as app_user
      where app_user.auth_user_id = (select auth.uid())
        and app_user.is_active = true
    );
$$;

revoke all on function private.is_active_rebu_storage_user() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_rebu_storage_user() to authenticated;

-- The desktop app now opens a real Supabase Auth session. The old policies only
-- targeted anon, so authenticated Rebu users were rejected by Storage RLS.
drop policy if exists "Allow uploads 16wiy3a_0" on storage.objects;
drop policy if exists "Allow delete 16wiy3a_0" on storage.objects;
drop policy if exists "Allow delete 16wiy3a_1" on storage.objects;

drop policy if exists rebu_product_images_authenticated_select on storage.objects;
create policy rebu_product_images_authenticated_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_active_rebu_storage_user())
);

drop policy if exists rebu_product_images_authenticated_insert on storage.objects;
create policy rebu_product_images_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
  and (select private.is_active_rebu_storage_user())
);

drop policy if exists rebu_product_images_authenticated_update on storage.objects;
create policy rebu_product_images_authenticated_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_active_rebu_storage_user())
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
  and (select private.is_active_rebu_storage_user())
);

drop policy if exists rebu_product_images_authenticated_delete on storage.objects;
create policy rebu_product_images_authenticated_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_active_rebu_storage_user())
);

commit;
