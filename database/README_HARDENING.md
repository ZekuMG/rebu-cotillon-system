# Rebu Cotillon database hardening

Este directorio contiene scripts de seguridad e integridad para Supabase. Ejecutalos con una cuenta administradora y siempre despues de hacer backup.

## Orden sugerido

1. Hacer backup de la base o snapshot del proyecto Supabase.
2. Ejecutar `app_users_safe_upgrade_2026_05_22.sql` para instalar o actualizar usuarios internos de forma segura.
3. Ejecutar `app_users_permissions_runtime_fix_2026_05_22.sql` para que login/listado privado devuelvan permisos reales sin exponerlos en `app_users_public`.
4. Ejecutar `harden_app_users_direct_grants_2026_05_22.sql` para cerrar acceso directo a `app_users` y dejar `app_users_public` solo lectura.
5. Ejecutar `harden_transaction_rpc_grants_2026_05_25.sql` para cerrar acceso anon a RPCs transaccionales `SECURITY DEFINER`.
   - Si usas `supabase db query`, ejecutar la variante `harden_transaction_rpc_grants_single_statement_2026_05_25.sql`.
6. Ejecutar `sale_items_custom_cost_safe_patch_2026_05_22.sql` para asegurar metadata historica de items.
7. Ejecutar `security_integrity_hardening_2026_05_20.sql`.
8. Verificar grants, funciones, columnas e indices.
9. Probar login, venta, edicion de venta, anulacion, restauracion, stock y logs en un entorno de prueba.

## Activacion final de cobros transaccionales

Despues de aplicar `app_users_auth_bridge_2026_05_25.sql`, vincular cada usuario operativo con
`app_users.auth_user_id` y `app_users.auth_email`. Luego aplicar la migracion de Supabase:

`supabase/migrations/20260710192217_harden_transaction_rpc_auth_and_points.sql`

La migracion conserva las implementaciones atomicas existentes detras de wrappers protegidos,
rechaza sesiones que no pertenezcan a un usuario activo de Rebu y detecta cambios concurrentes
en puntos. Una vez verificada, compilar la aplicacion con `VITE_REBU_ENABLE_AUTH_RPC=1`.

No activar la bandera antes de vincular los usuarios: el login se bloqueara deliberadamente para
evitar que un cobro vuelva al guardado heredado no atomico.

## Archivos legacy o de referencia

- `app_users_schema.sql`: baseline historico. No usar como script principal en produccion; puede fallar si ya existen RPCs dependientes de `app_users_public`. Usar `app_users_safe_upgrade_2026_05_22.sql`.
- `sale_items_custom_cost_schema.sql`: baseline historico. Usar `sale_items_custom_cost_safe_patch_2026_05_22.sql`.
- `schema_hotfix_2026_04_16.sql`: hotfix anterior. Revisar antes de reejecutar porque parte de su contenido ya esta cubierto por scripts mas nuevos.
- `rls_next_stage_not_autorun_2026_05_25.sql`: guia comentada para la proxima etapa de RLS. No ejecutar como migracion.
- `app_users_admin_rpc_future_hardening_not_autorun_2026_05_25.sql`: guia comentada para cerrar RPCs administrativas cuando exista Supabase Auth o backend confiable. No ejecutar ahora.

## Verificaciones minimas

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'apply_product_stock_delta',
    'register_sale_transaction',
    'edit_sale_transaction',
    'void_sale_transaction',
    'search_logs'
  );
```

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'apply_product_stock_delta',
    'register_sale_transaction',
    'edit_sale_transaction',
    'void_sale_transaction'
  )
order by routine_name, grantee;
```

Las RPCs transaccionales deben quedar disponibles para `authenticated`, no para `anon`. Si la app sigue usando usuarios internos propios con la anon key de Supabase, el frontend va a usar el fallback heredado hasta incorporar Supabase Auth o un backend de confianza.

`app_users_permissions_runtime_fix_2026_05_22.sql` no reabre las RPCs administrativas de usuarios a `anon`; solo permite el login privado y el listado privado de usuarios. Si el modelo actual de login interno necesita compatibilidad para crear/editar usuarios desde la anon key, revisar y ejecutar por separado `app_users_permissions_runtime_fix_2026_05_22_anon_compat.sql`, asumiendo el riesgo adicional.

Para funciones `SECURITY DEFINER`, verificar que no haya permisos heredados por `PUBLIC`:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'bootstrap_app_users',
    'create_app_user',
    'update_app_user_profile',
    'update_app_user_password',
    'set_app_user_active',
    'update_app_user_permissions',
    'verify_app_user_login_private',
    'list_app_users_private',
    'apply_product_stock_delta',
    'register_sale_transaction',
    'edit_sale_transaction',
    'void_sale_transaction'
  )
order by routine_name, grantee;
```

## Precauciones

- No conceder `register_sale_transaction`, `edit_sale_transaction`, `void_sale_transaction` ni `apply_product_stock_delta` a `anon`.
- Crear indices grandes, en especial sobre `logs.details::text`, en una ventana de bajo uso.
- Revisar politicas RLS reales por tabla antes de publicar la anon key en una build de escritorio.
- Cambiar passwords semilla (`1234`, `4321`) en instalaciones existentes.
- Validar que `sales.status` y `sales.voided_at` existan antes de depender de anulaciones por soft-delete.
