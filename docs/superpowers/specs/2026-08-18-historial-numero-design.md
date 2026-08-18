# Historial del número: traer del teléfono, y todo en Configuraciones

Fecha: 2026-08-18
Estado: aprobado por Mikkel, listo para implementar

## Problema

El cartel de la bandeja **"Estás viendo sólo lo nuevo / Las conversaciones que Rebu
ya tiene de este número están guardadas..."** hace dos cosas mal:

1. **Trae del lugar equivocado.** Su botón llama a `POST /api/operator/history-window/older`,
   que corre la fecha de corte hacia atrás sobre la base de Rebu. Es el caché de la
   PC, no el teléfono.
2. **Hoy no trae nada.** Medido el 18-ago-2026: el corte está en `2026-07-27T17:08:55Z`
   y hay **0 conversaciones** por debajo. Las 15 que existen son todas posteriores.
   El aviso ocupa la pantalla y su botón no puede hacer nada.

Además el control vive en la bandeja, donde no se puede configurar nada.

## Decisiones de Mikkel

- El aviso **se va de la bandeja** a Configurar Blacky, como sección propia.
- El botón pasa a traer **del teléfono** (`import-chats`), no del caché.
- La limitación del `@lid` **se acepta**: se traen las que se pueda. Las demás
  entran solas cuando el cliente escribe, con el teléfono ya resuelto — no hay
  que enlazar nada a mano.
- El import **no abre la ventana solo**: avisa y ofrece el botón.
- **Los textos no pueden ser técnicos.** Los lee alguien que atiende el negocio,
  no un programador. Nada de "ventana de historial", "caché" ni "corte".

## Lo que se puede traer, medido

| | |
|---|---|
| Chats que devuelve WhatsApp | 472 |
| Grupos (se descartan) | 8 |
| Con `@lid` sin teléfono resoluble | 461 |
| **Importables** | **22** |
| **Mensajes que traería** | **593** |

WhatsApp identifica casi todos los chats con un `@lid`, que es un número opaco,
no un teléfono. Evolution 2.3.7 no lo traduce, y ya está probado que actualizar
a 2.4 **no** lo arregla (ver memoria `rebu-bot-whatsapp-proyecto`).

Los `@lid` **no se importan como filas huérfanas**: `telefonoDeChat` devuelve
null y `mapearChat` descarta el chat entero. No queda basura que limpiar.

## Impacto en la base — analizado, sin riesgo

El bot y el POS usan **dos proyectos Supabase distintos**:

| | Proyecto | Efecto |
|---|---|---|
| Bot WhatsApp | `vyojxgvffydiulnghfid` | Todo el cambio cae acá |
| POS / catálogo | `rwqqjthrvweubksrlqzy` | No se toca |

- Base del bot **hoy: 12 MB** (15 conversaciones, 95 mensajes).
- Import completo suma **~300 KB** → ~12,3 MB. El piso de cualquier plan es 500 MB.
- Peor caso de un click: 50 conversaciones × 200 mensajes ≈ 5 MB. Los topes ya
  existen en `proximoLote` (1..50) y `chatMessages` (1..200).
- Índices necesarios ya presentes: `(account_id, updated_at DESC)` para el filtro
  y `(phone, created_at DESC)` para abrir una conversación.
- No se pisan conversaciones vivas: `proximoLote` descarta las que ya existen
  antes de escribir.

## Arquitectura

### Bot — arreglos de fondo

**1. `importMessages` está roto (`42P10`).** Verificado contra la base real:
usa `on_conflict=provider,provider_message_id`, pero ese índice único es
**parcial** (`WHERE provider_message_id IS NOT NULL`) y Postgres lo rechaza.
El error se traga por conversación, así que hoy el import dejaría **22
conversaciones vacías, sin un solo mensaje**.

Arreglo: consultar qué `provider_message_id` ya existen y filtrarlos antes de
insertar, **de a 100 por consulta** — mandar 593 IDs en una sola URL la hace
fallar por largo.

