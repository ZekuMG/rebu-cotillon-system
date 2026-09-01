# Casa Alberto: piso de confianza y bultos honestos

**Fecha:** 1-sep-2026
**Estado:** diseño aprobado (Enfoque 1), pendiente de plan de implementación
**Alcance:** apartado Casa Alberto del Editor Masivo (control de costos de proveedor)

---

## 1. El problema, medido

Contra producción el 1-sep-2026:

| | |
|---|---|
| Productos activos | 2.872 |
| Con enlace a Casa Alberto | 499 (17%) |
| De esos, en estado `ignored` | **352 → 70,5%** |
| `approved` | 90 |
| `price_down` | 52 |
| `changed` | 5 |

Siete de cada diez enlaces terminaron en "Ignorar". No es que los precios no cambien:
**el chequeo produce datos falsos y "Ignorar" es el único botón que los saca de encima.**

Diferencia entre el costo estimado y el costo Rebu, por estado:

| Estado | n | Dif. promedio | Dif. mínima | Dif. máxima |
|---|---|---|---|---|
| `ignored` | 352 | +$617 | −$9.379 | **+$50.868** |
| `approved` | 90 | $0 | −$11 | $0 |
| `price_down` | 52 | −$2.283 | −$7.017 | −$113 |
| `changed` | 5 | +$9 | +$4 | +$26 |

El bucket `approved` está impecable. El bucket `ignored` tiene diferencias absurdas:
no son cambios de precio, son cuentas mal hechas.

---

## 2. Causas raíz

### Causa A — nadie comprueba que la página leída sea la del producto

`electron-main.cjs`, lector de precio de proveedor (~líneas 2063-2145).

El lector puntúa a cada candidato:

```js
if (expectedId && String(candidate.casaAlbertoId) === String(expectedId)) score += 100;
if (expectedDigits && codeDigits && (codeDigits === expectedDigits || ...))   score += 80;
if (expectedTitleNorm && titleNorm.includes(expectedTitleNorm.slice(0, 18)))  score += 20;
```

…y después **no usa el puntaje para nada**. Ordena por score, toma `candidates[0]` y
devuelve `status: 'found'` aunque haya sacado **0**.

Agrava el cuadro que, cuando la página no es la del producto, cada lectura cae a un
valor por defecto tomado del documento entero:

```js
titleNode = (container?.querySelector(...)) || document.querySelector('h1, h2, ...');
priceText = ... || containerText.match(/\$\s*[0-9.]+(?:,[0-9]{1,2})?/);
```

En la página del carrito eso da `foundTitle = "Mi Carrito"` y, como precio, **el total
del carrito**.

Del lado de la app, `BulkEditorView.jsx:1979` sólo exige:

```js
if (result?.status === 'found' && Number(result.supplierPrice) > 0) { ... }
```

El puntaje **ni siquiera viaja** en la respuesta del chequeo de precios (sí viaja en el
buscador de fotos, que devuelve `score`, `matchQuality` y `titleSimilarity`).
La app no tiene con qué filtrar aunque quisiera.

**Evidencia:** 74 de los 499 enlaces (15%) tienen `foundTitle = "Mi Carrito"`.
Todos leyeron el total del carrito como si fuera el precio del producto.

Esta misma causa explica los enlaces "parecidos pero distintos"
(`COCO RALLADO ALZOL FUCSIA xkg` ↔ `Coco rallado alzol rosa x1/2 kg`): con score 20,
o incluso 0, entran igual.

### Causa B — el detector de bulto se equivoca para los dos lados

`src/views/BulkEditorView.jsx:105`, `detectCasaAlbertoUnitDivisor`.

```js
const matches = [...text.matchAll(/(?:^|[\s._-])x\s*(\d{1,4})(?:\s*(?:u|un|...))?(?=$|[\s._-])/gi)]
  .map(m => Number(m[1])).filter(v => v > 1 && v < 10000);
return matches.length ? matches[matches.length - 1] : 1;
```

Dos defectos de fondo:

1. **Exige que la `x` esté precedida de espacio, punto, guion o principio de texto.**
   Casa Alberto escribe pegado: `bulto8x500grs`, `packx10u.`, `)x10u.`, `gatox6`.
   Ninguno matchea → divisor 1 → el costo estimado sale multiplicado por 6, 8, 10 o 12.
