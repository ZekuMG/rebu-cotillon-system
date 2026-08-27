-- =====================================================================
-- La caja deja de depender de la sesion de Supabase Auth para cobrar.
--
-- POR QUE: las cuatro funciones transaccionales NO usan auth.uid() ni exigen
-- sesion adentro (verificado con pg_get_functiondef contra produccion). Lo unico
-- que las bloqueaba era el GRANT. Por ese permiso la caja terminaba pidiendole
-- la clave al vendedor o, peor, quedando trabada a mitad de una venta.
--
-- ⚠️ ALCANCE RECORTADO A PROPOSITO. El diseno original tambien revocaba
-- insert/update/delete de `anon` sobre sales, sale_items y clients. NO se hace:
-- la app todavia escribe directo en esas tablas en caminos que se usan, y
-- revocarlos las romperia justo cuando corra sin sesion:
--   * src/App.jsx:15129-15131  deshacer una venta que fallo a mitad
--   * src/App.jsx:16036        editor de transacciones (borra y reinserta items)
--   * src/App.jsx:8695, 15056, 15094, 15452, 15701, 16052  puntos y redes del socio
-- Cerrar eso exige primero pasar esos caminos por RPC. Queda pendiente.
--
-- SI se revocan los privilegios que la app nunca usa y que son catastroficos:
-- TRUNCATE (hoy `anon` puede vaciar la tabla de ventas de un saque), REFERENCES,
-- TRIGGER y MAINTAIN. Medido el 26-ago-2026: `anon` tenia `arwdDxtm`, o sea TODO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Las funciones transaccionales quedan al alcance de la caja aunque no
--    haya sesion de Supabase Auth abierta. Siguen siendo atomicas: no hay
--    forma de dejar una venta a medio guardar.
-- ---------------------------------------------------------------------
grant execute on function public.register_sale_transaction(p_sale jsonb, p_items jsonb, p_stock_deltas jsonb, p_client_points jsonb) to anon;
grant execute on function public.edit_sale_transaction(p_sale_id text, p_sale_patch jsonb, p_items jsonb, p_stock_deltas jsonb, p_client_points jsonb) to anon;
grant execute on function public.void_sale_transaction(p_sale_id text, p_voided_at timestamptz, p_stock_deltas jsonb, p_client_points jsonb) to anon;
grant execute on function public.apply_product_stock_delta(p_product_id text, p_delta numeric) to anon;

-- ---------------------------------------------------------------------
-- 2) Se le sacan a `anon` los privilegios que la app nunca ejerce y que
--    permiten destruir datos de golpe. Lectura y escritura fila a fila
--    quedan intactas para no romper los caminos de arriba.
-- ---------------------------------------------------------------------
revoke truncate, references, trigger, maintain on table public.sales from anon;
revoke truncate, references, trigger, maintain on table public.sale_items from anon;
revoke truncate, references, trigger, maintain on table public.clients from anon;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ROLLBACK (ejecutar solo si algo sale mal)
-- =====================================================================
-- begin;
--   revoke execute on function public.register_sale_transaction(p_sale jsonb, p_items jsonb, p_stock_deltas jsonb, p_client_points jsonb) from anon;
--   revoke execute on function public.edit_sale_transaction(p_sale_id text, p_sale_patch jsonb, p_items jsonb, p_stock_deltas jsonb, p_client_points jsonb) from anon;
--   revoke execute on function public.void_sale_transaction(p_sale_id text, p_voided_at timestamptz, p_stock_deltas jsonb, p_client_points jsonb) from anon;
--   revoke execute on function public.apply_product_stock_delta(p_product_id text, p_delta numeric) from anon;
--   grant truncate, references, trigger, maintain on table public.sales to anon;
--   grant truncate, references, trigger, maintain on table public.sale_items to anon;
--   grant truncate, references, trigger, maintain on table public.clients to anon;
--   notify pgrst, 'reload schema';
-- commit;
