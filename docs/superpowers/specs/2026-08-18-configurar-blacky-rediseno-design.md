# Rediseño del modal "Configurar Blacky"

Fecha: 2026-08-18 · Archivo: `src/components/WhatsAppBotSettingsPanel.jsx` + reglas `wa-bot-*` de `src/views/WhatsAppInboxView.css`

## El problema

El modal se siente engorroso y no es por la cantidad de opciones:

1. **Parece un asistente de 7 pasos y no lo es.** La nav numeraba cada pestaña
   (`<em>{index + 1}</em>`) y además cada sección repetía el número en grande
   dentro de `wa-section-copy`. Son ajustes sueltos que se tocan en cualquier
   orden; la numeración promete una secuencia que no existe y da la sensación de
   tarea pendiente.
2. **Todo está escrito dos veces.** El título y la ayuda de cada sección viven
   en la pestaña y otra vez arriba del contenido.
3. **Cada control arrastra su propio párrafo.** `<strong>` + `<small>` en cada
   fila, más tarjetas que no son controles sino avisos.
4. **Máquina central e Historial del número no son "configurar a Blacky":** son
   infraestructura del número y de la PC, pero ocupaban dos pasos del mismo
   camino que la personalidad del bot.

No hay ningún campo numérico ni slider: los "números" que se ven son los pasos y
el "Versión N" del header.

## La decisión

Opción **B** de las tres que se propusieron: reagrupar a tres secciones + toda la
limpieza visual. (A era limpieza sin mover nada; C era una sola página con
scroll, descartada porque con 8 textareas queda larguísima y se pierde el "dónde
estoy".)

## Diseño

**Tres secciones en la nav, sin numerar:**

| id | Título | Qué junta |
|----|--------|-----------|
| `mode` | Funcionamiento | estado actual, modo test, tipo de respuesta, avisos |
| `voice` | Personalidad | identidad + tono/trato/extensión/emojis + mensajes clave |
| `rules` | Reglas y permisos | permisos, temas automáticos, contexto y reglas propias |

`identity` + `messages` se fusionan en `voice`; `capabilities` + `limits` en
`rules`. Dentro de cada sección fusionada, subtítulos livianos separan los
bloques en vez de pestañas.

**Máquina central e Historial del número** salen de la nav y pasan a un par de
accesos discretos en el pie del modal, con su propio encabezado cuando se abren.
Siguen siendo secciones con los mismos ids (`central`, `history`) porque la
bandeja abre el panel directo en `history` desde su aviso.

**Compatibilidad:** los ids viejos (`identity`, `messages`, `capabilities`,
`limits`) se mapean a los nuevos al abrir, para que ninguna entrada externa deje
el panel en blanco.

**Limpieza que acompaña:**
- Se elimina el bloque `wa-section-copy` (título duplicado + número).
- Los textos de ayuda se recortan a lo que no se deduce del control.
- El modal pasa de `1120px` a `1280px` de ancho.
- La nav pasa de `repeat(5|6, 1fr)` a tres columnas.

**Lo que NO cambia:** ningún dato, ninguna clave del `draft`, ningún endpoint. Es
sólo agrupación y presentación. El payload de guardado queda idéntico.

## Riesgo y verificación

Riesgo bajo: no se toca la forma de los datos. Se verifica con `npm run lint`,
`npm test` y una recorrida a mano por las tres secciones más central e
historial, en escritorio y en angosto.

⚠️ En paralelo hay otra sesión trabajando en `WhatsAppInboxView.jsx` (bandeja sin
autoselección + botón de volver). Este trabajo no toca ese archivo; el ajuste de
"Revisar central" para que abra la sección `central` queda pendiente hasta que
esa sesión termine.
