# Rebu 1.2.59

Actualización de producción para trabajar con los datos guardados cuando se corta internet y revisar las acciones pendientes al recuperar la conexión.

## Cambios

- Corrige la carga constante al abrir sin internet y al perder la conexión con la aplicación abierta. Suspende el canal de datos y cancela las lecturas interrumpidas para liberar la pantalla.
- Conserva el carrito actual durante el corte, incluso si existe una copia guardada más antigua. Recrea el canal de datos al reconectar y consulta nuevamente la nube.
- Agrega el panel **Pendientes** para revisar las acciones guardadas en esta PC. Permite confirmarlas o descartarlas; recuperar internet por sí solo no las aplica.
- Antes de confirmar, vuelve a verificar permisos y cambios en los registros de la nube. Los conflictos quedan visibles para su revisión.
- Las ventas pendientes conservan su solicitud original para recuperarse de un reinicio o una respuesta perdida sin duplicarse. Un doble clic o una segunda ventana no pueden confirmar simultáneamente la misma acción.
- Evita que un formulario recargue la pantalla antes de terminar el guardado local y que una actualización interrumpida muestre un aviso falso de éxito.

## Uso sin conexión

La PC debe haber iniciado sesión con conexión y tener una copia de los datos. Las acciones pendientes se conservan en el perfil local de esa PC; permanecen pendientes después de cerrar o reiniciar Rebu. No se contabilizan como operaciones de la nube hasta confirmarlas. Las ventas se registran con la fecha del servidor al confirmarse. El cierre de caja requiere resolver primero las acciones pendientes.

## Verificación

- 704 pruebas automatizadas y 43 regresiones de navegador aprobadas sobre la copia de release.
- 18 escenarios de modo offline y acciones pendientes aprobados, incluidos almacenamiento lleno, registro dañado, permisos revocados, ventanas concurrentes y recuperación de ventas.
- 7 escenarios ejecutados sobre el programa Windows empaquetado 1.2.59, con perfiles aislados y servicios simulados: inicio sin conexión, corte en uso, lectura interrumpida, Wi-Fi sin acceso al servidor, venta pendiente tras reinicio y dos formas de recuperación ante respuesta perdida.
- Compilación de producción y ESLint aprobados; auditoría de dependencias de producción sin vulnerabilidades informadas.
- Versión del ejecutable y del paquete verificadas. Tamaño y SHA-512 del instalador comprobados contra `latest.yml`; contenido revisado para excluir archivos privados y cambios de compras y señas ajenos a esta actualización.

## Distribución

Incluye el instalador Windows x64, su archivo `.blockmap` y `latest.yml`. Puede instalarse desde la notificación de actualización de Rebu o ejecutando el instalador publicado. Esta actualización no requiere nuevas migraciones de base de datos.
