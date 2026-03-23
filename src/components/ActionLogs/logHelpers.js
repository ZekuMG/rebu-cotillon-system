// src/components/ActionLogs/logHelpers.js

const ACTION_ALIASES = {
  'Cierre AutomÃ¡tico': 'Cierre Automático',
  'Venta Realizada': 'Venta Realizada',
  'Venta Anulada': 'Venta Anulada',
  'Venta Restaurada': 'Venta Restaurada',
  'ModificaciÃ³n Pedido': 'Modificación Pedido',
  'EdiciÃ³n Producto': 'Edición Producto',
  'EdiciÃ³n de Socio': 'Edición de Socio',
  'EdiciÃ³n de Puntos': 'Edición de Puntos',
  'CategorÃ­a': 'Categoría',
  'ActualizaciÃ³n Masiva': 'Actualización Masiva',
  'EdiciÃ³n Masiva CategorÃ­as': 'Edición Masiva Categorías',
  'Inicio de SesiÃ³n': 'Inicio de Sesión',
  'Exportaci?n PDF': 'Exportación PDF',
  'CupÃ³n Creado': 'Cupón Creado',
  'CupÃ³n Editado': 'Cupón Editado',
  'CupÃ³n Eliminado': 'Cupón Eliminado',
  'Pedido SeÃ±ado': 'Pedido Señado',
  'SeÃ±a': 'Seña',
};

export const normalizeLogAction = (action) => ACTION_ALIASES[action] || action || '';

export const getDetailTitle = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const titles = {
    'Apertura de Caja': 'Reporte de Apertura',
    'Cierre de Caja': 'Reporte de Cierre',
    'Cierre Automático': 'Reporte Automático',
    'Venta Realizada': 'Detalle de Transacción',
    'Venta Anulada': 'Anulación de Venta',
    'Venta Restaurada': 'Restauración de Venta',
    'Modificación Pedido': 'Ajuste de Pedido',
    'Venta Modificada': 'Ajuste de Pedido',
    'Nuevo Gasto': 'Comprobante de Gasto',
    Gasto: 'Comprobante de Gasto',
    'Alta de Producto': 'Ingreso de Producto',
    'Edición Producto': 'Modificación de Inventario',
    'Baja Producto': 'Egreso de Producto',
    'Producto Duplicado': 'Producto Duplicado',
    'Nuevo Socio': 'Ficha de Nuevo Socio',
    'Edición de Socio': 'Actualización de Perfil',
    'Edición de Puntos': 'Movimiento de Puntos',
    'Baja de Socio': 'Eliminación de Registro',
    'Nuevo Premio': 'Alta de Premio',
    'Editar Premio': 'Edición de Premio',
    'Eliminar Premio': 'Baja de Premio',
    'Categoría': 'Gestión de Categorías',
    'Actualización Masiva': 'Reporte de Cambios Masivos',
    'Edición Masiva Categorías': 'Reporte de Cambios Masivos',
    'Horario Modificado': 'Cambio de Horario',
    'Sistema Iniciado': 'Información del Sistema',
    'Venta Eliminada': 'Registro Eliminado',
    Login: 'Inicio de Sesión',
    'Exportación PDF': 'Documento Generado',
    'Presupuesto Creado': 'Nuevo Presupuesto',
    'Presupuesto Editado': 'Modificación de Presupuesto',
    'Presupuesto Eliminado': 'Baja de Presupuesto',
    'Pedido Creado': 'Nuevo Pedido',
    'Pedido Editado': 'Modificación de Pedido',
    'Pago Pedido': 'Pago de Pedido',
    'Pedido Retirado': 'Entrega de Pedido',
    'Pedido Cancelado': 'Cancelación de Pedido',
    'Pedido Eliminado': 'Baja de Pedido',
    'Cupón Creado': 'Nuevo Cupón',
    'Cupón Editado': 'Modificación de Cupón',
    'Cupón Eliminado': 'Baja de Cupón',
    'Oferta Creada': 'Nueva Oferta/Combo',
    'Oferta Editada': 'Modificación de Oferta',
    'Oferta Eliminada': 'Baja de Oferta',
  };

  return titles[action] || 'Detalles del Registro';
};

export const getDetailIcon = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const icons = {
    'Venta Realizada': '🛒',
    'Venta Anulada': '❌',
    'Venta Restaurada': '♻️',
    'Modificación Pedido': '📝',
    'Venta Modificada': '📝',
    'Apertura de Caja': '💰',
    'Cierre de Caja': '🔒',
    'Cierre Automático': '⏰',
    'Edición Producto': '✏️',
    'Alta de Producto': '📦',
    'Baja Producto': '🗑️',
    'Producto Duplicado': '📋',
    'Categoría': '🏷️',
    'Edición Masiva Categorías': '🏷️',
    'Actualización Masiva': '🏷️',
    'Nuevo Socio': '👤',
    'Edición de Socio': '👤',
    'Edición de Puntos': '🏆',
    'Baja de Socio': '👤',
    'Nuevo Gasto': '📉',
    Gasto: '📉',
    'Nuevo Premio': '🎁',
    'Editar Premio': '🎁',
    'Eliminar Premio': '🎁',
    Login: '🔑',
    'Horario Modificado': '⚙️',
    'Sistema Iniciado': '⚡',
    'Venta Eliminada': '🗑️',
    'Exportación PDF': '📄',
    'Presupuesto Creado': '🧾',
    'Presupuesto Editado': '🧾',
    'Presupuesto Eliminado': '🧾',
    'Pedido Creado': '📦',
    'Pedido Editado': '📦',
    'Pago Pedido': '💸',
    'Pedido Retirado': '✅',
    'Pedido Cancelado': '⛔',
    'Pedido Eliminado': '🗑️',
    'Cupón Creado': '🎟️',
    'Cupón Editado': '🎟️',
    'Cupón Eliminado': '🎟️',
    'Oferta Creada': '🎫',
    'Oferta Editada': '🎫',
    'Oferta Eliminada': '🎫',
  };

  return icons[action] || '📄';
};

