# Rebu Cotillon POS System

Documentacion tecnica y funcional del Punto de Venta Rebu Cotillon.

Ultima actualizacion: Abril 2026  
Version app: 1.0.6  
Stack principal: React 18, Vite, Electron, Supabase y Tailwind CSS.

---

## 1. Objetivo del sistema

Rebu Cotillon POS System es una aplicacion de escritorio para administrar el punto de venta, inventario, socios, promociones, pedidos, presupuestos, cierres de caja, reportes y auditoria del negocio.

La app esta pensada para trabajar con Supabase como nube principal, pero con defensas para seguir mostrando datos parciales u operar con snapshot local cuando hay problemas de conexion o diferencias menores de schema.

---

## 2. Arquitectura general

El proyecto mantiene una arquitectura centralizada:

- `src/App.jsx` funciona como componente principal de negocio. Administra estados globales, carga de nube, operaciones de stock, ventas, pedidos, logs, cierres y sincronizacion.
- `src/views/` contiene las pantallas principales: POS, Inventario, Dashboard, Historial, Clientes, Logs, Sesiones, Extras, Reportes y Editor masivo.
- `src/components/modals/` contiene los modales operativos.
- `src/components/dashboard/` contiene KPIs, graficos, rankings y alertas.
- `src/utils/` centraliza helpers de mapeo, compatibilidad con Supabase, selects cloud, formateadores y logica compartida.
- `src/hooks/` contiene hooks de dashboard, clientes, filtros de logs y lector de codigo de barras.

Regla importante: evitar mezclar componentes React y utilidades puras en el mismo archivo para no romper Fast Refresh de Vite.

---

## 3. Stack tecnologico

- Frontend: React 18 con componentes funcionales y hooks.
- Build: Vite.
- Escritorio: Electron.
- UI: Tailwind CSS y Lucide React.
- Backend: Supabase PostgreSQL, REST, Auth y Storage.
- Impresion: CSS print nativo para ticket termico y layouts HTML para reportes/presupuestos.

---

## 4. Modulos principales

### Punto de Venta

El POS permite buscar productos, usar lector de codigo de barras, vender por cantidad o peso, aplicar ofertas, combos, canjes de socio, descuentos y pagos mixtos.

Cambios recientes importantes:

- Al cobrar una venta, el modal de venta realizada incluye la vista previa del ticket, informacion central y productos del pedido.
- El ticket puede imprimirse desde el mismo modal sin abrir una vista intermedia.
- Las ventas guardan informacion suficiente para reconstruir detalle, ticket, historial y reportes.

### Inventario

Administra productos por cantidad y por peso, stock, precios, costos, categorias, vencimientos e imagenes.

Cambios recientes importantes:

- Los productos proximos a vencer ya no se muestran como "vencidos" antes de tiempo.
- El vencimiento se presenta como texto contextual: "Por vencer en X dias".
- La duplicacion de productos depende del permiso `inventory.create`, porque duplicar se considera una creacion desde una plantilla.

### Historial de transacciones

Muestra ventas, productos vendidos, usuario, socio, medio de pago, ticket y estado.

Cambios recientes importantes:

- Se corrigio la carga de productos cuando hay descuentos, canjes o columnas faltantes en `sale_items`.
- Se recupera el usuario desde la venta o desde logs asociados, evitando que figure como "Desconocido" cuando la informacion existe.
- Se mejoro el calculo y visualizacion de productos por peso.

### Dashboard y Diario

El Dashboard resume ventas, ingreso, ganancia neta, gastos, pagos, ranking y alertas.

Cambios recientes importantes:

- En modo Diario, `Ingreso` representa el bruto vendido del periodo.
- `Ganancia Neta` representa ingreso bruto menos costo de productos vendidos y gastos registrados.
- Los KPIs usan `HintIcon` para explicar conceptos sin ocupar espacio visual.
- Los graficos diarios muestran tambien el neto en el tooltip.

### Pedidos y presupuestos

Los pedidos/presupuestos pueden incluir productos normales, por peso, combos y descuentos.

Cambios recientes importantes:

- Los combos preservan metadata como `isCombo` y `productsIncluded`.
- Los descuentos preservan metadata como `isDiscount`.
- Al finalizar pedidos pagos, el stock se ajusta con la misma logica de ventas.

### Logs y auditoria

Todas las acciones relevantes registran logs con detalle JSON.

Cambios recientes importantes:

- Los logs de anulacion, restauracion y edicion registran `stockChanges` con productos reales afectados.
- Los canjes/descuentos se registran como descuento y no como "Gratis".
- Los mappers toleran logs viejos y acciones con textos historicos.

### Cierres y reportes

Los cierres calculan ventas, gastos, efectivo, metodos de pago y ganancia.

Cambios recientes importantes:

- Los reportes usan pagos mixtos correctamente.
- El costo de productos vendidos puede salir de `stockChanges` cuando existe.
- Las ventas por peso y combos se consideran de forma mas coherente para costos y reportes.

---

## 5. Productos por cantidad y por peso

La columna `product_type` define el tipo de producto:

- `quantity`: stock en unidades, precio por unidad y costo por unidad.
- `weight`: stock en gramos, precio interno por gramo y costo interno por gramo.

Reglas clave:

