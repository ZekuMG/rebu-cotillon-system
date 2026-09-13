-- ESTADO AL 13-sep-2026: esta migracion NUNCA se aplico (no figura en
-- supabase_migrations.schema_migrations), pero su efecto ya esta casi todo puesto
-- por otro lado. Comprobado contra la base:
--   * revocar las cuatro *_unchecked_20260710 de anon .... HECHO (lo hizo
--     20260912210000_cerrar_anon_usuarios_y_funciones_viejas.sql)
--   * grant de las cuatro RPC buenas a los tres roles ..... HECHO (ya estaba)
--   * cerrar los permisos por defecto de funciones ........ PENDIENTE, va en
--     20260913040000_cerrar_anon_sobre_las_tablas_de_la_caja.sql
-- No aplicarla suelta: revisar antes que no pise nada de lo que ya esta.

-- Cierre de la version 1.2.32 en modo temporal sin JWT.
--
-- La app conserva acceso anon a las RPC publicas que usa para ventas, stock,
-- pedidos, usuarios y WhatsApp. Las implementaciones *_unchecked_* son una
-- capa interna: solo deben ser invocadas por sus wrappers SECURITY DEFINER.
-- Exponerlas permitiria saltear validaciones, actor e idempotencia.

begin;

revoke execute on function public.register_sale_transaction_unchecked_20260710(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.edit_sale_transaction_unchecked_20260710(text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.void_sale_transaction_unchecked_20260710(text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.apply_product_stock_delta_unchecked_20260710(text, numeric)
  from public, anon, authenticated, service_role;

-- Las funciones nuevas no deben quedar abiertas automaticamente. Cada RPC
-- publica futura tendra que recibir un GRANT explicito en su migracion.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon;

-- Garantias de compatibilidad de la caja 1.2.32 sin sesion Auth.
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb, text)
  to anon, authenticated, service_role;
grant execute on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.apply_product_stock_delta(text, numeric)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
