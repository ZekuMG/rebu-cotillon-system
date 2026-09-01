-- 1-sep-2026 — "Error al subir: No se pudo subir la imagen."
--
-- Causa raiz: 20260822110000_product_images_authenticated_storage.sql borro las
-- politicas de escritura de `anon` sobre el bucket product-images y las rehizo
-- solo para `authenticated`, porque en ese momento la app abria sesion de
-- Supabase Auth. El 26-ago la app dejo de abrir sesion
-- (VITE_REBU_WHATSAPP_AUTH_SESSION=0) y 20260827020000_anon_sin_limitantes.sql
-- solo abrio el esquema `public`: el esquema `storage` quedo afuera.
-- Resultado: toda subida de foto desde la app falla con
-- 42501 "new row violates row-level security policy for table objects".
--
-- Arreglo: devolverle a `anon` insert/update/delete sobre ese bucket, acotado a
-- las carpetas que usa la app (products/, avatars/). Las politicas de
-- `authenticated` quedan intactas por si la sesion vuelve a habilitarse.

begin;

drop policy if exists rebu_product_images_anon_insert on storage.objects;
create policy rebu_product_images_anon_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
);

drop policy if exists rebu_product_images_anon_update on storage.objects;
create policy rebu_product_images_anon_update
on storage.objects
for update
to anon
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
);

drop policy if exists rebu_product_images_anon_delete on storage.objects;
create policy rebu_product_images_anon_delete
on storage.objects
for delete
to anon
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = any (array['products', 'avatars'])
);

commit;