- La UI muestra productos por peso en kilos cuando corresponde.
- En base de datos se guarda el precio/costo por gramo.
- En carrito y ventas, la cantidad de productos por peso representa gramos.
- Los subtotales deben usar `subtotal` cuando existe; si no existe, se calcula con heuristica segun `product_type`.

---

## 6. Stock de ventas, combos y descuentos

La logica de stock fue unificada para ventas, anulaciones, restauraciones y edicion.

Reglas actuales:

- Productos normales descuentan stock del producto vendido.
- Productos por peso descuentan gramos.
- Combos descuentan stock de cada producto incluido en `productsIncluded`.
- Descuentos, canjes, rewards y productos personalizados no afectan stock.
- Anular una venta restaura stock.
- Restaurar una venta anulada valida stock disponible y vuelve a descontar.
- Editar una venta aplica solo la diferencia de stock.
- Cada update de stock en Supabase debe revisar `{ error }` y cortar el flujo si falla.

Archivos relevantes:

- `src/App.jsx`
- `src/utils/budgetHelpers.js`
- `src/components/modals/TransactionModals.jsx`
- `src/components/modals/HistoryModals.jsx`
- `src/components/TicketPrintLayout.jsx`

---

## 7. Compatibilidad con Supabase

La app no asume que todas las bases tengan exactamente el mismo schema.

Se usa una capa flexible para:

- Quitar columnas opcionales rechazadas por Supabase y reintentar.
- Manejar errores en selects anidados como `sale_items(...)`.
- Permitir que gastos, logs, cierres y ventas carguen aunque falten columnas de auditoria.
- Insertar o actualizar degradando payloads cuando columnas opcionales no existen.
- Reducir ruido de consola: solo debe mostrarse el error final si todos los reintentos fallan.

Archivos relevantes:

- `src/utils/supabaseSchemaFallback.js`
- `src/utils/cloudSelects.js`
- `src/utils/cloudMappers.js`

Columnas tratadas como opcionales segun compatibilidad:

- `user_id`
- `user_role`
- `user_name`
- `product_type`
- `subtotal`
- `line_subtotal`
- `active_offers`
- otras columnas de auditoria o metadata segun tabla.

---

## 8. Permisos

El sistema usa permisos granulares por modulo.

Regla reciente:

- Duplicar producto depende de `inventory.create`.
- No se exige `inventory.edit` para ejecutar la duplicacion si el usuario ya pudo acceder al flujo correspondiente.
- Mensaje esperado si falta permiso: `Necesitas permiso para crear productos para duplicarlos.`

Archivo relevante:

- `src/components/modals/ProductModals.jsx`
- `src/App.jsx`
- `src/utils/userPermissions.js`

---

## 9. Modo sin conexion y recarga

El sistema puede detectar modo sin conexion o fallos parciales de nube.

Comportamiento esperado:

- Si hay snapshot local, se muestran datos existentes.
- Si un modulo falla, no deberia tirar abajo toda la aplicacion.
- El aviso de modo sin conexion incluye accion para reconectar.
- La parte superior del programa incluye accesos a Soft Reload y Force Reload.

---

## 10. UI y componentes reutilizables

### FancyPrice

Usar `FancyPrice` para importes principales. Evita inconsistencias visuales en precios y totales.

### HintIcon

Ubicacion: `src/components/HintIcon.jsx`

Uso:

```jsx
<HintIcon hint="Texto de ayuda" size={13} side="left" />
```

Se usa para explicar conceptos sin agregar texto permanente en pantalla, por ejemplo:

- Ingreso bruto.
- Ganancia neta.
- Campos complejos de presupuestos u ofertas.

### ProductImage

Usar el componente existente para mostrar imagenes de productos y mantener fallback visual consistente.

---

## 11. Pruebas manuales recomendadas

Despues de cambios de negocio, probar:

1. Venta normal: descuenta stock correcto.
2. Venta por peso: descuenta gramos correctos.
3. Venta con combo: descuenta cada producto incluido.
4. Venta con descuento/canje/reward/custom: no afecta stock.
5. Anulacion: restaura stock.
6. Restauracion: valida stock y vuelve a descontar.
7. Edicion de venta: ajusta solo diferencias.
8. Historial: muestra productos, usuario, pago y ticket.
9. Gastos: cargan y aparecen aunque falten columnas opcionales de usuario.
10. Dashboard Diario: ingreso bruto y ganancia neta se diferencian cuando hay costos o gastos.
11. Cierre de caja: pagos mixtos, efectivo, gastos y ganancia cierran coherentemente.
12. Duplicacion de producto: usuario con `inventory.create` puede duplicar; usuario sin ese permiso no.

---

## 12. Comandos

Instalar dependencias:

```bash
npm install
```

Build de produccion:

```bash
npm run build
```

Desarrollo con Electron:

```bash
npm run dev:fresh
```

Ejecutar solo Electron sobre build existente:

```bash
npm run electron:dev
```

Empaquetar app:

```bash
npm run electron:build
```

---

## 13. Reglas de mantenimiento

- No modificar schema de Supabase sin una migracion planificada.
- Preferir compatibilidad en codigo cuando se trate de columnas opcionales.
- No romper datos historicos: usar snapshots y fallbacks antes de asumir campos nuevos.
- Mantener logs con suficiente detalle para reconstruir ventas, stock y usuarios.
- Para stock, usar helpers compartidos y no calculos manuales aislados.
- Para productos por peso, recordar que la base opera en gramos.
- Antes de entregar cambios, ejecutar `npm run build`.
