# QR de WhatsApp en vivo: aparición instantánea, edad visible y renovación automática

**Fecha:** 2026-08-17
**Alcance:** pantalla de conexión de WhatsApp en la app Rebu (POS) + bot de WhatsApp.
**Fuera de alcance:** anclar chats, etiquetas/alias por conversación y el bug de borrado (`electron-main.cjs:207`). Van en specs aparte.

---

## Problema

Al vincular WhatsApp, la pantalla muestra un QR que puede estar vencido sin que el usuario lo sepa. El resultado observado el 17-ago-2026 fue que el celular respondía **"no se puede enlazar el dispositivo"** al escanear.

Tres causas concretas, todas verificadas en el código y con mediciones:

1. **El botón "Generar nuevo QR" no genera nada.** En `operator-service.js:1386-1416` la función `connection(action)` maneja `logout` y `restart`, pero **no tiene rama para `'qr'`**. La acción cae al camino genérico y hace exactamente lo mismo que el sondeo automático: `evolution.connect()`, que devuelve el código *vigente*, no uno nuevo.

2. **No hay forma de saber la edad del código.** El bot devuelve `{ state, qr, connected, evolution_available, evolution_error }` (`operator-service.js:1418-1424`). No hay timestamp. La pantalla no puede distinguir un código recién nacido de uno de hace tres minutos.

3. **Un QR viejo puede quedar pegado.** En `WhatsAppInboxView.jsx:3137-3139`, si una respuesta viene sin `qr`, se conserva el anterior indefinidamente mientras Evolution siga reportándose disponible. El comentario dice que es para cubrir "un hueco puntual", pero no hay límite de tiempo.

### Lo que NO es el problema

El sondeo ya es rápido: `WhatsAppInboxView.jsx:3153-3161` consulta **cada 3 s** mientras no está conectado, y baja a 30 s recién tras 3 lecturas seguidas en `open`. No hay que tocarlo.

### Mediciones (17-ago-2026, instancia `rebu-cotillon`)

- Evolution llevaba **19 códigos emitidos** (`count: 19`).
- El estado cicla a `connecting` cada **~3 min 31 s**.
- En una ventana de **30 s** con 10 consultas, el código **no cambió ni una vez**.

**Consecuencia de diseño:** pedir el código de nuevo es gratis pero **no lo renueva**; devuelve el vigente. Renovar de verdad exige reiniciar la conexión (`evolution.restart()`). Por eso forzar cada 15 s dejaría la conexión en reinicio permanente y el celular nunca completaría el escaneo. El umbral de forzado va en **40 s**; a los 15 s sólo se avisa.

---

## Diseño

### Bot — `src/operator-service.js`

**1. Recordar cuándo apareció cada código.** Estado en memoria del módulo (no toca la base):

```
lastQrCode: string | null
lastQrSeenAt: number | null   // Date.now()
```

En cada `connection()`, tras obtener `qr`: si `qr.code` es distinto de `lastQrCode`, se actualizan ambos. Si es igual, `lastQrSeenAt` no se toca.

**2. Informar la edad.** La respuesta pasa a incluir:

```
qr: { ...loQueYaVenía, generated_at: <ISO>, age_seconds: <entero> }
```

`age_seconds` se calcula en el bot, **no en la app**: las PCs remotas pueden tener la hora corrida y el contador quedaría mal.

**3. Implementar `action === 'qr'`.** Nueva rama junto a `logout` y `restart`:

```
if (action === 'qr') {
  await evolution.restart().catch(remember);
  lastQrCode = null;          // el próximo código cuenta como nuevo
  lastQrSeenAt = null;
}
```

Queda antes de leer `connectionState()`, igual que las otras dos ramas.

**Guarda contra el abuso:** si ya se forzó un reinicio hace menos de **20 s**, la rama `'qr'` no reinicia de nuevo y sólo devuelve el código vigente. Protege tanto del botón apretado muchas veces como de un bug en el temporizador de la app.

### App — `src/views/WhatsAppInboxView.jsx`

**4. Soltar el QR viejo.** En el bloque de `3137-3139`, conservar el anterior sólo si tiene **menos de 60 s**. Pasado eso se descarta y la pantalla muestra el estado de espera, que es la verdad.

**5. Re-dibujar al cambiar.** La imagen del QR lleva `key={qr.code}` para que React reemplace el nodo cuando el código cambia, en vez de actualizar el `src` sobre el mismo elemento.

**6. Contador vivo.** Debajo del QR, texto que sube de a un segundo:

- `0-14 s` → *"generado hace N s"*, neutro
- `15-39 s` → *"generado hace N s · puede estar por vencer"*, ámbar
- `≥ 40 s` → *"renovando..."*, y dispara el forzado

La base es el `age_seconds` que manda el bot; el contador local sólo suma el tiempo transcurrido desde que llegó la respuesta.

**7. Renovación automática.** Al cruzar los **40 s**, la app llama `whatsappOperator.connectionAction('qr')` una sola vez por código. Se re-arma cuando llega un código distinto. Sólo corre con el panel de conexión abierto y la sesión sin vincular.

**8. Umbrales en un solo lugar**, arriba del componente, para poder moverlos sin buscar:

```
const QR_WARN_SECONDS = 15;
const QR_FORCE_SECONDS = 40;
const QR_STALE_KEEP_SECONDS = 60;
```

---

## Flujo

```
cada 3 s ──> bot: connection()
               └─ evolution.connect() ──> ¿código distinto?
                     sí ─> reinicia lastQrSeenAt ─> age_seconds = 0
                     no ─> age_seconds sigue subiendo
             app: si cambió el código, nueva imagen + contador a 0
                  si age >= 40 ─> connectionAction('qr') ─> bot reinicia Evolution
```

## Errores

- **Evolution caído** (`evolution_available: false`): se descarta el QR (comportamiento actual, se respeta) y no se dispara el forzado. Sin reinicios contra un servicio caído.
- **Falla el forzado:** se registra `evolution_error`, la pantalla sigue mostrando el último código con su edad real, y se reintenta en el siguiente cruce de umbral.
- **Se vincula durante el forzado:** al llegar `connected: true` se cancela todo temporizador y no se reinicia nada.

## Pruebas

En `tests/whatsapp-inbox.test.js` (ya existe y cubre esta vista):

1. `connection()` con el mismo código dos veces → `age_seconds` crece y `generated_at` **no** cambia.
2. `connection()` con código distinto → `age_seconds` vuelve a 0.
3. `action: 'qr'` → llama a `evolution.restart()`.
4. `action: 'qr'` dos veces en menos de 20 s → **un solo** `restart()`.
5. QR previo de más de 60 s sin `qr` en la respuesta → se descarta.
6. Cruce de 40 s → dispara `connectionAction('qr')` **una sola vez** por código.

Verificación manual obligatoria: desvincular, mirar el contador subir, confirmar que a los 40 s aparece un código nuevo, y **escanear de verdad** hasta llegar a `open`. Probar también en una PC remota por Tailscale.

## Despliegue

Toca los dos proyectos:

1. **Bot:** editar `src/operator-service.js` → `docker compose -f docker-compose.evolution.yml up -d --no-deps --build bot`.
2. **App:** editar la vista → `npm run electron:build` (⚠️ lleva `--publish always`: publica release en GitHub, pedir OK antes) → **instalar el `.exe`** en cada PC. Construir no instala.

El bot es compatible hacia atrás: los campos nuevos son agregados, así que una app vieja sigue funcionando igual. Conviene desplegar el bot primero.

⚠️ El proyecto del bot **no tiene git**: copiar `operator-service.js` a un lado antes de tocarlo.
