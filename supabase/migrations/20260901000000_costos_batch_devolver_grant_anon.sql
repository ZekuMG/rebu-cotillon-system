-- Devuelve a `anon` el permiso de ejecutar apply_supplier_product_updates_batch.
--
-- CAUSA RAIZ. La migracion 20260828200000_firma_del_cliente_en_conflicto.sql
-- rehizo la funcion y cerro el bloque de permisos con:
--     revoke all ... from public, anon, authenticated;
--     grant execute ... to authenticated;      <-- se perdio `anon`
-- La migracion anterior (20260828163500) otorgaba `to anon, authenticated`.
--
-- Desde 20260826230000 / 20260827000000 la app trabaja SIEMPRE como `anon`
-- (VITE_REBU_WHATSAPP_AUTH_SESSION=0: el login ya no abre sesion de Supabase
-- Auth), asi que cada guardado del control de costos del editor masivo choca
-- contra `42501 permission denied for function`. App.jsx:14194 mapea 42501 a
-- "Tu sesion de usuario expiro o no esta autenticada", que es lo que ve el
-- usuario: el cartel habla de sesion, pero el problema es el GRANT.
--
-- Medido en prod el 1-sep-2026, con `set local role anon` dentro de una
-- transaccion que se deshizo:
--   42501 | permission denied for function apply_supplier_product_updates_batch
-- Las otras 7 RPC transaccionales SI conservan el grant a `anon`; esta es la
-- unica que quedo afuera.
--
-- Esto NO abre nada nuevo: repone exactamente el permiso que la funcion tuvo
-- entre el 27 y el 28-ago. La validacion de permisos sigue igual
-- (private.require_rebu_permission), y sin sesion la autoridad es la seccion
-- de permisos de la app, que es la postura ya elegida en 20260827000000.

begin;

grant execute on function public.apply_supplier_product_updates_batch(text, jsonb) to anon;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- begin;
--   revoke execute on function public.apply_supplier_product_updates_batch(text, jsonb) from anon;
--   notify pgrst, 'reload schema';
-- commit;
