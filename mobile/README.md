# Rebu Stock móvil

PWA interna para Android e iPhone, con la misma base Supabase de Rebu. Tiene un build independiente: no carga Electron, el punto de venta ni su caché local.

Primera publicación: https://rebu-stock-movil.coralscout514.chatgpt.site

El alojamiento permite abrir el enlace sin iniciar sesión en ChatGPT. Para consultar o modificar inventario se ingresa con el usuario y la contraseña de Rebu, y la base verifica los permisos de ese usuario en cada operación. La identidad del sitio queda en `mobile/.openai/hosting.json` y debe conservarse para futuras publicaciones. Mantener el acceso público del alojamiento al publicar nuevas versiones; no usar el despliegue reservado a sitios privados del propietario.

## Ejecutar

Desde la raíz del repositorio:

```sh
npm install
npm run dev:mobile
npm run build:mobile
npm run preview:mobile
```

El desarrollo abre `http://127.0.0.1:5176`. El build queda en `mobile/dist`. Se toman exclusivamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del entorno de la raíz. No agregar credenciales de base de datos ni claves privilegiadas al build.

Publicar el contenido de `mobile/dist` en un alojamiento estático HTTPS. La cámara y la instalación requieren un contexto seguro (HTTPS o localhost); abrir la IP de la PC por HTTP desde el celular no habilita la cámara. Puede alojarse en una ruta propia: manifest, service worker y assets son relativos a ella.

Para preparar el código fuente separado del sitio, ejecutar `node scripts/prepare-mobile-site.mjs`. Conserva la identidad de Sites y genera un checkout en `output/rebu-stock-site` con solo el código móvil y su build. No copia el escritorio ni archivos de entorno. En Windows, usar el Node 24 del runtime de Codex para los helpers de empaquetado de Sites: el Node 25 del sistema presenta un fallo nativo de `fs.cpSync` al copiar directorios de esta unidad.

## Base compartida

La migración `supabase/migrations/*_rebu_mobile_stock.sql` añade endpoints móviles sin cambiar las funciones del escritorio. Los usuarios deben estar vinculados a Supabase Auth, como los usuarios actuales de Rebu. Se ingresa seleccionando el usuario de Rebu y su contraseña.

- La identidad y los permisos se verifican en la base en cada llamada.
- `inventory.view` permite consultar; `inventory.edit` permite guardar movimientos.
- Búsqueda por nombre, marca o código, por páginas de 30. El escáner busca el código exacto y muestra las coincidencias si hay códigos repetidos.
- Ingreso suma cantidades; conteo fija el total. Los productos por peso usan gramos enteros, como la PC.
- El servidor bloquea la fila, comprueba el stock consultado y guarda producto, auditoría e identificador de operación en una única transacción.
- Un conflicto obliga a actualizar y revisar. Cada confirmación pendiente se conserva en `localStorage` con su propio identificador y usuario; sobrevive al cierre de la pestaña y no sobrescribe movimientos de otras pestañas. Se migran las confirmaciones de la primera versión que estaban en `sessionStorage`.
- Una pérdida de conexión después del envío puede dejar el resultado pendiente. “Comprobar movimiento” consulta primero su estado en el servidor y solo reenvía la misma operación cuando no fue registrada. Puede comprobar un ingreso ya registrado aunque el usuario haya perdido permiso de edición. No crear otro ingreso para reemplazarlo.
- Se registran los movimientos en `public.logs` con el usuario real y `source: mobile_pwa`.

## Instalación y conexión

Android: menú de Chrome → Instalar aplicación. iPhone: Safari → Compartir → Agregar a pantalla de inicio. La ayuda también está disponible desde la aplicación.

Esta primera versión requiere Internet para operar. El service worker conserva únicamente la interfaz; no guarda respuestas de Supabase ni encola modificaciones de stock. Al volver a la app se actualizan los resultados, y al abrir un producto se consulta su stock de nuevo. La PC recibe los cambios mediante su sincronización existente de productos.

El lector usa ZXing, cargado al abrir la cámara, para soportar navegadores sin BarcodeDetector. Los fotogramas se procesan en el dispositivo. Cierra la cámara al salir del escáner o pasar la app a segundo plano. La lectura con cámaras físicas debe verificarse en los teléfonos reales del local.

## Verificación

```sh
node --test tests/mobile-stock.test.js
npm run test:mobile:db
```

La verificación de base requiere las credenciales `SUPABASE_DB_*` locales. Cuando los endpoints todavía no existen, los instala dentro de una transacción de prueba; si ya existen, verifica los instalados. Crea productos sintéticos y revierte todo al terminar; no modifica stock real.

La migración móvil ya se aplicó y se registró en el historial de la base compartida. El modo explícito `node scripts/verify-mobile-stock.mjs --apply` instala los endpoints cuando faltan y registra la migración; el modo normal solo verifica y revierte sus datos de prueba.

Las comprobaciones de navegador están en `scripts/mobile-stock-smoke.py`. Usan Playwright para Python con una API simulada, incluido un EAN generado como video de cámara, sin modificar productos reales. Requieren el preview en el puerto 4176 y Playwright instalado en el Python usado para ejecutarlas (o en `output/mobile-python`). Las capturas quedan en `output/mobile-qa`.

Los casos adversos adicionales están en `scripts/mobile-stock-edgecases.py`. Se puede elegir otro preview con `REBU_TEST_URL` y ejecutar el flujo principal con WebKit usando `REBU_TEST_ENGINE=webkit`. Las pruebas que envían credenciales o movimientos bloquean service workers para garantizar que el servidor real no reciba solicitudes simuladas. La comprobación del caché se hace separadamente sin iniciar sesión. El port de WebKit para Windows no ofrece cámara/captura de video de canvas: la decodificación EAN sintética se verifica en Chromium y la cámara física de iPhone debe comprobarse en un dispositivo.

El resultado de la auditoría y los límites de verificación se documentan en `mobile/AUDIT.md`.