**2. `conversationPhones` tiene un techo dormido.** Pide `limit: 2000`. Con 15
sobra, pero pasado ese número dejaría de reconocer conversaciones existentes y
podría pisarlas. Se pagina.

**3. `historyWindow()` devuelve más datos**, para que ningún botón mienta sobre
lo que va a hacer:

```
{
  account_id, history_from, decided_by_name, muestra_todo,
  ocultas,      // conversaciones que el corte está tapando
  importables,  // chats del teléfono con teléfono resoluble
  total_chats   // chats de personas que ve WhatsApp
}
```

`importables` y `total_chats` salen de Evolution y pueden fallar. Si fallan,
van en `null` y la pantalla omite el número — **nunca bloquean la sección**.

### App — la sección nueva

Nueva entrada en `SECTIONS` de `WhatsAppBotSettingsPanel.jsx`: **"Historial del
número"**, con el mismo gateo que el resto — leer con `whatsapp.view`, tocar con
`whatsapp.connection.manage`.

Cuatro bloques:

| Bloque | Qué hace | Endpoint |
|---|---|---|
| Estado | Desde cuándo se ve, quién lo decidió, cuántas quedan tapadas | `GET /history-window` |
| Traer del teléfono | Dice cuántas puede antes de arrancar | `POST /import-chats` |
| Ver todo / Empezar de cero | Mueve la ventana entera | `POST /history-window` |
| Traer lo ya guardado | El botón viejo, rotulado sin ambigüedad | `POST /history-window/older` |
| Cuánto traer | Conversaciones por tanda y mensajes por conversación | params de `import-chats` |

En la bandeja queda **una línea discreta y descartable** cuando hay corte activo,
que abre esta sección. Sin botón de acción propio. No se saca del todo porque
una bandeja recortada sin ninguna explicación se lee como datos perdidos — ya
pasó una vez y asustó.

### Textos (aprobados)

Después de importar:

> **Listo, traje 22 conversaciones del teléfono.**
> Hay 14 que todavía no se ven en la bandeja porque está puesta para mostrar
> solo lo del último tiempo.
> [Mostrar todas]

Encabezado de la sección:

> **Qué conversaciones se ven**
> Ahora mismo la bandeja muestra lo que llegó desde el 27 de julio. Lo anterior
> sigue guardado, nadie lo borró.

Regla para todo texto de esta sección: nada de "ventana de historial", "caché",
"corte" ni nombres de endpoint.

## La trampa que resuelve el diseño

Las conversaciones que se traen del teléfono son **más viejas que el corte**, así
que la bandeja las sigue ocultando. Sin el aviso post-import, apretás el botón,
trae bien, y no aparece nada: parece roto sin estarlo.

Por eso el import termina diciendo cuántas quedaron tapadas y ofrece
**[Mostrar todas]** ahí mismo. No se abre solo: es una decisión que afecta a
todo el equipo.

## Pruebas

- `chat-import`: normalizadores puros, ya cubiertos. Sumar el caso del filtrado
  por lotes de `provider_message_id`.
- `history-window`: el test existente asume el botón viejo; hay que actualizarlo.
- `operator-service`: que `historyWindow()` devuelva `ocultas`/`importables` en
  null cuando Evolution falla, sin tirar la sección.
- App: `historyWindow.js` pasa a producir textos de usuario; test de que ningún
  texto contenga las palabras prohibidas.

## Fuera de alcance

- Resolver el `@lid`. Requiere una Evolution que lo traduzca; no existe hoy.
- Tocar la base del POS.
- Deploy y `electron:build`. Se trabaja local; el build se pide aparte.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El bot **no tiene git** | Respaldo en `backups/historial-18ago/` antes de editar |
| La app arrastra 61 archivos sin commitear de otras sesiones | No commitear nada ajeno; solo los archivos de este trabajo |
| Otras sesiones de agente editando lo mismo | Revisar procesos antes de tocar |
