// src/utils/helpers.js
// ♻️ REFACTOR: Funciones helper centralizadas para evitar código duplicado (DRY)

/**
 * Formatea un precio sin decimales, redondeando hacia arriba.
 * Utiliza formato argentino (es-AR) con separador de miles.
 * @param {number|string} amount - El monto a formatear
 * @returns {string} - El precio formateado
 */
export const formatPrice = (amount) => {
    return Math.ceil(Number(amount) || 0).toLocaleString('es-AR');
  };
  
  /**
   * Convierte una hora en formato 12h (AM/PM) a formato 24h.
   * Si ya está en formato 24h, la devuelve tal cual.
   * @param {string} timeStr - La hora a convertir (ej: "2:30 PM", "14:30")
   * @returns {string} - La hora en formato 24h (ej: "14:30")
   */
  export const formatTime24 = (timeStr) => {
    if (!timeStr) return '--:--';
    
    // Si ya parece formato 24h sin AM/PM, devolverla
    if (/^\d{1,2}:\d{2}$/.test(timeStr) && !timeStr.toLowerCase().includes('m')) {
      return timeStr;
    }
    
    // Intentar parsear formato con AM/PM
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = match[3]?.toLowerCase().replace(/[\s.]/g, '') || '';
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
    
    return timeStr;
  };
  
  /**
   * Genera un gradiente único basado en el ID de un producto.
   * Usado para placeholders de imágenes de productos.
   * @param {number|string} id - ID del producto
   * @param {string} title - Título del producto (fallback)
   * @returns {string} - Clases de Tailwind para el gradiente
   */
  export const getGradientForItem = (id, title) => {
    const gradients = [
      'from-violet-500 to-purple-600',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-amber-500',
      'from-pink-500 to-rose-500',
      'from-indigo-500 to-blue-600',
      'from-fuchsia-500 to-pink-600',
      'from-teal-500 to-green-500',
      'from-red-500 to-orange-500',
      'from-cyan-500 to-blue-500',
    ];
    
    const index = (typeof id === 'number' ? id : title.length) % gradients.length;
    return gradients[index];
  };
  
  /**
   * Normaliza una fecha en formato argentino (DD/MM/YYYY) a un objeto parseado.
   * @param {string} dateStr - La fecha a normalizar
   * @returns {object|null} - Objeto con day, month, year, str o null si inválido
   */
  /**
   * Determina si un log corresponde a una venta.
   * Usado en HistoryView y DashboardView para filtrar logs de ventas.
   * @param {object} log - Entrada de log
   * @returns {boolean}
   */
  export const isVentaLog = (log) => {
    const action = log.action || '';
    return action === 'Venta Realizada' || action === 'Nueva Venta';
  };

  /**
   * Calcula el total de una venta a partir de los detalles del log.
   * Maneja tanto details.total directo como suma de items.
   * @param {object} details - Detalles de la venta del log
   * @returns {number} - Total calculado
   */
  export const getVentaTotal = (details) => {
    if (!details) return 0;
    if (details.total !== undefined) return Number(details.total) || 0;
    if (details.items && Array.isArray(details.items)) {
      return details.items.reduce((sum, item) => {
        return (
          sum +
          (Number(item.price) || 0) *
            (Number(item.qty) || Number(item.quantity) || 0)
        );
      }, 0);
    }
    return 0;
  };

  export const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split(',')[0].trim();
    const parts = cleanDate.split('/');
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      return { day, month, year, str: `${day}/${month}/${year}` };
    }
    return null;
  };
  