================================================================================
🚀 PARTY MANAGER — REBU COTILLÓN POS SYSTEM
📖 DOCUMENTACIÓN TÉCNICA MAESTRA PARA INTELIGENCIAS ARTIFICIALES
================================================================================

ATENCIÓN IA: Este documento contiene el contexto absoluto, la arquitectura, los paradigmas de UI/UX y las soluciones a bugs históricos del proyecto. DEBES leer detenidamente las secciones de "Reglas Críticas" y "Manejo de Estados" antes de proponer modificaciones estructurales o de interfaces.

Última actualización: Marzo 2026
Versión: 0.9.0 (Unificación Modular "Extras" y Blindaje Vite/Electron)

--------------------------------------------------------------------------------
1. STACK TECNOLÓGICO
--------------------------------------------------------------------------------
- Frontend: React 18 (Funcional, uso intensivo de Hooks) + Vite.
- Estilos: Tailwind CSS + Lucide React (Iconografía).
- Backend / Base de Datos: Supabase (PostgreSQL, Auth, Storage público, Realtime).
- Escritorio: Electron (Empaquetado y renderizado nativo Chromium).
- Generación de Documentos: html2pdf.js y Media Queries de impresión nativa CSS.

--------------------------------------------------------------------------------
2. ARQUITECTURA DE SOFTWARE (EL "GOD COMPONENT")
--------------------------------------------------------------------------------
El proyecto utiliza un patrón centralizado estricto para evitar problemas de desincronización de estados entre vistas:

- `App.jsx` es el "God Component". Contiene TODOS los estados globales de la aplicación (~40 estados: inventory, cart, clients, logs, rewards, categories, offers, etc.).
- Funciones Core: `fetchCloudData()` hace un `Promise.allSettled` a Supabase para precargar todo en memoria.
- Prop Drilling: `App.jsx` inyecta los datos y los manejadores de eventos (handlers) hacia abajo a las Vistas (`src/views/`).
- Gestor de Modales: Existe un archivo `AppModals.jsx` que orquesta la aparición de todos los modales globales (Checkout, Configuración, Clientes) para evitar problemas de z-index y contexto de renderizado.

--------------------------------------------------------------------------------
3. PARADIGMAS DE DISEÑO UI/UX (REGLAS DE ESTILOS)
--------------------------------------------------------------------------------
Para mantener la coherencia visual en toda la aplicación, se DEBEN respetar estas reglas:
1. Pestañas (Folder Tabs): Las navegaciones internas (como en ExtrasView) usan un diseño de "Carpeta Física". El contenedor tiene un borde inferior grueso (`border-b-2`). La pestaña activa baja 2 píxeles (`-mb-[2px]` o similar) con fondo blanco para "pisar" y ocultar la línea divisoria, creando el efecto visual de una solapa abierta.
2. Scrollbars Ocultas: Todo contenedor horizontal (`overflow-x-auto`) debe llevar la clase Tailwind `[&::-webkit-scrollbar]:hidden` y el estilo inline `style={{ scrollbarWidth: 'none' }}` para evitar que Windows inyecte barras grises feas.
3. Empty States: Si un array de datos está vacío, se debe mostrar un contenedor gris (`bg-slate-50`), con borde punteado (`border-dashed`), un icono grande de Lucide en el centro dentro de un círculo blanco, y un texto descriptivo.
4. Tipografía Financiera: Todo precio o número importante usa la fuente `font-black` y componentes como `<FancyPrice />` para separar los miles.

--------------------------------------------------------------------------------
4. MODELO DE DATOS Y CONVERSIÓN "CANTIDAD VS PESO"
--------------------------------------------------------------------------------
Supabase guarda los datos maestros. Existe un dualismo crítico en el inventario:
La tabla `products` incluye la columna `product_type` ('quantity' o 'weight').

A. PRODUCTOS POR CANTIDAD ('quantity'):
- Stock: Unidades enteras (ej: 50).
- Precio/Costo: Por unidad.
- UI: El carrito suma de 1 en 1.

