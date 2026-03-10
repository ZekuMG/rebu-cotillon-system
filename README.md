# 🛒 PartyManager — Rebu Cotillón POS System

## README Técnico para IAs

> **Este documento describe la arquitectura completa del sistema para que una IA pueda entender y modificar el código sin necesidad de leer cada archivo.**
> Última actualización: Marzo 2026 — **Versión 0.7.0**

---

## 1. DESCRIPCIÓN GENERAL

Sistema de Punto de Venta (POS) para una tienda de cotillón (artículos de fiesta) llamada **Rebu Cotillón**. Incluye gestión de inventario, ventas, clientes con sistema de puntos/recompensas, caja diaria, reportes, registro de actividad (logs) y motor avanzado de generación de presupuestos en PDF.

**Stack:** React 18 + Vite + Tailwind CSS + Supabase (PostgreSQL + Auth + Storage + Realtime) + Electron (escritorio)

**Repo:** `https://github.com/ZekuMG/rebu-cotillon-system`

---

## 2. ESTRUCTURA DE ARCHIVOS

Punto de Venta Rebu - Release/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/
│   │   ├── ActionLogs/
│   │   │   ├── LogAuxModals.jsx
│   │   │   ├── LogDetailModal.jsx
│   │   │   ├── LogDetailRenderer.jsx   ← Renderizado de detalles con Sabueso de Notas
│   │   │   ├── logHelpers.js           ← NUEVO: Constantes para evitar error de Vite Fast Refresh
│   │   │   ├── LogsControls.jsx
│   │   │   └── LogsTable.jsx           ← Tabla principal y export de extractRealNote()
│   │   ├── dashboard/
│   │   │   ├── DashboardControls.jsx
│   │   │   ├── KpiCards.jsx
│   │   │   ├── LowStockAlert.jsx
│   │   │   ├── PaymentBreakdown.jsx
│   │   │   ├── SalesChart.jsx
│   │   │   ├── TopRanking.jsx
│   │   │   └── index.js
│   │   ├── modals/
│   │   │   ├── BarcodeModals.jsx
│   │   │   ├── CashModals.jsx
│   │   │   ├── ClientSelectionModal.jsx
│   │   │   ├── DailyReportModal.jsx
│   │   │   ├── ExpenseModal.jsx        ← Envía 'note' explícito
│   │   │   ├── HistoryModals.jsx
│   │   │   ├── NotificationModal.jsx
│   │   │   ├── ProductModals.jsx       ← Modales crear/editar/eliminar producto
│   │   │   ├── RedemptionModal.jsx
│   │   │   ├── SaleModals.jsx
│   │   │   └── TransactionModals.jsx
│   │   ├── AppModals.jsx               ← Orquestador de todos los modales
│   │   ├── ExportPdfLayout.jsx         ← NUEVO: Motor de renderizado A4 para Presupuestos
│   │   ├── ProductImage.jsx            ← Placeholder con gradiente si no hay foto
│   │   ├── Sidebar.jsx                 ← Navegación lateral
│   │   └── TicketPrintLayout.jsx       ← ⚠️ NO TOCAR - Layout de impresión térmica 58mm
│   ├── data/
│   │   ├── seedHelpers.js
│   │   ├── seedLogs.js
│   │   └── seedTransactions.js
│   ├── hooks/
│   │   ├── useBarcodeScanner.js        ← Escucha teclado para lectoras de barras
│   │   ├── useClients.js               ← CRUD de clientes/socios
│   │   ├── useDashboardData.js         ← Cálculos del dashboard
│   │   └── useLogsFilter.js            ← Filtros del historial de logs
│   ├── supabase/
│   │   └── client.js                   ← Configuración Supabase (credenciales hardcoded)
│   ├── utils/
│   │   ├── devGenerator.js             ← Generador de datos de prueba
│   │   ├── helpers.js                  ← NUEVO: Funciones compartidas + isTestRecord (Filtro Global)
│   │   └── storage.js                  ← Upload/delete de imágenes en Supabase Storage
│   ├── views/                          ← Vistas principales (una por sección)
│   │   ├── BulkEditorView.jsx          ← NUEVO: Editor Masivo y Asistente de Exportación PDF
│   │   ├── CategoryManagerView.jsx     ← ABM categorías
│   │   ├── ClientsView.jsx             ← Gestión de socios (Buscador + Select de Ordenamiento integrados)
│   │   ├── DashboardView.jsx           ← Panel de métricas
│   │   ├── HistoryView.jsx             ← Historial de ventas
│   │   ├── InventoryView.jsx           ← Catálogo con grid/lista + panel lateral
│   │   ├── LogsView.jsx                ← Registro de actividad
│   │   ├── POSView.jsx                 ← ⭐ PUNTO DE VENTA PRINCIPAL
│   │   ├── ReportsHistoryView.jsx      ← Reportes de cierres de caja
│   │   └── RewardsView.jsx            ← Gestión de recompensas canjeables
│   ├── App.css
│   ├── App.jsx                         ← ⚠️ LÓGICA PRINCIPAL (estados globales, handlers, addLog)
│   ├── data.js                         ← Constantes (PAYMENT_METHODS, etc.)
│   ├── index.css                       ← Estilos Tailwind + estilos de impresión A4/58mm
│   └── main.jsx                        ← Entry point React
├── electron-main.cjs                   ← Entry point Electron
├── index.html
├── package.json
└── vite.config.js

