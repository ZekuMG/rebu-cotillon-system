# Rebu 1.2.57

Actualización de escritorio que incorpora las mejoras de caja y conserva las correcciones de seguridad y sesión de las versiones 1.2.54 y 1.2.55.

## Cambios

- Al cobrar, se pregunta quién hizo la venta. El usuario de caja seleccionado queda en la venta y su comprobante; los permisos siguen dependiendo de la sesión autenticada.
- Cada carrito conserva socio, usuario de caja, bolsita, efectivo, cuotas y pagos combinados.
- Los cobros pendientes conservan su identificador y pedido original al reiniciar. Una respuesta perdida o una falla al consultar el comprobante se puede recuperar sin registrar otra venta ni descontar otra vez stock o puntos.
- El carrito vuelve a su presentación con colores: socio en violeta, puntos en turquesa y peso/crédito en ámbar. Muestra la información del socio y mantiene compacto el resumen, con total y cobro al pie.
- Los avisos de conexión y compras de prueba ocupan una franja estable. La reconexión conserva los carritos y permite renovar el acceso del mismo usuario.
- Se conservan precios manuales y centavos por kilo; cada renglón se cierra a centavos y el total coincide con la suma de sus importes.
- Las cuentas de acceso exclusivamente web quedan fuera de la selección de usuarios de caja.
- El repositorio incorpora el cliente de stock móvil, sus migraciones y verificaciones, y las herramientas manuales de revisión y respaldo de imágenes. La publicación móvil es independiente del instalador de escritorio.

## Verificación

- 664 pruebas unitarias y 34 pruebas de interfaz aprobadas.
- 8 comprobaciones de atribución e idempotencia de ventas en transacción revertida.
- 10 comprobaciones del precio manual y de conservación de permisos mediante una tabla temporal.
- ESLint del código de escritorio y builds de escritorio/móvil aprobados.
- Ejecutable empaquetado iniciado con un perfil aislado y versión 1.2.57 confirmada.
- SHA-512 y tamaño del instalador comprobados contra `latest.yml`.
- Auditoría de dependencias de producción sin avisos y revisión de archivos para excluir secretos y resultados locales.

## Base de datos y distribución

Se confirmó que la base compartida admite la selección de usuario de caja y las migraciones de seguridad y stock móvil. Se aplicó la migración pendiente `20261019144329_optional_product_sale_price` con respaldo de la función anterior, sin modificar precios ni stock existentes.

La release incluye el instalador Windows x64, su archivo `.blockmap` y `latest.yml`. El número 1.2.57 permite que las instalaciones 1.2.56 también detecten esta actualización. Se instala desde la notificación de actualización de Rebu o ejecutando el instalador publicado.
