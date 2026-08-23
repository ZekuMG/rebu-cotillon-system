/**
 * Normaliza una cadena de texto para búsquedas en la bandeja de WhatsApp.
 * Elimina acentos, convierte a minúsculas y quita espacios sobrantes.
 *
 * @param {string} value
 * @returns {string}
 */
export const normalizeSearchText = (value = '') => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
);

/**
 * Determina si una fila corresponde a una conversación de prueba.
 *
 * @param {object} row
 * @returns {boolean}
 */
export const isTestConversation = (row) => row?.latest_message?.metadata?.test_fixture === true;

/**
 * Calcula la prioridad y el tono de color de una conversación según el tiempo transcurrido sin responder.
 * Regla:
 * - < 5 min: 'unanswered' (gris / neutro)
 * - 5 min a 1 hora (5 - 59 min): 'unanswered-green' (verde)
 * - 1 hora a 3 horas (60 - 179 min): 'unanswered-yellow' (amarillo)
 * - Más de 3 horas (>= 180 min): 'unanswered-red' (rojo)
 * - Mensajes salientes o de prueba: null (no aplica)
 *
 * @param {object} row
 * @param {number} [now=Date.now()]
 * @returns {{ tone: string, color: string, minutes: number, label: string } | null}
 */
export const unansweredPriority = (row, now = Date.now()) => {
  const message = row?.latest_message;
  if (isTestConversation(row)) return null;
  if (!message || message.direction !== 'outbound') {
    const rawTime = row?.latest_message?.created_at || row?.last_inbound_at || row?.updated_at;
    const date = new Date(rawTime);
    if (!Number.isNaN(date.getTime())) {
      const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
      if (minutes >= 180) {
        return { tone: 'unanswered-red', color: 'red', minutes, label: 'Sin responder (+3h)' };
      }
      if (minutes >= 60) {
        return { tone: 'unanswered-yellow', color: 'yellow', minutes, label: 'Sin responder (1-3h)' };
      }
      if (minutes >= 5) {
        return { tone: 'unanswered-green', color: 'green', minutes, label: 'Sin responder (5m-1h)' };
      }
      return { tone: 'unanswered', color: 'gray', minutes, label: 'Sin responder' };
    }
    return { tone: 'unanswered', color: 'gray', minutes: 0, label: 'Sin responder' };
  }
  return null;
};
