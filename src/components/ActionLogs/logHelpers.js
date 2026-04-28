// src/components/ActionLogs/logHelpers.js

const ACTION_ALIASES = {
  'Cierre Autom\u00c3\u0192\u00c2\u00a1tico': 'Cierre Autom\u00e1tico',
  'Cierre de caja (Modo Prueba)': 'Cierre de Caja (Silencioso)',
  'Cierre de Caja (Modo Prueba)': 'Cierre de Caja (Silencioso)',
  'Borrado Permanente': 'Venta Eliminada',
  'Modificaci\u00c3\u0192\u00c2\u00b3n Pedido': 'Modificación Pedido',
  'Edici\u00c3\u0192\u00c2\u00b3n Producto': 'Edición Producto',
  'Edici\u00c3\u0192\u00c2\u00b3n de Socio': 'Edición de Socio',
  'Edici\u00c3\u0192\u00c2\u00b3n de Puntos': 'Edición de Puntos',
  'Categor\u00c3\u0192\u00c2\u00ada': 'Categor\u00eda',
  'Editar Categor\u00c3\u0192\u00c2\u00ada': 'Categor\u00eda',
  'Editar Categor\u00eda': 'Categor\u00eda',
  'Actualizaci\u00c3\u0192\u00c2\u00b3n Masiva': 'Actualización Masiva',
  'Edici\u00c3\u0192\u00c2\u00b3n Masiva Categor\u00c3\u0192\u00c2\u00adas': 'Edición Masiva Categor\u00edas',
  'Inicio de Sesi\u00c3\u0192\u00c2\u00b3n': 'Inicio de Sesión',
  'Exportaci?n PDF': 'Exportación PDF',
  'Cup\u00c3\u0192\u00c2\u00b3n Creado': 'Cup\u00f3n Creado',
  'Cup\u00c3\u0192\u00c2\u00b3n Editado': 'Cup\u00f3n Editado',
  'Cup\u00c3\u0192\u00c2\u00b3n Eliminado': 'Cup\u00f3n Eliminado',
  'Pedido Se\u00c3\u0192\u00c2\u00b1ado': 'Pedido Se\u00f1ado',
  'Se\u00c3\u0192\u00c2\u00b1a': 'Se\u00f1a',
};

export const normalizeLogAction = (action) => ACTION_ALIASES[action] || action || '';

export const getDetailTitle = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const titles = {
    'Apertura de Caja': 'Reporte de Apertura',
    'Cierre de Caja': 'Reporte de Cierre',
    'Cierre de Caja (Silencioso)': 'Cierre Silencioso',
    'Cierre Autom\u00e1tico': 'Reporte Autom\u00e1tico',
    'Venta Realizada': 'Detalle de Transacción',
    'Venta Anulada': 'Anulación de Venta',
    'Venta Restaurada': 'Restauración de Venta',
    'Modificación Pedido': 'Ajuste de Pedido',
    'Venta Modificada': 'Ajuste de Pedido',
    'Nuevo Gasto': 'Comprobante de Gasto',
    Gasto: 'Comprobante de Gasto',
    'Alta de Producto': 'Ingreso de Producto',
    'Edición Producto': 'Modificación de Inventario',
    'Edición Masiva': 'Reporte de Edición Masiva',
    'Baja Producto': 'Egreso de Producto',
    'Producto Duplicado': 'Producto Duplicado',
    'Nuevo Socio': 'Ficha de Nuevo Socio',
    'Edición de Socio': 'Actualización de Perfil',
    'Edición de Puntos': 'Movimiento de Puntos',
    'Baja de Socio': 'Eliminación de Registro',
    'Nuevo Premio': 'Alta de Premio',
    'Editar Premio': 'Edición de Premio',
    'Eliminar Premio': 'Baja de Premio',
    'Categor\u00eda': 'Gestión de Categor\u00edas',
    'Actualización Masiva': 'Reporte de Cambios Masivos',
    'Edición Masiva Categor\u00edas': 'Reporte de Cambios Masivos',
    'Horario Modificado': 'Cambio de Horario',
    'Sistema Iniciado': 'Información del Sistema',
    'Ajustes de Usuario': 'Ajustes de Usuario',
    'Usuario Creado': 'Alta de Usuario',
    'Usuario Editado': 'Edición de Usuario',
    'Permisos de Usuario Actualizados': 'Actualización de Permisos',
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
    'Cup\u00f3n Creado': 'Nuevo Cup\u00f3n',
    'Cup\u00f3n Editado': 'Modificación de Cup\u00f3n',
    'Cup\u00f3n Eliminado': 'Baja de Cup\u00f3n',
    'Oferta Creada': 'Nueva Oferta/Combo',
    'Oferta Editada': 'Modificación de Oferta',
    'Oferta Eliminada': 'Baja de Oferta',
  };

  return titles[action] || 'Detalles del Registro';
};