---

## 3. ARQUITECTURA Y FLUJO DE DATOS

### Patrón: "God Component" centralizado

`App.jsx` es el componente raíz que contiene **TODA** la lógica de negocio:

- **Todos los estados globales** (inventory, cart, clients, logs, rewards, exportPdfData, etc.)
- **Todos los handlers** (addToCart, handleCheckout, saveEditProduct, handleExportProducts, etc.)
- **fetchCloudData()** — Carga inicial de TODOS los datos desde Supabase
- **addLog()** — Registra cada acción en la tabla `logs` (con inteligencia de notas).

Las **views** (`POSView`, `InventoryView`, etc.) son componentes de presentación que reciben datos y callbacks por props desde `App.jsx`.

Los **modales** están en `components/modals/` y se orquestan desde `AppModals.jsx`.

### Sistema de Impresión Dual (CSS Print Media)
El sistema maneja dos flujos de impresión totalmente distintos controlados por CSS (`print:hidden` vs `print:block`):
1. **Ticket Térmico (58mm):** Se ejecuta al vender. Utiliza `TicketPrintLayout.jsx`.
2. **Documento A4 (Presupuesto PDF):** Se ejecuta desde `BulkEditorView` o `LogsView`. Utiliza `ExportPdfLayout.jsx`.

### Flujo de datos simplificado

Supabase DB ──fetchCloudData()──→ App.jsx (estados) ──props──→ Views/Modales
                                      ↑                              │
                                      └──── handlers ←──── eventos ──┘

### Sincronización en tiempo real

- **Carga inicial:** `fetchCloudData(true)` con spinner
- **Re-sync al volver a la app:** `visibilitychange` → `fetchCloudData(false)` sin spinner
- **Cooldown de 15s** para evitar re-syncs del file picker
- **Realtime:** Supabase channels para `register_state` y `cash_closures`
- **NO hay listener de `focus`** (causaba bugs con diálogos nativos del SO)

---

## 4. BASE DE DATOS (Supabase PostgreSQL)

### Tablas principales

| Tabla | Descripción | Campos clave |
|-------|-------------|-------------|
| `products` | Inventario de productos | `id`, `title`, `price`, `purchasePrice`, `stock`, `category`, `barcode`, `image`, `product_type` |
| `clients` | Socios del programa de puntos | `id`, `name`, `member_number`, `phone`, `points` |
| `sales` | Encabezado de ventas | `id`, `client_id`, `total`, `payment_method`, `installments`, `created_at` |
| `sale_items` | Detalle de items por venta | `id`, `sale_id`, `product_id`, `quantity`, `price` |
| `categories` | Categorías de productos | `id`, `name` |
| `logs` | Registro de actividad | `id`, `action`, `details` (JSONB), `reason`, `user_name`, `created_at` |
| `expenses` | Gastos registrados | `id`, `description`, `amount`, `created_at` |
| `rewards` | Recompensas canjeables | `id`, `title`, `points_cost`, `stock` |
| `register_state` | Estado de la caja (1 fila) | `id=1`, `is_open`, `opening_balance`, `closing_time` |
| `cash_closures` | Cierres de caja históricos | Muchos campos de resumen |

