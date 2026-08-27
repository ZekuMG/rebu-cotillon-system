-- =====================================================================
-- ¿La sección de permisos de usuario sigue mandando?
--
-- Comprueba que private.rebu_actor_can (la función que decide TODOS los
-- permisos del programa) siga respetando el rol y los permisos por usuario.
--
-- Es de SOLO LECTURA: no escribe nada, no hace falta transacción.
--
-- Cómo correrlo:
--   cd /c/Users/mikke/.claude/tools/pgcli
--   node q.mjs "H:/PERSONAL/Programación/Ramiro Proyecto/Punto de Venta Rebu - Release/supabase/diagnostics/verificar_permisos_por_usuario.sql"
--
-- Si alguna fila dice FALLA, el sistema de permisos se rompió.
-- Nota: cuando `puede` da false, private.require_rebu_permission corta la
-- operación con el error 42501 "No tenés permiso para esta operación".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Escenarios fijos
-- ---------------------------------------------------------------------
select
  escenario,
  puede,
  esperado,
  case when puede = esperado then 'OK' else '*** FALLA ***' end as estado
from (
  values
    ('seller crea pedidos (le corresponde)',
      private.rebu_actor_can('{"role":"seller"}'::jsonb, 'orders.createOrder'), true),

    ('seller elimina productos (NO le corresponde)',
      private.rebu_actor_can('{"role":"seller"}'::jsonb, 'inventory.delete'), false),

    ('owner elimina productos',
      private.rebu_actor_can('{"role":"owner"}'::jsonb, 'inventory.delete'), true),

    ('permiso por usuario HABILITA a un seller',
      private.rebu_actor_can('{"role":"seller","permissions_override":{"inventory.delete":true}}'::jsonb, 'inventory.delete'), true),

    ('permiso por usuario PROHIBE a un owner',
      private.rebu_actor_can('{"role":"owner","permissions_override":{"inventory.delete":false}}'::jsonb, 'inventory.delete'), false),

    ('rol inventado no habilita nada',
      private.rebu_actor_can('{"role":"jefe_supremo"}'::jsonb, 'inventory.delete'), false),

    ('actor vacio no habilita nada',
      private.rebu_actor_can('{}'::jsonb, 'inventory.delete'), false),

    ('sin sesion (actor nulo): la app decide, la base no prohibe',
      private.rebu_actor_can(null, 'inventory.delete'), false)
) as t(escenario, puede, esperado);

-- ---------------------------------------------------------------------
-- 2) Los usuarios REALES de Rebu, con sus permisos efectivos
-- ---------------------------------------------------------------------
select
  u.display_name as usuario,
  u.role as rol,
  u.is_active as activo,
  private.rebu_actor_can(
    jsonb_build_object('role', u.role, 'permissions_override', coalesce(u.permissions_override, '{}'::jsonb)),
    'orders.createOrder') as crear_pedidos,
  private.rebu_actor_can(
    jsonb_build_object('role', u.role, 'permissions_override', coalesce(u.permissions_override, '{}'::jsonb)),
    'clients.edit') as editar_socios,
  private.rebu_actor_can(
    jsonb_build_object('role', u.role, 'permissions_override', coalesce(u.permissions_override, '{}'::jsonb)),
    'inventory.delete') as puede_eliminar_productos,
  case
    when coalesce(u.permissions_override, '{}'::jsonb) ->> 'inventory.delete' = 'false'
      then 'PROHIBIDO a proposito'
    when coalesce(u.permissions_override, '{}'::jsonb) ->> 'inventory.delete' = 'true'
      then 'HABILITADO a mano'
    else 'sin configurar: decide el rol'
  end as por_que_eliminar_productos,
  (select count(*) from jsonb_each(coalesce(u.permissions_override, '{}'::jsonb))) as permisos_a_medida
from public.app_users as u
order by u.is_active desc, u.display_name;