export const getDetailIcon = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const icons = {
    'Venta Realizada': '\u{1F6D2}',
    'Venta Anulada': '\u274c',
    'Venta Restaurada': '\u267b\ufe0f',
    'Modificación Pedido': '\u{1F4DD}',
    'Venta Modificada': '\u{1F4DD}',
    'Apertura de Caja': '\u{1F4B0}',
    'Cierre de Caja': '\u{1F512}',
    'Cierre de Caja (Silencioso)': '\u{1F92B}',
    'Cierre Autom\u00e1tico': '\u23f0',
    'Edición Producto': '\u270f\ufe0f',
    'Edición Masiva': '\u{1F4DA}',
    'Alta de Producto': '\u{1F4E6}',
    'Baja Producto': '\u{1F5D1}\ufe0f',
    'Producto Duplicado': '\u{1F4CB}',
    'Categor\u00eda': '\u{1F3F7}\ufe0f',
    'Edición Masiva Categor\u00edas': '\u{1F3F7}\ufe0f',
    'Actualización Masiva': '\u{1F3F7}\ufe0f',
    'Nuevo Socio': '\u{1F464}',
    'Edición de Socio': '\u{1F464}',
    'Edición de Puntos': '\u{1F3C6}',
    'Baja de Socio': '\u{1F464}',
    'Nuevo Gasto': '\u{1F4C9}',
    Gasto: '\u{1F4C9}',
    'Nuevo Premio': '\u{1F381}',
    'Editar Premio': '\u{1F381}',
    'Eliminar Premio': '\u{1F381}',
    Login: '\u{1F511}',
    'Horario Modificado': '\u2699\ufe0f',
    'Sistema Iniciado': '\u26a1',
    'Ajustes de Usuario': '\u{1F3A8}',
    'Usuario Creado': '\u{1F464}',
    'Usuario Editado': '\u270f\ufe0f',
    'Permisos de Usuario Actualizados': '\u{1F510}',
    'Venta Eliminada': '\u{1F5D1}\ufe0f',
    'Exportación PDF': '\u{1F4C4}',
    'Presupuesto Creado': '\u{1F9FE}',
    'Presupuesto Editado': '\u{1F9FE}',
    'Presupuesto Eliminado': '\u{1F9FE}',
    'Pedido Creado': '\u{1F4E6}',
    'Pedido Editado': '\u{1F4E6}',
    'Pago Pedido': '\u{1F4B8}',
    'Pedido Retirado': '\u2705',
    'Pedido Cancelado': '\u26d4',
    'Pedido Eliminado': '\u{1F5D1}\ufe0f',
    'Cup\u00f3n Creado': '\u{1F39F}\ufe0f',
    'Cup\u00f3n Editado': '\u{1F39F}\ufe0f',
    'Cup\u00f3n Eliminado': '\u{1F39F}\ufe0f',
    'Oferta Creada': '\u{1F3AB}',
    'Oferta Editada': '\u{1F3AB}',
    'Oferta Eliminada': '\u{1F3AB}',
  };

  return icons[action] || '\u{1F4C4}';
};