B. PRODUCTOS POR PESO ('weight') - ¡ALERTA MATEMÁTICA!:
- Base de Datos: El stock se almacena en GRAMOS (ej: 1500 = 1.5kg). El costo y precio se almacenan en $/GRAMO (ej: si cuesta $10.000 el kilo, en la DB se guarda 10).
- Interfaz de Usuario (UI): Todas las vistas y tablas muestran la información en KILOS ($/kg).
- Modales: `ProductModals.jsx` realiza la conversión de fondo. Al editar, multiplica por 1000 para que el humano vea el precio por kilo. Al guardar, divide por 1000.
- Punto de Venta (POS): Al hacer clic en un producto por peso, se abre un `WeightInputModal` donde el usuario teclea los gramos deseados. En el carrito, la `quantity` equivale a gramos. El total es `precio (por gramo) * quantity (en gramos)`.

--------------------------------------------------------------------------------
5. MÓDULOS DEL SISTEMA (`src/views/`)
--------------------------------------------------------------------------------
* POSView (Caja): Escucha eventos de teclado (`useBarcodeScanner`) para pistola láser. Pre-checkout permite asignar un socio o "Consumidor Final". Los presupuestos se guardan en el estado global para persistir aunque el usuario cambie de pestaña.
* InventoryView: Vista de cuadrícula responsiva (de 4 a 10 columnas ajustables por el usuario) o vista de lista. Cuenta con ordenamiento múltiple (A-Z, Más recientes vía `created_at`, Precio, Stock).
* ExtrasView [NUEVO]: Consolidación absoluta del negocio. Contiene 3 pestañas:
  - Categorías: ABM y asignación masiva de productos.
  - Ofertas: Reglas automáticas detectadas por el POS (2x1, 3x2, Combos fijos, KITS, Mayoristas por cantidad, Descuentos).
  - Premios: Recompensas canjeables.
* ClientsView: CRUD de Socios. Integra un buscador que filtra al vuelo y un select dinámico. El "Último Movimiento" se calcula iterando las transacciones históricas.
* BulkEditorView: Editor masivo estilo hoja de cálculo para ajustar precios por porcentaje. Sirve como antesala para el generador de Presupuestos PDF.

--------------------------------------------------------------------------------
6. IMPRESIÓN DUAL, PDFS Y EL "TIME MACHINE" (MÁQUINA DEL TIEMPO)
--------------------------------------------------------------------------------
El sistema utiliza clases utilitarias de CSS (`print:hidden`, `print:block`) para manejar dos motores de impresión distintos:
1. Ticket Térmico: Usa `TicketPrintLayout.jsx`. Formato 58mm estricto, Arial 11px, blanco y negro puro. Se dispara automáticamente tras una venta en el POS.
2. Motor A4 PDF: Usa `ExportPdfLayout.jsx`. Genera Presupuestos estéticos con logos, tipografías mixtas y tablas cebradas.

[ LA MÁQUINA DEL TIEMPO DE PDFS ]
- Cuando se genera un Presupuesto PDF, `App.jsx` inyecta un registro en la tabla `logs` (Acción: Exportación PDF).
- En la columna `details` (JSONB) de la DB, guarda una FOTOGRAFÍA EXACTA (Snapshot) de los productos, precios, cliente y configuración en ese milisegundo.
- Si un admin va a `LogsView` un mes después y selecciona "Reimprimir", el motor PDF vuelve a armar el documento consumiendo el Snapshot, ignorando que los productos reales hayan subido de precio debido a la inflación.

--------------------------------------------------------------------------------
7. LOGS DE AUDITORÍA Y "SABUESO DE NOTAS"
--------------------------------------------------------------------------------
Todas las acciones relevantes llaman a `addLog(action, details, reason)`.
Problema histórico: A veces Supabase o funciones automáticas inyectaban razones aburridas como "Salida de dinero", ocultando la nota escrita por el cajero.
Solución ("Sabueso"): Se creó la función `extractRealNote(log)` en `LogsTable.jsx` que excava de forma recursiva dentro del objeto JSON `details` buscando claves (`description`, `note`, `extraInfo`). Si la encuentra, pisa visualmente el texto del sistema, restaurando la retroactividad de los comentarios reales del usuario.
- Test Global: La función `isTestRecord(item)` oculta automáticamente de las vistas y reportes oficiales cualquier venta, gasto o cliente que contenga la palabra "test".