2. **Se queda con la ÚLTIMA coincidencia** y no distingue una cantidad de una medida.
   Las dimensiones y los largos viven al final del título, así que ganan siempre.

Medido contra los títulos reales (18 casos de referencia leídos a mano):
**el detector actual acierta 8 de 18.**

| Título real en Casa Alberto | Correcto | Detector actual |
|---|---|---|
| `(bulto 6 x kg.)` | 6 | **1** |
| `(bulto8x500grs)` | 8 | **1** |
| `(bulto 12unidx400gr)` | 12 | **1** |
| `(bulto x10kg)` | 10 | **1** |
| `(packx10u.)` | 10 | **1** |
| `(10x10x5cm)x10u.morroni` | 10 | **1** |
| `Careta plastica gatox6 3298` | 6 | **1** |
| `Durazno ... cumana x820 grs` | 1 | **820** ← gramos |
| `Frasco cremor tartaro pastelar x150 gr.` | 1 | **150** ← gramos |
| `Cinta doble faz 18mm x 10 mts.` | 1 | **10** ← metros |
| `Cortina metalizada (1.00 x2.00 mts) x1` | 1 | **2** ← metros |
| `Caja ... (25 x17 x9cm) x25 medoro` | 25 | **17** ← centímetros |

Los falsos positivos son los peores: dividir por metros o por centímetros hace ver el
costo **más barato de lo que es**, y eso se aprueba sin que nadie lo note.

---

## 3. Qué NO entra en este trabajo

- **No** se amplía la cobertura a los 2.373 productos sin enlace. Enlazar más con un
  15% de basura sólo agranda la pila de "Ignorar". Va después, y como proyecto aparte.
- **No** se rediseña la pantalla ni se tocan las tarjetas más allá de mostrar el pack
  detectado y el estado nuevo.
- **No** se toca el cálculo de margen ni la fórmula de venta sugerida.
- **No** se corrigen los 27 productos con costo 0 ni los 9 con costo menor a $100.
  Son reales pero de otra naturaleza; quedan anotados.

---

## 4. Diseño

Cuatro piezas. Cada una se puede entender y probar sola.

### Pieza 1 — `src/utils/casaAlbertoUnits.js` (módulo nuevo)

Hoy la detección de unidades es una función privada dentro de un archivo de vista de
5.516 líneas: no se puede probar sin montar todo el editor. Sale a un módulo propio con
una sola responsabilidad.

**Interfaz:**

```js
detectCasaAlbertoUnitDivisor(supplierTitle) -> {
  divisor: number | null,   // null = ambiguo, no adivinar
  rule: 'bulto' | 'xNu' | 'xN' | 'sin-senal' | 'sin-titulo' | 'ambiguo',
  confidence: 'alta' | 'media' | 'baja'
}
```

**Reglas, en orden de fuerza.** El detector junta candidatos, se queda con los del peso
más alto, y si dentro de ese peso hay dos números distintos **devuelve `null` en vez de
elegir**.

0. **Descartar paréntesis que son sólo dimensiones** antes de mirar nada:
   `(25 x17 x9cm)`, `(1.00 x2.00 mts)`, `(21cm)`, `(10x10x5cm)`.
1. **(peso 3) Bulto con multiplicación real.** Una palabra de bulto
   (`bulto|pack|packing|display|blister|bolson|plancha|tira`) **más una `x`**:
   - `KW <N> [unid] x` → N — cubre `bulto 6 x kg.`, `bulto8x500grs`, `bulto 12unidx400gr`
   - `KW x <N>` → N — cubre `bulto x10kg`, `packx10u.`

   La palabra sola **no alcanza**: `Blister 100 pirotines varios modelos x1` describe el
   contenido del blister, y Rebu vende el blister entero (divisor 1). Verificado contra
   la ficha Rebu de ese producto.
2. **(peso 2) Unidades explícitas.** `x <N> u|un|uni|unid|unidad|unidades|pz` → N.
   Cubre `x10u.`, `(packx10u.)`, `mundox10u.m`.
3. **(peso 1) `xN` suelto**, con dos guardas:
   - **No** si el número viene seguido de una unidad de medida
     (`cm mm mt mts m kg kgs g gr grs l lt lts ml cc "`). Mata `x820 grs`, `x 10 mts`, `12"`.
   - **No** si hay un dígito **pegado** inmediatamente antes de la `x` (`10x10x5` = dimensiones).
     Pegado, no separado: `nº 8 x5`, `t260 x50` y `ctadg025 x25` **sí** son cantidades.
   - **No** si el número es decimal (`x2.00`).