### Campo `product_type`

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'quantity';

Valores posibles: `'quantity'` (unidades) o `'weight'` (gramos).

### Supabase Storage

**Bucket:** `product-images` (público)
- File size limit: 5MB
- MIME types: image/jpeg, image/png, image/webp, image/gif
- 3 policies: INSERT (anon), SELECT (anon), DELETE (anon)

Las imágenes se suben vía `src/utils/storage.js` y se almacena solo la URL pública en el campo `image` de `products`.

---

## 5. SISTEMA DE PRODUCTOS

### Tipos de producto

El sistema soporta **2 tipos** de productos que coexisten:

#### Tipo CANTIDAD (`product_type: 'quantity'`)
- Stock: unidades enteras (ej: 50 unidades)
- Precio: por unidad (ej: $500)
- Costo: por unidad (ej: $300)
- POS: click agrega 1 unidad, botones +/-
- Inventario: "50 u."

#### Tipo PESO (`product_type: 'weight'`)
- Stock: almacenado internamente en **gramos** (ej: 1500 = 1.5kg)
- Precio: almacenado internamente en **$/gramo** (ej: 10 = $10/g)
- Costo: almacenado internamente en **$/gramo**
- **UI muestra todo en $/kg** — la conversión ×1000 se hace en los modales y vistas
- POS: click abre mini-modal para ingresar gramos, botones rápidos (50g, 100g, 250g, 500g, 1kg)
- Inventario: "1.5kg" o "500g"
- Semáforo stock: crítico <100g, alerta <500g (vs ≤5 y ≤10 para cantidad)

### Conversión precio en modales (ProductModals.jsx)

**Al CREAR:** El usuario ingresa en $/kg → el modal divide por 1000 antes de guardar en DB.
**Al EDITAR:** El precio viene de DB en $/g → el modal multiplica ×1000 para mostrar → al guardar divide ×1000.
**Al MOSTRAR (POS/Inventario):** Se usa `getPricePerKg(price)` que multiplica ×1000 y formatea.

---

## 6. FLUJO DE VENTA (POSView + App.jsx)

### Productos por cantidad
1. Click en producto → `addToCart(product)` → agrega con quantity=1 o incrementa
2. Botones +/- en carrito → `updateCartItemQty(id, newQty)`
3. Seleccionar medio de pago → `selectedPayment`
4. Click COBRAR → `handlePreCheckout()` → Verifica si hay socio asignado
5. Si no hay socio → Modal "¿Asignar Socio?" → "Consumidor Final" o buscar
6. `handleCheckout()` → Descuenta stock, guarda en `sales` + `sale_items`, suma puntos al socio, addLog()

### Productos por peso
1. Click en producto → Abre `WeightInputModal`
2. Input de gramos + botones rápidos → validación contra stock disponible
3. "Agregar Xg" → `addToCart(product, grams)` → quantity = gramos
4. En carrito: click en badge de gramos → input inline editable
5. Checkout: `price × quantity` funciona igual (price es $/g, quantity es gramos)

---

## 7. FLUJO DE EXPORTACIÓN A PDF Y "TIME MACHINE"

Se implementó un sistema para generar presupuestos profesionales y reportes internos:

1. **Creación:** Desde `BulkEditorView`, el usuario selecciona productos y configura el documento (Cliente, Evento, Ocultar/Mostrar columnas). Permite agregar productos "Extra" temporales y ajustar cantidades al vuelo.
2. **Renderizado (`ExportPdfLayout.jsx`):** Construye una vista A4 estéticamente atractiva (híbrido tipográfico Calibri + Sans), con "cebrado" en tablas. Detecta stock en 0 y estampa alertas de **"AGOTADO - PREGUNTAR"**. Si es por peso y múltiplo de 1000, imprime "Kg".
3. **El Snapshot:** Al imprimir, `App.jsx` inyecta en la tabla `logs` (bajo la acción `Exportación PDF`) una copia exacta (*snapshot*) de la configuración, títulos y precios de ese preciso instante.
4. **Time Machine (`LogsView`):** Si un administrador entra a la bitácora y abre ese Log, verá un botón para "Volver a Descargar PDF". El sistema inyecta el snapshot viejo, recreando el PDF idéntico sin que lo afecte la inflación o los cambios actuales de inventario.

