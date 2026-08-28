# Rebu 1.2.32

Este documento describe cada archivo incluido en el commit de cierre de la versión 1.2.32.

## Configuración, versión y escritorio

- `.agents/context/dashboard.md`: documenta que el Dashboard diario no debe hidratar el historial completo durante la carga progresiva.
- `.env.example`: separa la activación de RPC transaccionales de Supabase Auth y deja documentado el modo temporal sin JWT.
- `.gitignore`: excluye worktrees de hotfix, estado local de Supabase CLI y respaldos manuales de código.
- `docs/RELEASE_1.2.32.md`: conserva este inventario archivo por archivo de la versión.
- `electron-export-pdf.cjs`: genera presupuestos PDF en una ventana aislada para no depender del estado visual de la aplicación.
- `electron-main.cjs`: verifica la sesión real de Casa Alberto, protege sus credenciales con el cifrado del sistema operativo e inicia el acceso automáticamente.
- `eslint.config.js`: convierte referencias JSX no definidas en errores de lint.
- `package.json`: fija la versión 1.2.32, amplía las suites de regresión/smoke y declara `pg` para diagnósticos.
- `package-lock.json`: alinea la versión, la dependencia `pg` y las resoluciones instaladas.
- `preload.cjs`: publica al renderer la verificación aislada y el guardado seguro del acceso del proveedor.

## Scripts operativos y smoke tests

- `scripts/audit-supabase-query-latency.mjs`: mide lecturas incrementales de productos y la carga base de clientes.
- `scripts/cache-persistence.spec.cjs`: comprueba persistencia e invalidación segura del historial completo en IndexedDB.
- `scripts/budget-responsive.spec.cjs`: valida el constructor de presupuestos en escritorio, notebook y anchos compactos.
- `scripts/playtest-general.spec.cjs`: recorre en modo demo los módulos operativos sin permitir tráfico externo.
- `scripts/playtest-real.spec.cjs`: ofrece un recorrido acotado y de solo lectura contra datos reales para diagnóstico manual.
- `scripts/run-supabase-diagnostic.mjs`: ejecuta SQL controlado exclusivamente desde `supabase/diagnostics` usando credenciales locales.
- `scripts/startup-cache-gating.spec.cjs`: verifica que login y Dashboard diario no abran prematuramente el historial pesado.
- `scripts/supplier-price-report-ui.spec.cjs`: valida el flujo visual de Casa Alberto, aprobados e historial PDF.
- `scripts/supplier-link-suggestions-ui.spec.cjs`: comprueba la comparación y las acciones de enlaces sugeridos de Casa Alberto.
- `scripts/supplier-session-control.spec.cjs`: prueba verificación real, acceso manual, cierre y aislamiento de la sesión del proveedor.

## Aplicación y experiencia de usuario