**Trampa registrada:** la pulgada `"` no puede llevar `\b` en la expresión de medida —
no es carácter de palabra, y con `\b` el título `reflex 12" azul x10` dejaba de contar
las pulgadas como medida y el `12` se colaba como cantidad.

**Validación del prototipo, ya corrida contra los datos reales:**

| | Detector actual | Propuesto |
|---|---|---|
| Casos de referencia (leídos a mano) | 8/18 | **18/18** |
| Sobre los 499 enlaces reales | — | 476 igual, **23 corregidos**, 0 ambiguos |

Los 23 cambios se revisaron uno por uno y los 23 son correcciones, no regresiones.

### Pieza 2 — piso de confianza en el lector (`electron-main.cjs`)

Dos guardas independientes, la primera muy barata:

1. **La URL resuelta tiene que ser una ficha de producto.** Si no matchea
   `pedido/detalle(_mobile)?.php?...idp=<n>`, se corta ahí. Esa sola guarda mata la
   clase entera de "Mi Carrito", sin depender de puntajes.
2. **Identidad probada.** Se acepta `found` sólo si el `idp` de la página coincide con
   el esperado **o** coincide el código de proveedor. El parecido de título (+20)
   **no alcanza por sí solo** para dar por bueno un precio.

Cuando no se cumple, se devuelve un estado nuevo en vez de un precio inventado:

```js
{ status: 'mismatch', reason: 'url_no_es_ficha' | 'id_distinto' | 'sin_identidad',
  expectedId, seenId, foundTitle, url }
```

Y en todos los casos la respuesta pasa a incluir `score` y `matchReason`, para que la
app pueda decidir y para poder auditar después.

**Regla:** ante la duda no se guarda precio. Un dato faltante es recuperable;
un costo falso aprobado, no.

### Pieza 3 — estado `broken_link`, para que "Ignorar" deje de ser el tacho

`src/utils/supplierPriceReview.js`:

- Nuevo estado `broken_link`, dentro de `ATTENTION_STATUSES`.
- En `REVIEW_STATUS_PRIORITY` va **arriba de `changed`** (un enlace roto se atiende
  antes que un cambio de precio, porque el cambio de precio de un enlace roto es mentira).
- `matchesSupplierPriceFilter` lo reconoce; nuevo filtro "Enlace roto" con su contador
  en la columna de la izquierda.
- En la tarjeta, un enlace roto **no muestra costo estimado ni venta sugerida** (no hay
  dato del que salgan) y ofrece las acciones que ya existen: *Revisar enlace*,
  *Desvincular*, *Fuente*.

Con esto, los cuatro significados que hoy conviven en "Ignorar" se separan:
precio subió (`changed`), precio bajó (`price_down`), enlace roto (`broken_link`),
y "no me interesa este producto" (`ignored`, que recupera su significado real).

### Pieza 4 — reclasificar lo ya guardado (sin volver a scrapear)

Los títulos de Casa Alberto están guardados en `supplier_links.casa_alberto.foundTitle`,
así que las dos correcciones se pueden aplicar sobre los 499 **sin entrar a la web**.

Un script en `scripts/` que:

1. Marca `broken_link` todo lo que tenga `foundTitle = "Mi Carrito"` o una `productUrl`
   que no sea ficha de producto → esperado: los 74.
2. Recalcula el divisor con la Pieza 1 y, donde cambie, recalcula `estimatedCost` y
   deja el producto en `unchecked` para que se vuelva a chequear con la cuenta correcta
   → esperado: los 23.
3. Deja intacto todo lo demás. Un `ignored` que sea una decisión real sigue siendo
   `ignored`.

**Corre primero en seco y emite un informe.** Escribe a producción sólo con OK explícito.

---

## 5. Forma del dato

Se agregan campos a `supplier_links.casa_alberto.price_tracking`. No hace falta migración:
verificado que `apply_supplier_product_updates_batch` guarda con
`supplier_links = input_rows.supplier_links` — reemplazo entero, **sin lista blanca de
claves**, así que los campos nuevos persisten.

