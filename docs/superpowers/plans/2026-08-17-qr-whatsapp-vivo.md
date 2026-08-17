# QR de WhatsApp en vivo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el QR aparezca apenas cambia, muestre cuántos segundos tiene, se renueve solo a los 40 s, y que el botón "Generar nuevo QR" realmente genere uno.

**Architecture:** El bot recuerda el último código y cuándo apareció, y expone `generated_at` + `age_seconds`. La app ya sondea cada 3 s: usa esos campos para dibujar un contador vivo, descartar códigos podridos y forzar la renovación. Forzar = `evolution.restart()`, con candado de 20 s.

**Tech Stack:** Node 20 ESM + `node --test` (bot), React 18 + Vite + Electron (app).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-17-qr-whatsapp-vivo-design.md`
- Umbrales exactos: aviso **15 s**, forzado **40 s**, descarte de QR viejo **60 s**, candado de reinicio **20 s**.
- `age_seconds` lo calcula **el bot** (las PCs remotas pueden tener la hora corrida).
- El bot debe quedar **compatible hacia atrás**: sólo agregar campos.
- El proyecto del bot **no tiene git** → copiar el archivo antes de editarlo.
- Versión: subir a **1.2.20** en `package.json` y `package-lock.json` sólo al final.

---

### Task 1: El bot informa la edad del QR

**Files:**
- Modify: `H:\...\Rebu Cotillon - Bot Whatsapp\src\operator-service.js` (~245 y 1375-1425)
- Test: `H:\...\Rebu Cotillon - Bot Whatsapp\test\node-bot.test.js`

**Interfaces:**
- Produces: `connection(action)` devuelve `qr` con `generated_at` (ISO) y `age_seconds` (entero ≥ 0).

- [ ] **Step 1: Escribir el test que falla**

```js
test('connection informa la edad del QR y la reinicia al cambiar el codigo', async () => {
  let code = 'AAA';
  const operator = createOperatorService({
    supabase: {},
    evolution: {
      connectionState: async () => ({ instance: { state: 'connecting' } }),
      connect: async () => ({ code, base64: 'x' }),
      restart: async () => ({}),
    },
  });

  const first = await operator.connection();
  assert.equal(first.qr.age_seconds, 0);
  assert.ok(first.qr.generated_at);

  const second = await operator.connection();
  assert.equal(second.qr.generated_at, first.qr.generated_at);

  code = 'BBB';
  const third = await operator.connection();
  assert.notEqual(third.qr.generated_at, first.qr.generated_at);
  assert.equal(third.qr.age_seconds, 0);
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test test/node-bot.test.js` (desde la carpeta del bot)
Expected: FAIL — `first.qr.age_seconds` es `undefined`.

- [ ] **Step 3: Implementar**

Dentro de `createOperatorService`, junto a los otros caches (~línea 245):

```js
  // El QR de Baileys no trae timestamp. Sin esto la pantalla no puede
  // distinguir un codigo recien nacido de uno vencido hace minutos.
  let lastQrCode = null;
  let lastQrSeenAt = null;
  let lastQrForcedAt = 0;
```

En `connection()`, reemplazar el bloque que arma `qr` y el `return`:

```js
      let qr = null;
      if (!connected && !evolutionError) {
        try {
          qr = await evolution.connect();
        } catch (error) {
          remember(error);
        }
      }

      if (connected) {
        lastQrCode = null;
        lastQrSeenAt = null;
      } else if (qr) {
        const code = String(qr.code || qr?.qrcode?.code || '');
        if (code && code !== lastQrCode) {
          lastQrCode = code;
          lastQrSeenAt = Date.now();
        }
        if (!lastQrSeenAt) lastQrSeenAt = Date.now();
        qr = {
          ...qr,
          generated_at: new Date(lastQrSeenAt).toISOString(),
          age_seconds: Math.max(0, Math.round((Date.now() - lastQrSeenAt) / 1000)),
        };
      }

      return {
        state,
        qr,
        connected,
        evolution_available: !evolutionError,
        evolution_error: evolutionError,
      };
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test test/node-bot.test.js`
Expected: PASS.

---

### Task 2: El botón "Generar nuevo QR" fuerza de verdad

**Files:**
- Modify: `H:\...\Rebu Cotillon - Bot Whatsapp\src\operator-service.js:1386-1392`
- Test: `H:\...\Rebu Cotillon - Bot Whatsapp\test\node-bot.test.js`

**Interfaces:**
- Consumes: `lastQrForcedAt` de la Task 1.
- Produces: `connection('qr')` llama `evolution.restart()` como mucho una vez cada 20 s.

- [ ] **Step 1: Escribir el test que falla**

```js
test('la accion qr reinicia Evolution con candado de 20s', async () => {
  let restarts = 0;
  const operator = createOperatorService({
    supabase: {},
    evolution: {
      connectionState: async () => ({ instance: { state: 'connecting' } }),
      connect: async () => ({ code: 'AAA', base64: 'x' }),
      restart: async () => { restarts += 1; return {}; },
    },
  });

  await operator.connection('qr');
  assert.equal(restarts, 1);

  await operator.connection('qr');
  assert.equal(restarts, 1, 'el candado evita el segundo reinicio');

  await operator.connection('status');
  assert.equal(restarts, 1, 'un sondeo normal nunca reinicia');
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test test/node-bot.test.js`
Expected: FAIL — `restarts` es 0 (hoy `'qr'` no hace nada).

- [ ] **Step 3: Implementar**

Reemplazar el bloque de acciones:

```js
      if (action === 'logout') {
        if (typeof evolution.logout === 'function') {
          await evolution.logout().catch(remember);
        }
        lastQrCode = null;
        lastQrSeenAt = null;
      } else if (action === 'restart') {
        await evolution.restart().catch(remember);
      } else if (action === 'qr') {
        // Pedir el codigo de nuevo NO lo renueva: Evolution devuelve el vigente.
        // Renovar de verdad exige reiniciar. El candado evita dejar la conexion
        // en reinicio permanente, que impide completar el escaneo.
        if (Date.now() - lastQrForcedAt >= 20000) {
          lastQrForcedAt = Date.now();
          await evolution.restart().catch(remember);
          lastQrCode = null;
          lastQrSeenAt = null;
        }
      }
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test test/node-bot.test.js`
Expected: PASS (los dos tests).

---

### Task 3: La app muestra la edad, descarta el podrido y renueva sola

**Files:**
- Modify: `H:\...\Punto de Venta Rebu - Release\src\views\WhatsAppInboxView.jsx`
- Create: `H:\...\Punto de Venta Rebu - Release\src\utils\qrFreshness.js`
- Test: `H:\...\Punto de Venta Rebu - Release\tests\qr-freshness.test.js`

**Interfaces:**
- Consumes: `qr.age_seconds` de la Task 1.
- Produces: `qrFreshness({ ageSeconds })` → `{ level: 'fresh'|'warn'|'stale', label: string }`; constantes `QR_WARN_SECONDS`, `QR_FORCE_SECONDS`, `QR_STALE_KEEP_SECONDS`.

La lógica de umbrales va a un archivo aparte porque `WhatsAppInboxView.jsx` ya tiene más de 4000 líneas y así se puede testear sin montar React.

- [ ] **Step 1: Escribir el test que falla**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { qrFreshness, QR_WARN_SECONDS, QR_FORCE_SECONDS } = require('../src/utils/qrFreshness.js');

test('clasifica la frescura del QR por umbrales', () => {
  assert.equal(qrFreshness({ ageSeconds: 0 }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: QR_WARN_SECONDS - 1 }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: QR_WARN_SECONDS }).level, 'warn');
  assert.equal(qrFreshness({ ageSeconds: QR_FORCE_SECONDS - 1 }).level, 'warn');
  assert.equal(qrFreshness({ ageSeconds: QR_FORCE_SECONDS }).level, 'stale');
});

test('el texto dice los segundos y avisa cuando esta por vencer', () => {
  assert.match(qrFreshness({ ageSeconds: 3 }).label, /hace 3 s/);
  assert.match(qrFreshness({ ageSeconds: 20 }).label, /por vencer/);
  assert.match(qrFreshness({ ageSeconds: 99 }).label, /[Rr]enovando/);
});

test('una edad invalida se trata como recien generado', () => {
  assert.equal(qrFreshness({ ageSeconds: null }).level, 'fresh');
  assert.equal(qrFreshness({ ageSeconds: -5 }).level, 'fresh');
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/qr-freshness.test.js` (desde la carpeta de la app)
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Crear `src/utils/qrFreshness.js`**

```js
// Umbrales del QR de WhatsApp, en un solo lugar para poder moverlos.
// Medido el 17-ago-2026: el codigo puede no cambiar en 30 s, por eso
// forzar antes de los 40 s dejaria la conexion en reinicio permanente
// y el celular nunca llegaria a completar el escaneo.
const QR_WARN_SECONDS = 15;
const QR_FORCE_SECONDS = 40;
const QR_STALE_KEEP_SECONDS = 60;

const qrFreshness = ({ ageSeconds } = {}) => {
  const age = Number.isFinite(Number(ageSeconds)) && Number(ageSeconds) > 0
    ? Math.floor(Number(ageSeconds))
    : 0;

  if (age >= QR_FORCE_SECONDS) {
    return { level: 'stale', ageSeconds: age, label: 'Renovando codigo...' };
  }
  if (age >= QR_WARN_SECONDS) {
    return { level: 'warn', ageSeconds: age, label: `Generado hace ${age} s · puede estar por vencer` };
  }
  return { level: 'fresh', ageSeconds: age, label: `Generado hace ${age} s` };
};

module.exports = { qrFreshness, QR_WARN_SECONDS, QR_FORCE_SECONDS, QR_STALE_KEEP_SECONDS };
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test tests/qr-freshness.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Cablearlo en la vista**

En `WhatsAppInboxView.jsx`:

1. Importar: `import { qrFreshness, QR_FORCE_SECONDS, QR_STALE_KEEP_SECONDS } from '../utils/qrFreshness';`
2. En el efecto de sondeo (~3137), cambiar la conservación del QR viejo para que respete `QR_STALE_KEEP_SECONDS`.
3. Estado local `qrAge` que suma 1 por segundo y se reinicia cuando llega un `generated_at` distinto.
4. En el bloque del QR (~4037), poner `key={qrCode}` en el `<img>` y debajo el texto de `qrFreshness`.
5. Al cruzar `QR_FORCE_SECONDS`, llamar `whatsappOperator.connectionAction('qr')` una sola vez por código.

- [ ] **Step 6: Correr toda la regresión**

Run: `npm run test:regression`
Expected: PASS.

---

### Task 4: Versión y commit

- [ ] **Step 1:** Subir `version` a `1.2.20` en `package.json` y `package-lock.json` (los dos lugares donde figura).
- [ ] **Step 2:** `npm run test:regression` → PASS.
- [ ] **Step 3:** Commitear **sólo** los archivos de este trabajo (el repo tiene ~28 archivos de otras sesiones sin commitear; no barrerlos).
