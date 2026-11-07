# Auditoría de Rebu Stock móvil

Fecha local: 28 de octubre de 2026.

Se revisaron el cliente móvil, la instalación/caché, los endpoints de stock y los permisos de la base compartida alcanzables desde el enlace público. La versión de escritorio sigue en 1.2.53.

## Correcciones

| Hallazgo | Corrección |
| --- | --- |
| La vista del directorio de usuarios aceptaba escrituras anónimas, incluidos cambios de rol | Revocados los permisos de mutación a público, anónimo y autenticado. Se conserva SELECT para el login de PC y celular. |
| La consulta pública de productos permitía obtener stock exacto, y había snapshots editoriales con stock/costos | Se retiró el acceso anónimo a stock, snapshots y la vista administrativa. El catálogo público conserva disponibilidad. La proyección publicada usa una barrera de seguridad y su propietario calcula disponibilidad sin proyectar cantidades. Las variantes no admiten campos privados de stock/costos. |
| Un envío sin respuesta podía perder su identificador al cerrar la pestaña | Persistencia por movimiento y usuario en localStorage, migración de la versión anterior y recuperación de múltiples pendientes sin sobrescribirlos. |
| Un cambio de permisos/sesión podía impedir saber si un movimiento ya había sido guardado | Endpoint de consulta de resultado que verifica identidad y propiedad, incluso sin permiso de edición. Se comprueba antes de reenviar y se conserva el identificador ante errores de sesión. |
| Respuestas tardías podían abrir datos del usuario anterior después de cerrar sesión | Invalidación por sesión y solicitud; descarte de respuestas antiguas y propagación del cierre/cambio de cuenta entre pestañas. |
| Un cierre de sesión con red lenta podía dejar un token local restaurable | Retiro inmediato de la credencial local y coordinación de un nuevo ingreso con el cierre pendiente. |
| Peticiones de autenticación o red podían dejar la interfaz esperando indefinidamente | Límites de espera, cancelación y mensajes recuperables; recuperación de la carga de usuarios al reconectar. |
| Una cámara cuyo permiso llegara después de cerrar el escáner podía seguir activa | Adquisición explícita del stream, comprobación de cancelación y cierre de tracks incluso con permisos tardíos. |
| Una respuesta paginada con repetidos podía desplazar el offset hacia atrás | El offset avanza según las filas recibidas del servidor, separado del listado deduplicado. |
| Conteos a la baja con stock positivo se marcaban como reposiciones | El ciclo de stock distingue incrementos, reducciones y agotamiento. |
| Datos nulos/valores no válidos podían mostrarse como cero | Stock desconocido bloquea el envío y se muestra como “Sin dato”; precios ausentes se muestran como “Sin precio”. |
| Nombres/marcas/códigos extensos desbordaban o generaban filas excesivas | Ajustes de quiebre, truncado del código en el listado, metadatos legibles y verificación en 320/390/768/844 px. |
| Cambios escritos podían descartarse accidentalmente | Confirmación al cerrar un formulario editado y aviso de navegación con cambios pendientes. |
| Una falla al cargar el escáner podía dejar una pantalla en blanco | Pantalla recuperable de error; se conservan los identificadores de movimientos pendientes. |
| Faltaban defensas del cliente contra carga de scripts/incrustación | CSP en el build de producción y controles de inventario deshabilitados cuando la app se carga dentro de un iframe. Esta defensa del cliente complementa la autorización del servidor. |
| Había avisos de dependencias de producción | Actualización compatible de electron-updater y dependencias transitivas, sin cambiar la versión de la aplicación. `npm audit --omit=dev` devuelve cero avisos. |

## Validación

- 642 pruebas generales del repositorio aprobadas.
- 19 comprobaciones de stock sobre PostgreSQL, más comprobaciones de permisos del directorio y privacidad del catálogo. Los productos y movimientos de prueba se revierten, sin modificar stock real.
- HTTP sin sesión: stock exacto y snapshots rechazados; disponibilidad pública responde correctamente.
- Flujos móviles automatizados en Chromium y WebKit: búsqueda, ingreso, conteo, conflictos, sesión, lectura sin edición y recuperación.
- Casos adversos en Chromium: cierre de pestaña, permisos revocados, token vencido, respuestas tardías, permiso tardío de cámara, paginación con repetidos, datos hostiles/largos, formularios sin guardar, chunks faltantes e incrustación.
- Decodificación de EAN sintético y cierre de cámara en Chromium. Verificación de que el caché no guarda respuestas de Supabase.
- Builds de la PWA y del frontend de escritorio aprobados.
- ESLint del cliente móvil sin errores ni advertencias. Verificación de la publicación en Chromium: acceso al login sin ChatGPT, CSP presente y sin errores de JavaScript.

## Límites

Las pruebas no equivalen a una garantía de ausencia de vulnerabilidades. La cámara real y la instalación desde la pantalla de inicio deben comprobarse en los teléfonos del equipo. WebKit para Windows no permite validar la cámara física de Safari en iPhone. La primera versión continúa requiriendo Internet para operar.

El resultado de `npm audit --omit=dev` corresponde a dependencias de producción. No afirma que todas las dependencias de desarrollo, el instalador de Electron o servicios externos hayan recibido una auditoría completa. El actualizador actualizado deberá incorporarse al próximo instalador de PC; esta tarea publica la PWA.