export const getDetailColor = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const colors = {
    'Venta Realizada': 'green',
    'Apertura de Caja': 'green',
    'Venta Restaurada': 'green',
    'Cupón Creado': 'green',
    'Cupón Editado': 'green',
    'Pago Pedido': 'green',
    'Pedido Retirado': 'green',
    'Venta Anulada': 'red',
    'Baja Producto': 'red',
    'Baja de Socio': 'red',
    'Eliminar Premio': 'red',
    'Venta Eliminada': 'red',
    'Presupuesto Eliminado': 'red',
    'Pedido Cancelado': 'red',
    'Pedido Eliminado': 'red',
    'Nuevo Gasto': 'red',
    Gasto: 'red',
    'Oferta Eliminada': 'red',
    'Cupón Eliminado': 'red',
    'Alta de Producto': 'blue',
    'Edición Producto': 'blue',
    'Producto Duplicado': 'blue',
    'Nuevo Socio': 'blue',
    'Edición de Socio': 'blue',
    'Pedido Creado': 'blue',
    'Pedido Editado': 'indigo',
    'Edición de Puntos': 'violet',
    'Nuevo Premio': 'violet',
    'Editar Premio': 'violet',
    'Oferta Creada': 'violet',
    'Oferta Editada': 'violet',
    'Presupuesto Creado': 'indigo',
    'Presupuesto Editado': 'indigo',
    'Modificación Pedido': 'amber',
    'Venta Modificada': 'amber',
    'Categoría': 'amber',
    'Actualización Masiva': 'amber',
    'Edición Masiva Categorías': 'amber',
    'Horario Modificado': 'amber',
    'Cierre de Caja': 'slate',
    'Cierre Automático': 'slate',
    Login: 'slate',
    'Sistema Iniciado': 'slate',
    'Exportación PDF': 'indigo',
  };

  return colors[action] || 'slate';
};

export const ACTION_GROUPS = [
  { label: '💰 Caja', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático'] },
  { label: '🛒 Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Venta Restaurada', 'Venta Modificada', 'Venta Eliminada'] },
  { label: '📦 Pedidos', actions: ['Presupuesto Creado', 'Presupuesto Editado', 'Presupuesto Eliminado', 'Pedido Creado', 'Pedido Editado', 'Pago Pedido', 'Pedido Retirado', 'Pedido Cancelado', 'Pedido Eliminado'] },
  { label: '📉 Gastos', actions: ['Nuevo Gasto'] },
  { label: '📦 Productos', actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado'] },
  { label: '🎫 Ofertas y Descuentos', actions: ['Oferta Creada', 'Oferta Editada', 'Oferta Eliminada', 'Cupón Creado', 'Cupón Editado', 'Cupón Eliminado'] },
  { label: '👤 Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '🎁 Premios', actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '🏷️ Categorías', actions: ['Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '⚙️ Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Exportación PDF'] },
];

export const extractRealNote = (log) => {
  if (!log) return null;

  const action = normalizeLogAction(log.action);
  let reason = log.reason;
  let details = log.details;

  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = {};
    }
  } else if (!details) {
    details = {};
  }

  const generics = [
    'venta regular',
    'salida de dinero',
    'sin motivo',
    'ajuste manual',
    'anulación manual',
    'registro manual',
    'producto nuevo',
    'inicio de operaciones',
    'gasto general',
    'ajuste de horario',
    'duplicado desde editor',
    'gestión catálogo',
    'actualización de datos',
    'restauración manual desde el historial',
    'limpieza de historial',
    'eliminación permanente',
    'exportación de catálogo',
    'gestión de pedidos',
    'conversión desde presupuesto',
    'cobro manual en pedidos',
    'entrega finalizada',
    'se retuvo la seña',
    'se devolvió la seña',
  ];

  if (typeof reason === 'string' && reason.trim() !== '') {
    const cleanReason = reason.trim();
    const lowerReason = cleanReason.toLowerCase();

    if (!generics.includes(lowerReason)) {
      if (!((action === 'Nuevo Gasto' || action === 'Gasto') && lowerReason === String(details.category || '').toLowerCase())) {
        return cleanReason;
      }
    }
  }

  const candidates = [details.description, details.note, details.reason, details.extraInfo];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;

    const cleanCandidate = candidate.trim();
    const lowerCandidate = cleanCandidate.toLowerCase();

    if (!generics.includes(lowerCandidate)) {
      if ((action === 'Nuevo Gasto' || action === 'Gasto') && lowerCandidate === String(details.category || '').toLowerCase()) {
        continue;
      }

      return cleanCandidate;
    }
  }

  return null;
};