export const getDetailColor = (rawAction) => {
  const action = normalizeLogAction(rawAction);

  const colors = {
    'Venta Realizada': 'green',
    'Apertura de Caja': 'green',
    'Venta Restaurada': 'green',
    'Usuario Creado': 'green',
    'Cup\u00f3n Creado': 'green',
    'Cup\u00f3n Editado': 'green',
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
    'Cup\u00f3n Eliminado': 'red',
    'Alta de Producto': 'blue',
    'Edición Producto': 'blue',
    'Producto Duplicado': 'blue',
    'Ajustes de Usuario': 'blue',
    'Usuario Editado': 'blue',
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
    'Permisos de Usuario Actualizados': 'violet',
    'Modificación Pedido': 'amber',
    'Venta Modificada': 'amber',
    'Categor\u00eda': 'amber',
    'Actualización Masiva': 'amber',
    'Edición Masiva Categor\u00edas': 'amber',
    'Edición Masiva': 'amber',
    'Horario Modificado': 'amber',
    'Cierre de Caja': 'slate',
    'Cierre de Caja (Silencioso)': 'slate',
    'Cierre Autom\u00e1tico': 'slate',
    Login: 'slate',
    'Sistema Iniciado': 'slate',
    'Exportación PDF': 'indigo',
  };

  return colors[action] || 'slate';
};

export const ACTION_GROUPS = [
  { label: '\u{1F4B0} Caja', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre de Caja (Silencioso)', 'Cierre Autom\u00e1tico'] },
  { label: '\u{1F6D2} Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Venta Restaurada', 'Venta Modificada', 'Venta Eliminada'] },
  { label: '\u{1F4E6} Pedidos', actions: ['Presupuesto Creado', 'Presupuesto Editado', 'Presupuesto Eliminado', 'Pedido Creado', 'Pedido Editado', 'Pago Pedido', 'Pedido Retirado', 'Pedido Cancelado', 'Pedido Eliminado'] },
  { label: '\u{1F4C9} Gastos', actions: ['Nuevo Gasto'] },
  { label: '\u{1F4E6} Productos', actions: ['Alta de Producto', 'Edición Producto', 'Edición Masiva', 'Baja Producto', 'Producto Duplicado'] },
  { label: '\u{1F3AB} Ofertas y Descuentos', actions: ['Oferta Creada', 'Oferta Editada', 'Oferta Eliminada', 'Cup\u00f3n Creado', 'Cup\u00f3n Editado', 'Cup\u00f3n Eliminado'] },
  { label: '\u{1F464} Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '\u{1F381} Premios', actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '\u{1F3F7}\ufe0f Categor\u00edas', actions: ['Categor\u00eda', 'Actualización Masiva', 'Edición Masiva Categor\u00edas'] },
  { label: '\u{1F465} Usuarios', actions: ['Ajustes de Usuario', 'Usuario Creado', 'Usuario Editado', 'Permisos de Usuario Actualizados'] },
  { label: '\u2699\ufe0f Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Exportación PDF'] },
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
    'gestión cat\u00e1logo',
    'actualización de datos',
    'actualización de perfil',
    'alta desde gestión de usuarios',
    'edición desde gestión de usuarios',
    'cambio de estado desde gestión de usuarios',
    'permisos aplicados de inmediato',
    'permisos guardados para pr\u00f3xima sesión',
    'editor masivo',
    'restauración manual desde el historial',
    'limpieza de historial',
    'eliminación permanente',
    'exportación de cat\u00e1logo',
    'gestión de pedidos',
    'conversión desde presupuesto',
    'cobro manual en pedidos',
    'entrega finalizada',
    'se retuvo la se\u00f1a',
    'se devolvi\u00f3 la se\u00f1a',
    'cierre silencioso',
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