- `src/App.jsx`: integra modo sin JWT, recuperación de sesión, errores detallados, ventas idempotentes, `points_spent`, sincronización incremental, Casa Alberto y Estudio IA.
- `src/components/BudgetBuilderModal.jsx`: adapta el constructor de presupuestos a resoluciones compactas y lo monta como diálogo accesible.
- `src/components/Sidebar.jsx`: agrega el acceso con permisos al Estudio de imágenes IA.
- `src/components/dashboard/ExpirationAlert.jsx`: muestra fechas de vencimiento respetando el día local.
- `src/components/dashboard/LowStockAlert.jsx`: corrige comparación y formato local de vencimientos.
- `src/components/modals/ProductModals.jsx`: normaliza el costo de compra al editar productos por unidad o peso.
- `src/hooks/useMetricsData.js`: centraliza la fecha/hora transaccional y vincula recomendaciones con su sección de análisis.
- `src/index.css`: incorpora el diseño operativo, compacto y adaptable de la nueva vista de Métricas.
- `src/services/aiImageStudio.js`: invoca la Edge Function de imágenes con sesión segura y traduce sus errores.
- `src/supabase/client.js`: desactiva renovación/persistencia JWT en contingencia y conecta la autorreparación de lecturas.
- `src/supabase/sessionSelfHeal.js`: descarta sesiones rechazadas, reintenta solo lecturas seguras y registra el diagnóstico del 401.
- `src/utils/aiImageStudio.js`: valida prompts, tamaños, referencias y preparación de imágenes del Estudio IA.
- `src/utils/appUserLoadControl.js`: evita habilitar usuarios legacy ante fallos transitorios y explica errores de carga del directorio.
- `src/utils/appUsers.js`: recupera el login de usuario frente a JWT persistidos inválidos.
- `src/utils/cloudLoadControl.js`: agrega alcance, corte, fusión y elegibilidad para sincronización incremental de productos.
- `src/utils/cloudSelects.js`: incluye `updated_at` en las lecturas necesarias para sincronización incremental.
- `src/utils/diagnosticsLog.js`: guarda localmente errores crudos y acotados para diagnóstico posterior.
- `src/utils/helpers.js`: interpreta y formatea fechas `YYYY-MM-DD` sin desplazamientos por UTC.
- `src/utils/productLifecycle.js`: normaliza costos de compra y redondea costos sugeridos según el tipo de producto.
- `src/utils/salesMetricsCore.js`: combina fecha y hora transaccional sin perder el horario original.
- `src/utils/supabaseAuthRecovery.js`: reconoce JWT inválidos y reintenta brevemente desfases de reloj entre servicios Supabase.
- `src/utils/supabaseErrorDiagnostics.js`: clasifica errores de Auth, permisos y esquema con códigos accionables.
- `src/utils/supplierPriceNumbers.js`: interpreta precios argentinos/internacionales y aplica redondeos consistentes.
- `src/utils/supplierPriceReview.js`: clasifica cambios de proveedor, aprobados, errores, avisos agrupados y descartes por usuario.
- `src/utils/transactionHistoryCache.js`: invalida snapshots IndexedDB con versión incompatible.
- `src/utils/transactionSync.js`: decide cuándo hidratar el historial completo y cuándo mantener la carga progresiva.
- `src/utils/userPermissions.js`: agrega permisos independientes para Estudio IA y Catálogo web.
- `src/utils/whatsappOperator.js`: evita reutilizar JWT crudos y limita Auth al modo seguro explícitamente habilitado.
- `src/views/AiImageStudioView.css`: define el espacio de trabajo adaptable para generar, editar y descargar imágenes.
- `src/views/AiImageStudioView.jsx`: implementa el Estudio IA con permisos, referencias, prompts, resultados y descarga.
- `src/views/BulkEditorView.jsx`: restaura el panel operativo de Casa Alberto con una vista única de tarjetas, configura el acceso automático una sola vez y confirma la persistencia real antes de aprobar, ignorar, deshacer o vincular.
- `src/views/HistoryView.jsx`: mejora fechas/categorías de gastos y delega correctamente eliminar/restaurar ventas.
- `src/views/InventoryView.jsx`: corrige el día mostrado y evaluado en vencimientos.
- `src/views/MetricsView.jsx`: rediseña Métricas por secciones operativas, lectura guiada, caja, gráficos y navegación accesible.
- `src/views/WhatsAppInboxView.jsx`: calcula una vez el historial del socio activo y elimina estado/importaciones sin uso.

## Diagnósticos de Supabase

