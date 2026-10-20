# Corte de permisos de Rebu

## Estado al 20 de octubre de 2026

- `20261020010138_harden_user_identity_and_permissions.sql` está aplicada en producción. La prueba de alta/cambio de clave se ejecutó en una transacción revertida; luego se verificaron los privilegios reales.
- `20261020020000_cerrar_anon_sobre_las_tablas_de_la_caja.sql` está preparada y **no está aplicada**. Su verificador la ejecutó en la base real con `ROLLBACK` y comprobó RLS, permisos de vendedor, escritura de logs, bloqueo de puntos directos y ajuste autorizado por RPC.
- Los instaladores 1.2.53 y anteriores todavía usan escrituras directas en la caja. La 1.2.54 exige Auth, pero puede cerrar sesión ante un error transitorio al renovarla. Distribuir 1.2.55 antes del corte RLS.

## Secuencia de despliegue

1. Publicar la versión 1.2.55 de la app. No reutilizar 1.2.53 ni instalar 1.2.54.
2. Instalarla en **todas** las cajas y comprobar ingreso de cada operador, venta de prueba controlada, apertura/cierre manual y cierre automático cuando corresponda.
3. Ejecutar `npm run audit:pcs -- 30` desde el proyecto con acceso a la base. El script confirma que las PCs vistas abrieron sesión Auth; contrastar con el inventario real de equipos, ya que una PC sin actividad no aparece en el registro.
4. Volver a ejecutar `scripts/verify-security-migration.mjs` con el SQL y su contingencia. El verificador revierte todo.
5. Aplicar `20261020020000_cerrar_anon_sobre_las_tablas_de_la_caja.sql`, registrar esa versión en `supabase_migrations.schema_migrations` si se usa SQL Editor, y comprobar las operaciones reales de una caja.
6. Si una política bloquea una operación legítima, corregir esa política concreta. La contingencia en `supabase/rollbacks/20261020020000_cerrar_anon_sobre_las_tablas_de_la_caja_REVERTIR.sql` da acceso amplio **solo a usuarios autenticados**; no vuelve a abrir `anon`.

## Límites conocidos

- El alta y cambio de clave actualizan `auth.users` dentro de la misma transacción que `app_users`, siguiendo la migración histórica de vinculación. Esto evita claves divergentes hoy. A futuro conviene migrar la provisión a la Auth Admin API y retirar el hash duplicado de `app_users`.
- El puente `verify_app_user_login_auth_bridge` sigue accesible a `anon` para comprobar la contraseña antes de abrir Auth. Los datos privados solo se devuelven si la contraseña coincide.
- Las políticas usan `active_permissions_override`. Los cambios pendientes quedan en `permissions_override` y se activan después de comprobar la clave y abrir la sesión Auth en el próximo ingreso. La opción «aplicar ahora» actualiza ambos valores y fuerza el reingreso desde la app.
- El informe de cierre todavía recibe cifras agregadas calculadas en la app. El cierre es atómico, pero para que el informe sea una fuente contable autoritativa esas cifras deberán calcularse o verificarse también en la base.