---

## 8. SISTEMA DE PUNTOS Y RECOMPENSAS

- Los socios (`clients`) acumulan puntos: **1 punto por cada $500 de compra** (Actualizado v0.6)
- `pointsToEarn = Math.floor(total / 500)`
- Las recompensas (`rewards`) tienen un costo en puntos y stock propio
- Al canjear: se descuentan puntos del socio, se agrega al carrito como `isReward: true` con `price: 0`
- Items de recompensa no se pueden modificar en el carrito (botones +/- deshabilitados)

---

## 9. SISTEMA DE CAJA

- **Estado:** `register_state` tabla con 1 fila (`id=1`)
- **Abrir caja:** Define `opening_balance` y `is_open = true`
- **Cerrar caja:** Genera un registro en `cash_closures` con resumen completo (ventas, gastos, métodos de pago, items vendidos, etc.)
- **Realtime:** Cambios en `register_state` se reflejan instantáneamente en todos los clientes conectados

---

## 10. ROLES Y PERMISOS

Dos roles: `admin` y `vendedor`

| Funcionalidad | Admin | Vendedor |
|---------------|-------|----------|
| Ver POS y vender | ✅ | ✅ |
| Ver inventario | ✅ | ✅ (solo lectura) |
| Crear/editar/eliminar productos | ✅ | ❌ |
| Gestionar categorías | ✅ | ❌ |
| Gestión Masiva y PDFs | ✅ | ❌ |
| Ver dashboard completo | ✅ | ✅ (parcial) |
| Abrir/cerrar caja | ✅ | ✅ |
| Ver logs | ✅ | ✅ |

El campo `currentUser.role` controla los permisos en UI (botones ocultos/deshabilitados).

---

## 11. ARCHIVOS CLAVE Y QUÉ HACEN

### `App.jsx` (~1300+ líneas)
El componente más importante. Contiene:
- **~40 estados** con `useState` (inventory, cart, clients, logs, exportPdfData, etc.)
- **fetchCloudData()** — Promise.allSettled de 9 queries a Supabase. Posee Auto-Sanación de items vacíos en ventas históricas.
- **addLog(action, details, defaultReason)** — Registra actividad en Supabase. *Posee inteligencia de notas*: detecta si en los `details` viaja alguna nota (`description`, `note`, `extraInfo`) y pisa automáticamente los textos aburridos (ej. "Salida de dinero") guardando la nota real del usuario en la BD.

### `LogsTable.jsx` & `LogDetailRenderer.jsx`
- **`extractRealNote(log)`**: Funciona como un **"Sabueso de Notas"**. Rastrea en la base de datos (tanto en la columna `reason` como dentro del JSON `details`) intentando rescatar la nota real ingresada por el usuario (ignorando los strings genéricos generados por el sistema, dándole retroactividad a registros viejos).
- Renderiza el detalle visual y contiene el botón de Reimpresión de PDFs históricos.

### `ClientsView.jsx`
- Lista de Socios. Integra un **buscador en tiempo real fusionado con un select de ordenamiento reactivo** (por id, alfabético, saldo de puntos, fecha de ingreso y última compra). Muestra de forma calculada el último movimiento de cada socio procesando las transacciones al vuelo.

### `POSView.jsx` y `InventoryView.jsx`
- Vistas Core de negocio (Catálogo con grid/lista, Carrito, Pagos, Modales Pre-Checkout).

### `TicketPrintLayout.jsx` & `ExportPdfLayout.jsx`
> ⚠️ **NO MODIFICAR** sin leer la guía de impresión en el README del repo.
- **TicketPrintLayout:** Layout para impresoras térmicas 58mm. Usa estilos inline críticos, fuente Arial bold 11px, color #000000 absoluto. Configuración `@page { margin: 0; size: 58mm auto; }`.
- **ExportPdfLayout:** Motor A4. Híbrido tipográfico, cebrado CSS y lógicas visuales dependientes de WebkitPrintColorAdjust.