- `supabase/diagnostics/audit_core_data_integrity.sql`: audita coherencia entre ventas, items, stock y datos centrales.
- `supabase/diagnostics/audit_rls_posture.sql`: informa RLS, políticas y privilegios efectivos del esquema público.
- `supabase/diagnostics/classify_core_data_anomalies.sql`: clasifica anomalías históricas de ventas e items por tipo.
- `supabase/diagnostics/inspect_duplicate_product_barcodes.sql`: resume códigos de barra repetidos y sus productos.
- `supabase/diagnostics/inspect_historical_sale_anomalies.sql`: compara totales históricos contra sus líneas de venta.
- `supabase/diagnostics/inspect_migration_history.sql`: lista el historial registrado de migraciones.
- `supabase/diagnostics/investigate_duplicate_product_barcode_edits.sql`: rastrea ediciones asociadas a códigos duplicados.
- `supabase/diagnostics/investigate_duplicate_product_barcodes.sql`: investiga en detalle los productos duplicados identificados.
- `supabase/diagnostics/investigate_duplicate_product_barcodes_compact.sql`: ofrece una vista compacta de esos duplicados.
- `supabase/diagnostics/investigate_duplicate_product_barcodes_references.sql`: localiza referencias y logs relacionados con los duplicados.
- `supabase/diagnostics/investigate_sale_1036.sql`: reconstruye en detalle el caso histórico de la venta 1036.
- `supabase/diagnostics/investigate_sale_1036_compact.sql`: resume el mismo caso para comparación rápida.
- `supabase/diagnostics/verificar_permisos_por_usuario.sql`: comprueba que los permisos configurados en Rebu sigan gobernando las acciones.
- `supabase/diagnostics/verify_auth_link_rpc.sql`: valida el vínculo entre usuarios Rebu y Supabase Auth.
- `supabase/diagnostics/verify_core_sales_rpc.sql`: verifica funciones transaccionales centrales y atribución de actor.
- `supabase/diagnostics/verify_historical_migrations.sql`: comprueba objetos esperados de las migraciones históricas.
- `supabase/diagnostics/verify_product_updated_at_backfill.sql`: valida el backfill y fingerprints del catálogo.
- `supabase/diagnostics/verify_products_incremental_sync_index.sql`: informa el índice usado por la sincronización incremental.
- `supabase/diagnostics/verify_supplier_price_batch.sql`: prueba autorización y atomicidad del lote de precios del proveedor.

## Edge Function y migraciones

- `supabase/functions/ai-image-studio/index.ts`: protege la generación/edición de imágenes y mantiene la clave de Cloudflare fuera del cliente.
- `supabase/migrations/20260728_realtime_publication.sql`: elimina el nombre legacy sin timestamp completo.
- `supabase/migrations/20260728_whatsapp_permission_hardening.sql`: elimina el nombre legacy sin timestamp completo.
- `supabase/migrations/20260728000000_realtime_publication.sql`: renombra de forma registrable la publicación Realtime de tablas Rebu.
- `supabase/migrations/20260728010000_whatsapp_permission_hardening.sql`: renombra de forma registrable el endurecimiento de permisos WhatsApp.
- `supabase/migrations/20260823190314_web_catalog_editor.sql`: crea el editor de catálogo web, almacenamiento y controles por permisos.
- `supabase/migrations/20260824213346_supplier_price_batch.sql`: agrega actualización atómica y autorizada de precios de proveedor.
- `supabase/migrations/20260825091150_reconcile_historical_sales_and_indexes.sql`: reconcilia wrappers de venta, actor seguro e índices históricos.
- `supabase/migrations/20260825093118_backfill_product_updated_at.sql`: completa `updated_at` sin alterar el estado editorial del catálogo.
- `supabase/migrations/20260825093920_fix_auth_link_ambiguity.sql`: corrige ambigüedad de `auth_email` y asegura el `search_path`.
- `supabase/migrations/20260826021015_products_incremental_sync_index.sql`: agrega el índice `(updated_at, id)` para deltas de productos.
- `supabase/migrations/20260826220000_venta_sin_sesion_auth.sql`: habilita RPC transaccionales de caja para `anon` sin depender de una sesión Auth.
- `supabase/migrations/20260826230000_caja_sin_jwt.sql`: adapta atribución de actor y cobros al modo temporal sin JWT.
- `supabase/migrations/20260826234500_endurecer_venta_sin_jwt.sql`: refuerza actor, fechas y privilegios del flujo anterior.
- `supabase/migrations/20260827000000_permisos_desde_la_app.sql`: traslada decisiones operativas a los permisos configurados dentro de Rebu.
- `supabase/migrations/20260827010000_correcciones_auditoria.sql`: corrige pedidos, presupuestos WhatsApp y actores inactivos detectados por auditoría.
- `supabase/migrations/20260827020000_anon_sin_limitantes.sql`: mantiene compatibilidad legacy abriendo el esquema público para el rol `anon`.
- `supabase/migrations/20260827030000_venta_idempotente.sql`: impide ventas duplicadas mediante clave de operación y lock transaccional.
- `supabase/migrations/20260827040000_endurecer_anon_v132.sql`: cierra implementaciones `unchecked` y exige grants explícitos para funciones futuras.
- `supabase/migrations/20260828163500_conflicto_costos_sin_candados.sql`: evita locks inútiles ante conflictos de costos, impide reintentos automáticos y conserva compatibilidad sin JWT.
- `supabase/tests/web_catalog_security_test.sql`: valida lectura pública y mutaciones protegidas del catálogo web.