--------------------------------------------------------------------------------
8. FIDELIZACIÓN: SISTEMA DE PUNTOS
--------------------------------------------------------------------------------
- Tasa de acumulación: 1 Punto por cada $500 de venta neta.
- Las recompensas (`rewards`) pueden ser productos físicos (descuentan stock) o vouchers de descuento financiero.
- En el POS, los premios ingresan al carrito con la flag `isReward: true` forzando un precio $0 y bloqueando los botones de sumar/restar cantidad.

--------------------------------------------------------------------------------
9. REGLAS Y BUGS CONOCIDOS PARA PREVENIR ERRORES
--------------------------------------------------------------------------------
- [CRÍTICO] Error de Vite (Fast Refresh): Nunca exportar componentes de React y utilidades Javascript normales en el mismo archivo. Todo lo que sea lógica abstracta (ej: generadores de IDs, formateadores de precio) DEBE vivir en `src/utils/helpers.js`.
- [CRÍTICO] Caché de Electron ("Código Fantasma"): Trabajar con Electron y Vite corriendo asincrónicamente provoca que Electron lea el `/dist` viejo. SIEMPRE usar el script personalizado `npm run dev:fresh` para matar la caché, compilar y luego abrir Electron.
- Caída de la DB por UUIDs: Si se intenta borrar o buscar una venta con un ID malformado, PostgreSQL rechaza la petición causando un crash general. Se mitigó usando una expresión regular de validación de UUIDs en los handlers.
- Cierre de modales involuntarios: El evento `focus` nativo de Windows (al abrir el selector de archivos para subir imágenes) causaba un re-render global que cerraba los modales de React. Se eliminó el listener `focus` del window y se le dio un cooldown de 15s al listener de `visibilitychange`.
- Restricción de CORS en Electron: Electron requiere que el cliente de Supabase asuma un origen válido local. En `supabase/client.js` se forzó el `detectSessionInUrl: false` y fetch custom headers para evitar rechazos de red.

--------------------------------------------------------------------------------
10. ESTRUCTURA DE ARCHIVOS OFICIAL
--------------------------------------------------------------------------------
src/
├── components/
│   ├── ActionLogs/           # Tablas, renderizadores de detalle y Sabueso
│   ├── dashboard/            # KPIs, Kioscos y Gráficos
│   ├── modals/               # Formularios flotantes segmentados
│   ├── AppModals.jsx         # Orquestador de Modales
│   ├── ExportPdfLayout.jsx   # Plantilla de Presupuestos (Motor A4)
│   ├── Sidebar.jsx           # Navegación (Control de roles de Usuario)
│   └── TicketPrintLayout.jsx # Pantilla de Ticket Térmico 58mm
├── hooks/
│   └── useBarcodeScanner.js  # Lector de código de barras global
├── supabase/
│   └── client.js             # Conexión DB
├── utils/
│   └── helpers.js            # Funciones puras (Formateo, isTestRecord)
├── views/
│   ├── BulkEditorView.jsx    # Editor Excel-like y creador de PDFs
│   ├── ClientsView.jsx       # Gestión de Socios
│   ├── DashboardView.jsx     # Panel inicial
│   ├── ExtrasView.jsx        # ⭐ Módulo Unificado: Promos, Catálogo y Premios
│   ├── HistoryView.jsx       # Transacciones de venta
│   ├── InventoryView.jsx     # Gestor de Stock principal
│   ├── LogsView.jsx          # Auditoría
│   ├── POSView.jsx           # Punto de Venta y Carrito
│   └── ReportsHistoryView.jsx# Cierres de caja (Ciegos)
└── App.jsx                   # CEREBRO DEL SISTEMA (God Component)

--------------------------------------------------------------------------------
11. COMANDOS DE DESARROLLO Y BUILD
--------------------------------------------------------------------------------
> npm install             (Instalación de dependencias iniciales)
> npm run dev:fresh       (🚀 COMANDO OBLIGATORIO PARA DESARROLLAR: Limpia, hace build y lanza Electron)
> npm run build           (Compila la aplicación estática en Vite)
> npm run electron:dev    (Lanza solo Electron asumiendo que el build ya se hizo)
> npm run electron:build  (Empaqueta el ejecutable nativo para Windows/Mac)