---

## 12. CONVENCIONES DE CÓDIGO

- **Lenguaje UI:** Español argentino (vos, tu)
- **Formato precio:** Puntos de miles, sin decimales → $1.500
- **Modo Debug/Prueba:** Todo registro cuyo texto, detalle o motivo contenga la palabra "test" activa la función global `isTestRecord` (en `helpers.js`), la cual lo oculta de las métricas oficiales y lo enmarca con alertas.
- **Manejo de Notas en Logs:** Para evitar que el sistema pise notas personalizadas con textos genéricos (ej: "Salida de dinero"), `App.jsx` detecta la nota real, y `extractRealNote()` en `LogsTable.jsx` prioriza visualizar lo que el usuario verdaderamente escribió.
- **Notificaciones:** `showNotification(type, title, message)` — type: success/error/warning
- **Supabase client:** Credenciales hardcoded en `supabase/client.js` (no .env)
- **Electron:** Custom fetch header `Origin: http://localhost` para evitar bloqueos CORS

---

## 13. SUPABASE CONFIG

URL: https://rwqqjthrvweubksrlqzy.supabase.co
Key: eyJhbGciOiJIUzI1NiIs... (anon key, hardcoded en client.js)

El cliente tiene configuración especial para Electron:
- `detectSessionInUrl: false`
- `persistSession: true`
- Custom fetch que fuerza `Origin: http://localhost`

---

## 14. BUGS CONOCIDOS Y SOLUCIONES APLICADAS

| Bug | Causa raíz | Solución |
|-----|-----------|----------|
| Imagen no se guardaba al subir | Closure obsoleta en FileReader.onloadend | `setNewItem(prev => ({...prev}))` funcional |
| saveEditProduct no persistía imagen | Payload no incluía `image` ni `purchasePrice` | Agregados al payload |
| File picker cerraba modales | Listeners `focus` + `visibilitychange` disparaban fetchCloudData | Quitado listener `focus`, cooldown 15s en `visibilitychange` |
| Spinner tapaba modales al re-sync | `setIsCloudLoading(true)` siempre | `fetchCloudData(showSpinner=false)` para re-syncs |
| Crear categoría daba 409 Conflict | Secuencia de `categories.id` desincronizada | `SELECT setval(pg_get_serial_sequence(...))` |
| Notas de gastos o socios ocultas por textos genéricos | Supabase recibía "Salida de dinero" en vez de la nota real | Lógica de detección en `addLog` + "Sabueso" (`extractRealNote`) en `LogsTable.jsx` |
| Edición de Venta fallaba con IDs no UUID | Supabase rechazaba IDs que no fueran tipo UUID válidos | Filtro RegEx UUID en `handleSaveEditedTransaction` para evitar crash |
| Vite Fast Refresh Roto (Pantalla roja) | Exportar componentes React y Funciones normales en un mismo archivo | Lógica estática/JS extraída a archivos puros (`utils/helpers.js` y `logHelpers.js`) |

---

## 15. CÓMO AGREGAR UNA NUEVA FUNCIONALIDAD

1. **Si requiere datos nuevos:** Agregar columna en Supabase SQL Editor con `DEFAULT` para no romper existentes
2. **Si es lógica de negocio:** Agregar handler en `App.jsx`, pasarlo como prop a la vista
3. **Si es UI en una vista:** Modificar el archivo en `views/`
4. **Si es un modal nuevo:** Crear en `components/modals/`, agregar estado en `App.jsx`, renderizar en `AppModals.jsx`
5. **Si necesita helper:** Agregar en `utils/helpers.js` y exportar (No mezclar con componentes).
6. **Siempre:** Agregar `addLog()` para registrar la acción

---

## 16. COMANDOS

# Desarrollo web
npm run dev

# Build producción
npm run build

# Electron (desarrollo)
npm run electron:dev

# Electron (build)
npm run electron:build