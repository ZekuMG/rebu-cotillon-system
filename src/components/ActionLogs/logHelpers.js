// src/components/ActionLogs/logHelpers.js

export const getDetailTitle = (action) => {
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
    'Gasto': 'Comprobante de Gasto',
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
    'Login': 'Inicio de Sesión',
    'Exportación PDF': 'Documento Generado',
    'Oferta Creada': 'Nueva Oferta/Combo',
    'Oferta Editada': 'Modificación de Oferta',
    'Oferta Eliminada': 'Baja de Oferta'
  };
  return titles[action] || 'Detalles del Registro';
};

export const getDetailIcon = (action) => {
  const icons = {
    'Venta Realizada': '🛒', 'Venta Anulada': '❌', 'Venta Restaurada': '♻️',
    'Modificación Pedido': '📝', 'Venta Modificada': '📝',
    'Apertura de Caja': '💰', 'Cierre de Caja': '🔒', 'Cierre Automático': '⏰',
    'Edición Producto': '✏️', 'Alta de Producto': '📦', 'Baja Producto': '🗑️',
    'Producto Duplicado': '📋',
    'Categoría': '🏷️', 'Edición Masiva Categorías': '🏷️', 'Actualización Masiva': '🏷️',
    'Nuevo Socio': '👤', 'Edición de Socio': '👤', 'Edición de Puntos': '🏆', 'Baja de Socio': '👤',
    'Nuevo Gasto': '📉', 'Gasto': '📉',
    'Nuevo Premio': '🎁', 'Editar Premio': '🎁', 'Eliminar Premio': '🎁',
    'Login': '🔑', 'Horario Modificado': '🕐', 'Sistema Iniciado': '⚡',
    'Venta Eliminada': '🗑️',
    'Exportación PDF': '📄',
    'Oferta Creada': '🎫', 'Oferta Editada': '🎫', 'Oferta Eliminada': '🎫'
  };
  return icons[action] || '📄';
};

export const getDetailColor = (action) => {
  const colors = {
    'Venta Realizada': 'green', 'Apertura de Caja': 'green', 'Venta Restaurada': 'green', 
    'Venta Anulada': 'red', 'Baja Producto': 'red', 'Baja de Socio': 'red', 'Eliminar Premio': 'red', 'Venta Eliminada': 'red', 'Nuevo Gasto': 'red', 'Gasto': 'red', 'Oferta Eliminada': 'red',
    'Alta de Producto': 'blue', 'Edición Producto': 'blue', 'Producto Duplicado': 'blue',
    'Nuevo Socio': 'blue', 'Edición de Socio': 'blue', 
    'Edición de Puntos': 'violet', 'Nuevo Premio': 'violet', 'Editar Premio': 'violet', 'Oferta Creada': 'violet', 'Oferta Editada': 'violet',
    'Modificación Pedido': 'amber', 'Venta Modificada': 'amber', 'Categoría': 'amber', 'Actualización Masiva': 'amber', 'Edición Masiva Categorías': 'amber', 'Horario Modificado': 'amber',
    'Cierre de Caja': 'slate', 'Cierre Automático': 'slate', 'Login': 'slate', 'Sistema Iniciado': 'slate',
    'Exportación PDF': 'indigo'
  };
  return colors[action] || 'slate';
};

export const ACTION_GROUPS = [
  { label: '💰 Caja', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático'] },
  { label: '🛒 Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Venta Restaurada', 'Venta Modificada', 'Venta Eliminada'] }, 
  { label: '📉 Gastos', actions: ['Nuevo Gasto'] },
  { label: '📦 Productos', actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado'] },
  { label: '🎫 Ofertas', actions: ['Oferta Creada', 'Oferta Editada', 'Oferta Eliminada'] },
  { label: '👤 Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '🎁 Premios', actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '🏷️ Categorías', actions: ['Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '⚙️ Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Exportación PDF'] }
];

export const extractRealNote = (log) => {
  if (!log) return null;
  
  let r = log.reason;
  let d = log.details;
  
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { d = {}; }
  } else if (!d) {
    d = {};
  }

  const generics = [
    'venta regular', 'salida de dinero', 'sin motivo', 'ajuste manual', 
    'anulación manual', 'registro manual', 'producto nuevo', 'inicio de operaciones', 
    'gasto general', 'ajuste de horario', 'duplicado desde editor', 'gestión catálogo',
    'actualización de datos', 'restauración manual desde el historial', 'limpieza de historial',
    'eliminación permanente', 'exportación de catálogo'
  ];

  if (r && typeof r === 'string' && r.trim() !== '') {
      const cleanR = r.trim();
      const lowerR = cleanR.toLowerCase();
      
      if (!generics.includes(lowerR)) {
          if (!((log.action === 'Nuevo Gasto' || log.action === 'Gasto') && lowerR === (d.category || '').toLowerCase())) {
              return cleanR;
          }
      }
  }

  const candidates = [d.description, d.note, d.reason, d.extraInfo];

  for (let cand of candidates) {
     if (typeof cand === 'string' && cand.trim() !== '') {
         const clean = cand.trim();
         const lower = clean.toLowerCase();
         if (!generics.includes(lower)) {
             if ((log.action === 'Nuevo Gasto' || log.action === 'Gasto') && lower === (d.category || '').toLowerCase()) continue;
             return clean;
         }
     }
  }
  
  return null;
};
