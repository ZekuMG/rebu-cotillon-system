// ════════════════════════════════════════════════════════════════
//  actionMap.js — Fuente única de verdad para el mapeo visual
//  
//  REGLA: En la BD se guarda "Modificación Pedido" (normalizado en App.jsx).
//  En la UI siempre se muestra "Venta Modificada".
//  Este archivo centraliza esa traducción para que TODOS los componentes
//  lean de un solo lugar.
// ════════════════════════════════════════════════════════════════

/**
 * Mapeo DB → UI (para mostrar en tabla, filtros, títulos)
 */
export const DISPLAY_ACTION_MAP = {
  'Modificación Pedido': 'Venta Modificada',
};

/**
 * Dado un action de la BD, devuelve el nombre visual para la UI.
 * Si no hay mapeo, devuelve el original.
 */
export const getDisplayAction = (dbAction) => {
  return DISPLAY_ACTION_MAP[dbAction] || dbAction;
};

/**
 * Dado un action visual del filtro, devuelve TODOS los posibles
 * valores de la BD que coinciden (para cubrir registros legacy
 * que se guardaron con el nombre incorrecto).
 */
export const getDbActionsForFilter = (displayAction) => {
  if (displayAction === 'Venta Modificada') {
    return ['Modificación Pedido', 'Venta Modificada'];
  }
  // Para cualquier otro, coincidencia directa
  return [displayAction];
};

/**
 * Verifica si un log.action coincide con un filtro visual activo.
 * Usado por LogsView para filtrar correctamente.
 */
export const actionMatchesFilter = (logAction, filterAction) => {
  if (!filterAction || filterAction === 'Todas') return true;
  const dbActions = getDbActionsForFilter(filterAction);
  return dbActions.includes(logAction);
};

/**
 * Grupos de acciones para el dropdown de filtros.
 * Usa nombres VISUALES (lo que ve el usuario).
 * ⚠️ Solo aparece "Venta Modificada" una vez, no duplicado.
 */
export const ACTION_GROUPS = [
  { label: '💰 Caja',       actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático'] },
  { label: '🛒 Ventas',     actions: ['Venta Realizada', 'Venta Anulada', 'Venta Modificada'] },
  { label: '📉 Gastos',     actions: ['Nuevo Gasto'] },
  { label: '📦 Productos',  actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado'] },
  { label: '👤 Socios',     actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '🎁 Premios',    actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '🏷️ Categorías', actions: ['Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '⚙️ Sistema',    actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Borrado Permanente'] },
];

/**
 * Lista plana de TODAS las acciones visuales (sin duplicados).
 */
export const ALL_VISUAL_ACTIONS = ACTION_GROUPS.flatMap(g => g.actions);