| Campo | Para qué |
|---|---|
| `unitDivisorRule` | qué regla decidió el divisor (`bulto`, `xNu`, `xN`, `sin-senal`) |
| `unitDivisorConfidence` | `alta` / `media` / `baja` |
| `matchScore` | puntaje con el que se aceptó la lectura |
| `matchReason` | `idp` / `codigo` / `mismatch:<motivo>` |

Guardar **por qué** se decidió es lo que permite recalcular más adelante sin volver a
scrapear, cuando una regla mejore. Es la idea que se le robó al Enfoque 3.

---

## 6. Errores y casos límite

| Situación | Comportamiento |
|---|---|
| Página no es ficha de producto | `mismatch`, no se guarda precio, producto a `broken_link` |
| `idp` distinto al esperado | ídem |
| Sólo coincide el título | `mismatch` — el parecido no prueba identidad |
| Divisor ambiguo (dos números con la misma fuerza) | `divisor: null` → la tarjeta pide "revisar unidades", no se estima costo |
| Sin señal de bulto en el título | divisor 1 con confianza alta (es el caso normal) |
| Sesión de Casa Alberto caída | sigue igual que hoy: `login_required` |

---

## 7. Pruebas

Ya existe superficie donde apoyarse: `tests/supplier-price-review.test.js` y
`tests/data-integrity.test.js`.

- **`tests/casa-alberto-units.test.js` (nuevo).** Los 18 casos de referencia como tabla,
  con el título real y el divisor esperado. Es el test que define la Pieza 1.
- **`tests/supplier-price-review.test.js` (ampliar).** `broken_link` cae en atención,
  ordena por encima de `changed`, y el filtro lo encuentra.
- **Piso de confianza.** Probar la función de decisión con entradas fabricadas
  (página de carrito, `idp` distinto, sólo título parecido, `idp` correcto).
  Se prueba la decisión, no el scraping.
- **Regresión.** `npm run test:regression` (331 tests) tiene que seguir en verde.

**Trampa de plataforma registrada:** los heredoc de bash de este entorno se comen un
nivel de barra invertida. Las expresiones regulares hay que escribirlas con la
herramienta de archivos, nunca por heredoc: `'x\\s*'` llegó al archivo como `'x\s*'` y
dejó todas las regex construidas por concatenación silenciosamente rotas.

---

## 8. Orden de entrega

| Tanda | Qué | ¿Rebuild + actualizar las 3 PCs? |
|---|---|---|
| **1** | Pieza 4 en seco: informe de qué se reclasificaría (74 + 23). Aplicar con OK. | **No** — sólo datos |
| **2** | Pieza 1 (módulo + tests) y Pieza 3 (estado `broken_link` + filtro + tarjeta) | Sí |
| **3** | Pieza 2 (piso de confianza en el lector) | Sí |

La tanda 1 da resultado visible sin tocar el instalador. Las tandas 2 y 3 viajan juntas
en un solo build.

---

## 9. Riesgos y trampas

- 🪤 **Hay una copia entera del programa desactualizada.** `hotfix-build-v1.2.32/` tiene
  su propio `electron-main.cjs` (2.372 líneas contra 2.700 en la raíz), su
  `productLifecycle.js` (435 contra 467) y su `supplier-price-report`. **Los tres
  difieren.** Antes de tocar el lector hay que confirmar contra qué árbol buildea el
  instalador, o el arreglo se hace y no pasa nada.
- ⚠️ **La tanda 1 escribe en producción.** Requiere OK explícito y corre primero en seco.
- ⚠️ **Recalcular el divisor mueve el costo estimado**, y con eso el estado derivado
  (`changed` / `price_down`). Por eso los 23 corregidos vuelven a `unchecked` en vez de
  quedar con un estado calculado sobre la cuenta vieja.
- 🪤 **El cartel de error sigue mintiendo.** `App.jsx:14194` traduce cualquier `42501` a
  "tu sesión expiró". Ya costó una investigación entera el 1-sep. No es parte de este
  trabajo, pero conviene arreglarlo en el mismo build de la tanda 2.

---

## 10. Cómo se sabe que salió bien

- El detector pasa los 18 casos de referencia.
- Los 74 de "Mi Carrito" dejan de estar en `ignored` y aparecen como `broken_link`.
- Después de un chequeo completo, el bucket `ignored` baja del 70% actual a algo
  parecido a lo que realmente se decidió ignorar.
- Ningún producto queda con costo estimado sin que se pueda decir con qué regla y con
  qué puntaje se llegó a él.
