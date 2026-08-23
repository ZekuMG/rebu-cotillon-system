// El número que ve una persona para un presupuesto o un pedido. La base guarda
// UUIDs de 36 caracteres, imposibles de dictar por teléfono o de leer en un
// mensaje, así que en pantalla siempre se muestran los primeros 8 en mayúscula.
// Vive acá para que la lista de presupuestos, los pedidos y lo que se manda por
// WhatsApp digan EXACTAMENTE el mismo número.
export const formatRecordCode = (id) => {
  const corto = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ID-${corto || 'SINID'}`;
};
