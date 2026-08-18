# WhatsApp compartido por Tailscale

La PC central publica exclusivamente el servicio local de WhatsApp dentro de la red privada
de Tailscale. La URL estable es:

```text
https://rebu-whatsapp-central.tailbdf1e7.ts.net
```

## PC central

La central debe mantener activos Windows, Docker Desktop, el stack del bot y el servicio de
Tailscale. La aplicación Rebu puede cerrarse: el bot y la concesión central funcionan como
servicios independientes.

La publicación persistente se configura una sola vez desde una consola de administrador:

```powershell
tailscale serve --bg --yes 3000
```

Comprobarla con:

```powershell
tailscale serve status
```

## Otras PCs

1. Instalar Tailscale desde `https://tailscale.com/download/windows`.
2. Iniciar sesión con un usuario autorizado en el mismo tailnet.
3. Confirmar que `rebu-whatsapp-central` aparece en línea.
4. Instalar Rebu Cotillón 1.2.11 o posterior.
5. Iniciar Rebu con un usuario que tenga el permiso `whatsapp.view`.
6. En WhatsApp, seleccionar **Solicitar acceso a la central**.
7. Esperar que un usuario Sistema apruebe esa PC desde **Configurar bot > Máquina central**.
8. Instalar o abrir Tailscale con el botón que aparece después de la aprobación.

Las PCs remotas no deben instalar Docker, Evolution ni una segunda sesión de WhatsApp. La
aplicación usa automáticamente la URL privada de Tailscale; la central conserva el acceso
local por `127.0.0.1:3000`.

La autorización de Rebu y el acceso a la red Tailscale son dos controles distintos. Aprobar
una PC permite que su instalación use WhatsApp, pero Tailscale también debe estar iniciado y
conectado al mismo tailnet. La autorización se identifica por una clave local aleatoria: un
cambio de IP no obliga a aprobar nuevamente el equipo y la clave nunca se guarda sin cifrar
en Supabase.

Cuando WhatsApp ya está conectado en la central no se muestra ningún QR en las otras PCs:
la bandeja debe aparecer directamente como conectada. El QR sólo existe mientras la sesión
central necesita ser vinculada o reconectada.

## Diagnóstico

Si una PC remota no abre la bandeja:

1. Confirmar que Tailscale figure conectado en ambas PCs.
2. Abrir `https://rebu-whatsapp-central.tailbdf1e7.ts.net/health/ready` desde la PC remota.
3. Comprobar en Rebu que el usuario tenga `whatsapp.view`.
4. Confirmar que la central siga encendida y que Docker Desktop esté iniciado.
5. En la PC central, comprobar que el dispositivo figure como **Aprobada**.

## Orden de despliegue seguro

1. Aplicar la migración `20260816234500_whatsapp_device_access.sql` en el proyecto de Rebu.
2. Instalar 1.2.11 en la central e ingresar como Sistema; la central se registra y aprueba a sí misma.
3. Verificar la central en la lista de dispositivos.
4. Activar `BOT_DEVICE_ACCESS_ENFORCED=true` y reiniciar el contenedor del bot.
5. Instalar 1.2.11 en las PCs remotas y aprobar sus solicitudes.

No activar la validación estricta antes del paso 2: versiones anteriores no envían la
identidad del dispositivo y quedarían bloqueadas por diseño.

No habilitar Tailscale Funnel: Serve debe permanecer privado dentro del tailnet.
