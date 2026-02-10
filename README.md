```markdown
# 🛒 PartyManager (PartySupplyApp)

Sistema de Punto de Venta (POS) y Gestión de Inventario desarrollado en React + Vite.

## 📂 Estructura del Proyecto (Actualizada)

Esta es la estructura actual del sistema de archivos. **Importante:** Cualquier refactorización debe respetar esta jerarquía.

```text
src/
├── components/
│   ├── ActionLogs/              # Módulo refactorizado de Registros (Antes LogsView monolítico)
│   │   ├── LogAuxModals.jsx     # Generador y Borrado
│   │   ├── LogDetailModal.jsx   # Wrapper del modal
│   │   ├── LogDetailRenderer.jsx# Lógica de renderizado del detalle (Switch gigante)
│   │   ├── LogsControls.jsx     # Filtros y botones superiores
│   │   └── LogsTable.jsx        # Tabla de datos
│   │
│   ├── dashboard/               # Componentes del Dashboard
│   │   ├── DashboardControls.jsx
│   │   ├── KpiCards.jsx
│   │   ├── LowStockAlert.jsx
│   │   ├── PaymentBreakdown.jsx
│   │   ├── SalesChart.jsx
│   │   └── TopRanking.jsx
│   │
│   ├── modals/                  # Módulos individuales de Modales
│   │   ├── BarcodeModals.jsx
│   │   ├── CashModals.jsx
│   │   ├── ClientSelectionModal.jsx  # <--- FOCO ACTUAL (Diseño unificado Fuchsia/Gris)
│   │   ├── DailyReportModal.jsx
│   │   ├── ExpenseModal.jsx
│   │   ├── HistoryModals.jsx
│   │   ├── NotificationModal.jsx
│   │   ├── ProductModals.jsx
│   │   ├── RedemptionModal.jsx
│   │   ├── SaleModals.jsx
│   │   └── TransactionModals.jsx
│   │
│   ├── AppModals.jsx            # ⚠️ Barrel File: Re-exporta los modales de /modals/
│   ├── ProductImage.jsx
│   ├── Sidebar.jsx
│   └── TicketPrintLayout.jsx
│
├── data/                        # Datos iniciales y semillas
│   ├── seedHelpers.js
│   ├── seedLogs.js
│   └── seedTransactions.js
│
├── hooks/                       # Lógica de negocio extraída
│   ├── useBarcodeScanner.js
│   ├── useClients.js
│   ├── useDashboardData.js
│   └── useLogsFilter.js         # Lógica de filtros para ActionLogs
│
├── utils/
│   ├── devGenerator.js
│   └── helpers.js
│
├── views/                       # Vistas Principales (Orquestadores)
│   ├── CategoryManagerView.jsx
│   ├── ClientsView.jsx
│   ├── DashboardView.jsx
│   ├── HistoryView.jsx
│   ├── InventoryView.jsx
│   ├── LogsView.jsx             # Conecta con components/ActionLogs
│   ├── POSView.jsx              # Punto de Venta Principal
│   ├── ReportsHistoryView.jsx
│   └── RewardsView.jsx
│
├── App.jsx                      # ⚠️ LÓGICA PRINCIPAL: Manejo de estados globales y llamadas a Modales
├── main.jsx
└── index.css                    # Estilos globales (Tailwind)

```

---

# 🖨️ Guía de Implementación de Impresión (Ticket 58mm)

> **⚠️ ADVERTENCIA PARA DESARROLLADORES E IAs:**
> Este proyecto utiliza una configuración de impresión **extremadamente específica** para impresoras térmicas de 58mm (ej: XP-58, Epson TM-T20).
>
> **NO MODIFICAR `src/components/TicketPrintLayout.jsx` NI LOS ESTILOS DE IMPRESIÓN EN `src/index.css` SIN LEER ESTO PRIMERO.**

---

## 📌 1. El Problema de los Márgenes en Térmicas
Los navegadores modernos intentan aplicar márgenes de hoja A4 (aprox 1cm o 2cm) por defecto. En un papel de 58mm, esto "asfixia" el contenido, dejando una columna de texto de apenas 2cm de ancho, ilegible y cortada.

**Solución Implementada:**
* Se fuerza `@page { margin: 0; size: 58mm auto; }`.
* Se eliminan todos los paddings del `body` en modo impresión.
* **NO AGREGAR PADDING LATERAL** al contenedor `.ticket-container` en modo impresión. El texto debe fluir hasta el borde físico del papel (width: 100%).

## 📌 2. Tipografía y Nitidez
Las impresoras térmicas funcionan quemando puntos. Las fuentes con "antialiasing" (suavizado), grises o serifas finas (Times New Roman) se ven borrosas o invisibles.

**Reglas de Estilo (NO CAMBIAR):**
1.  **Fuente:** `Arial` o `sans-serif`. Se ha comprobado que en negrita (`bold`) y tamaño `11px` ofrece la mejor legibilidad en la XP-58.
2.  **Peso:** `font-weight: bold` o `800` en casi todo el texto. Esto fuerza a la impresora a quemar con más intensidad, generando un negro sólido.
3.  **Color:** `#000000` absoluto. No usar grises (`#333`, `#666`).
4.  **Tamaño:**
    * Base: `11px` (Menos de eso es ilegible, más de eso rompe líneas).
    * Títulos: `14px` - `16px`.

## 📌 3. Estructura del Layout (`TicketPrintLayout.jsx`)
El componente usa una estrategia de **Estilos en Línea (Template String)** para inyectar CSS crítico que sobrevive al proceso de impresión del navegador.

* **Contenedor:** `#printable-area` con `position: absolute; left: 0; top: 0;`. Esto es vital para "saltarse" los márgenes fantasmas del navegador.
* **Filas:** Flexbox (`justify-content: space-between`).
* **Items:** El nombre del producto tiene `width: 70%` y el precio `30%`. **No cambiar esta proporción** o los precios se cortarán o los nombres saltarán de línea excesivamente.

## 📌 4. Configuración del Navegador (Cliente)
Para que esto funcione, el usuario debe configurar su diálogo de impresión una sola vez:
* **Destino:** Impresora Térmica (XP-58).
* **Tamaño de Papel:** 58mm (No A4, No Letter).
* **Márgenes:** "Ninguno" o "Mínimo".
* **Escala:** 100% (Por defecto).

## 🧪 Checklist de Pruebas
Si modificas algo, verifica:
1.  [ ] El ticket sale alineado a la izquierda (no centrado en una hoja A4).
2.  [ ] El texto llega hasta el borde del papel sin cortarse.
3.  [ ] Los negros son sólidos (no grises pixelados).
4.  [ ] Los productos largos (ej: "Globo Metalizado Dorado 40cm") no rompen la alineación del precio.

---
**Autor:** Equipo de Desarrollo (IA + Humano)
**Última actualización:** Febrero 2026


