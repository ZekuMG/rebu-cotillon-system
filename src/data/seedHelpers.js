// src/data/seedHelpers.js
// ♻️ REFACTOR: Helpers de fecha/hora extraídos de data.js para uso compartido entre seeds

/**
 * Genera string de fecha en formato dd/mm/yyyy relativo a hoy
 * @param {number} daysAgo - Cantidad de días hacia atrás
 * @returns {string} Fecha formateada en locale es-AR
 */
export const getDateStr = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Genera string de hora en formato HH:MM
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minutos (0-59)
 * @returns {string} Hora formateada
 */
export const getTimeStr = (hour, minute) => {
  return `${hour.toString().padStart(2, '0')}:${minute
    .toString()
    .padStart(2, '0')}`;
};
