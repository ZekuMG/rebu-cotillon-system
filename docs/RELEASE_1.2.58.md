# Rebu 1.2.58

Actualización de escritorio con pagos combinados para gastos y correcciones en los carritos de venta.

## Cambios

- Gastos permite agregar hasta cuatro métodos de pago con un importe por método. Valida importes positivos, métodos distintos y una suma igual al total del gasto.
- El reparto se conserva al editar, volver a abrir y recuperar datos desde caché. El historial permite encontrar un gasto por cualquiera de sus métodos y la bitácora muestra los cambios del reparto.
- El cierre de caja descuenta únicamente la parte del gasto pagada en efectivo. Los gastos con crédito conservan su importe sin aplicar el recargo utilizado para ventas.
- El formulario de gastos cancela los envíos repetidos y bloquea sus controles durante el guardado, evitando una recarga accidental de la pantalla.
- Las pestañas de los carritos se muestran completas, distribuyen correctamente su ancho y mantienen visible la activa al abrir más carritos o cambiar el tamaño de la ventana.
- El selector del empleado que atiende permite elegir pulsando el nombre, cierra correctamente con Escape o al pulsar afuera y conserva la selección de cada carrito.

## Verificación

- 670 pruebas unitarias y 43 pruebas de interfaz aprobadas, incluyendo gastos combinados y pestañas de carritos en la batería habitual.
- 8 comprobaciones de atribución e idempotencia de ventas y 10 de precios y permisos, ejecutadas con reversión de los cambios de prueba.
- ESLint del código de escritorio, compilación de producción y auditoría de dependencias de producción aprobados.
- Ejecutable Windows 1.2.58 iniciado con un perfil aislado. Se verificaron dentro de Electron la selección de empleado, las pestañas y conservación de carritos, los gastos combinados y el descuento de efectivo en el cierre, sin errores del renderer.
- Tamaño y SHA-512 del instalador comprobados contra `latest.yml`, versión del paquete confirmada y contenido revisado para excluir archivos privados.

## Base de datos

La migración `20261107174305_expense_payment_breakdown` está aplicada en la base compartida. Agrega el reparto de pagos sin modificar los gastos anteriores; esos registros siguen usando su método original. Se verificó que la tabla conserva RLS y que el acceso anónimo permanece bloqueado.

## Distribución

La release incluye el instalador Windows x64, su archivo `.blockmap` y `latest.yml`. Está preparada para detectarse desde el actualizador de Rebu y también puede instalarse ejecutando el instalador publicado en GitHub.
