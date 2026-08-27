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