## Pruebas de regresión

- `tests/ai-image-studio.test.js`: cubre permisos, validación y seguridad del Estudio IA y su Edge Function.
- `tests/app-user-load-control.test.js`: cubre fallback legacy seguro y mensajes de errores al cargar usuarios.
- `tests/cloud-load-control.test.js`: prueba corte, alcance y fusión de sincronización incremental de productos.
- `tests/data-integrity.test.js`: verifica fechas locales, escrituras sensibles y campos críticos de nube.
- `tests/database-indexes.test.js`: comprueba que el índice incremental sea aditivo y compatible.
- `tests/jwt-contingency-mode.test.js`: asegura que el modo de contingencia no abra ni renueve sesiones JWT.
- `tests/migration-history-reconciliation.test.js`: controla versiones únicas, migraciones requeridas, idempotencia y cierre de funciones internas.
- `tests/pos-checkout-session-fallback.test.js`: confirma que cobrar usa RPC sin quedar bloqueado por Auth.
- `tests/realtime-publication.test.js`: apunta al nombre normalizado de la migración Realtime.
- `tests/sales-payload-schema.test.js`: impide que reaparezca `pointsSpent` en lugar de `points_spent`.
- `tests/secure-session.test.js`: verifica cobro no bloqueante, recuperación y registro de errores de sesión.
- `tests/session-self-heal.test.js`: cubre reintentos seguros, concurrencia, timeouts y diagnósticos del autorreparador.
- `tests/supabase-auth-recovery.test.js`: prueba limpieza de JWT persistidos y tolerancia al desfase de reloj.
- `tests/supabase-error-diagnostics.test.js`: valida códigos específicos de Auth, permisos y esquema.
- `tests/supplier-price-batch.test.js`: asegura que Casa Alberto persista mediante una RPC atómica y autorizada, sin confirmar estados locales ante resultados incompletos.
- `tests/supplier-price-review.test.js`: cubre estados de revisión, agrupación y avisos persistentes por usuario.
- `tests/supplier-session-control.test.js`: verifica el acceso real sin caché, el cifrado local y el inicio automático de Casa Alberto.
- `tests/transaction-history-cache.test.js`: prueba invalidación de versiones incompatibles de IndexedDB.
- `tests/transaction-sync.test.js`: asegura que el Dashboard progresivo no hidrate innecesariamente todo el historial.
- `tests/whatsapp-inbox.test.js`: actualiza la migración WhatsApp y valida el historial precalculado del socio.
- `tests/web-catalog-permissions.test.js`: cubre permisos independientes del editor y publicación del catálogo.

## Validación de cierre

- Regresión: 356 pruebas aprobadas.
- Flujos visuales focalizados: 8 pruebas aprobadas (presupuesto adaptable, reportes, enlaces y sesión de Casa Alberto).
- Lint: aprobado.
- Build Vite de producción: aprobado.
- Instalador NSIS: `Rebu Cotillón System Setup 1.2.32.exe` generado correctamente.
