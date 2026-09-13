-- Primer corte de los permisos de anon: la tabla de usuarios del sistema y las
-- cuatro funciones viejas sin validacion.
--
-- Por que estas y no otras: son las unicas que se pueden cerrar HOY sin tocar
-- ninguna PC del local. Todo lo demas que anon escribe (caja, ventas, socios,
-- productos, bitacora) lo usa el POS de verdad, y cerrarlo antes de que el POS
-- trabaje con sesion deja al negocio sin poder cobrar.
--
-- Que queda cerrado:
--   * public.app_users: hoy cualquiera con la anon key —que viaja dentro del
--     instalador publicado— puede leer los password_hash de los 5 usuarios, sus
--     permissions_override y su auth_email, y ademas modificarlos.
--   * public.whatsapp_device_access_requests: el bot lo tiene apagado
--     (BOT_DEVICE_ACCESS_ENFORCED=false).
--   * Las cuatro funciones *_unchecked_20260710: son las versiones SIN validacion
--     de registrar, editar y anular una venta y de mover stock. Ningun programa
--     las llama; las buenas quedan intactas.
--
-- Que NO se rompe, comprobado como rol anon dentro de una transaccion revertida:
--   * El login del POS y el del panel /admin de la web siguen andando: leen la
--     VISTA public.app_users_public, que corre con los permisos de su dueño y
--     solo expone id, nombre, rol, avatar, color, tema, vista de metricas y si
--     esta activo. Ninguna contraseña.
--   * Siguen respondiendo el catalogo, la vidriera, el estado de caja, las
--     ventas, los socios y la bitacora.
--
-- Efecto conocido y aceptado: app_users esta publicada en realtime y el POS se
-- suscribe. Al perder la lectura, esa suscripcion deja de entregar cambios: si
-- alguien edita un usuario desde otra PC, las demas no se enteran hasta recargar.
--
-- Para volver atras: 20260912210000_cerrar_anon_usuarios_y_funciones_viejas_REVERTIR.sql

begin;

-- 1. La tabla de usuarios del sistema.
-- La politica rebu_anon_sin_limitantes es PERMISSIVE con USING true, y en Postgres
-- las permisivas se combinan con OR: mientras exista, anula el bloqueo que ya
-- estaba escrito al lado (app_users_no_direct_anon_access, USING false).
drop policy if exists rebu_anon_sin_limitantes on public.app_users;
revoke all on table public.app_users from anon;

-- 2. Los pedidos de acceso de dispositivos de WhatsApp.
drop policy if exists rebu_anon_sin_limitantes on public.whatsapp_device_access_requests;
revoke all on table public.whatsapp_device_access_requests from anon;

-- 3. Las cuatro funciones sin validacion. Se recorren por catalogo en vez de
-- escribir la firma a mano: si una firma cambio, un revoke escrito a mano fallaria
-- en silencio por no encontrar la funcion.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like '%\_unchecked\_20260710'
  loop
    execute format('revoke all on function %s from anon, authenticated, public', f.firma);
    n := n + 1;
  end loop;
  if n <> 4 then
    raise exception 'Se esperaban 4 funciones *_unchecked_20260710 y se encontraron %', n;
  end if;
end
$$;

commit;
