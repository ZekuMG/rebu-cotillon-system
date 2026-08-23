// Progreso real de la carga de la bandeja de WhatsApp.
//
// Por qué existe: antes la bandeja mostraba sólo un spinner con "Preparando la
// bandeja" y el operador no tenía forma de saber si faltaban 2 segundos o 2
// minutos. Las consultas de arranque tardan ~390 ms medidos, así que cuando la
// espera se estira NO es por volumen de datos: es que el bot está caído o
// reconectando. Por eso la barra separa "llegar al bot" de "traer las
// conversaciones" y avisa cuando se pasa de lo normal.
//
// Regla que no se negocia: la barra no miente. Sólo la fase 'ready' llega a
// 100. Mientras se espera, el avance se acerca al tope sin tocarlo, así una
// barra clavada en 98 nunca se lee como "ya está".

export const INBOX_SLOW_MS = 10000;

// ---------------------------------------------------------------------------
// Tamaños de lote. Están todos acá, juntos, para poder subirlos sin salir a
// buscarlos por la vista ni por el cliente HTTP: `whatsappOperator` los importa
// de este archivo como valores por defecto.
// ---------------------------------------------------------------------------

// Conversaciones por pedido a la bandeja. Chico a propósito: el operador ve las
// primeras 10 casi enseguida y puede empezar a laburar mientras el resto sigue
// llegando, en vez de mirar una pantalla vacía hasta tener todo.
export const INBOX_PAGE_SIZE = 10;

// Mensajes que se traen al abrir un chat. Los anteriores llegan al scrollear,
// con el cursor que ya existía. Abrir un chat no tiene por qué bajar la
// conversación entera.
export const CONVERSATION_PAGE_SIZE = 10;

// Tamaño de los lotes que se traen solos, en segundo plano, DESPUÉS del
// primero. El primero es chico (10) para pintar la bandeja enseguida; a partir
// del segundo ya no hay nadie esperando una pantalla, así que conviene el lote
// grande: el bot acepta hasta 80 por pedido y una bandeja de ~500
// conversaciones se completa en 6 pedidos en vez de 50.
export const INBOX_BACKGROUND_PAGE_SIZE = 80;

// Tope de conversaciones que la bandeja trae sola, en segundo plano, sin que
// nadie scrollee. Con lotes de 80 llegar hasta acá cuesta pocos pedidos, así
// que el tope puede cubrir una bandeja entera en vez de cortar a las 50.
export const INBOX_BACKGROUND_MAX = 500;

// Techo de la fase de conexión: hasta acá se puede llegar sin haber recibido
// un solo dato. El resto de la barra queda reservado para lo que sí se contó.
export const INBOX_CONNECTING_CAP = 45;
// Techo mientras se traen conversaciones. Nunca 100: eso es sólo 'ready'.
export const INBOX_FETCHING_CAP = 99;

// Cuánto tarda el avance en llegar a la mitad de su tramo. No es una medición
// del backend, es el ritmo con el que se mueve la barra mientras se espera.
const CONNECTING_HALF_MS = 4000;
const FETCHING_HALF_ITEMS = 40;

const PHASES = ['connecting', 'fetching', 'ready'];

const normalizePhase = (value) => (
  PHASES.includes(value) ? value : 'connecting'
);

// Un contador nunca puede ser negativo ni NaN: si viene roto se toma como 0.
const normalizeCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
};

// El total es distinto de un contador: 0, negativo o NaN significa "no se
// sabe", y no saber es un estado válido (el bot no devuelve un total).
const normalizeTotal = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.floor(total);
};

// Avance que se acerca al tope sin alcanzarlo nunca: en `half` va por la mitad
// del tramo y de ahí en más sigue subiendo cada vez más despacio.
const asymptotic = (value, half) => {
  if (!(value > 0)) return 0;
  return value / (value + half);
};

const plural = (count, singular, pluralWord) => (
  count === 1 ? singular : pluralWord
);

const describeDetail = (loaded, total) => {
  if (total !== null) {
    const shown = Math.min(loaded, total);
    return `${shown} de ${total} ${plural(total, 'conversación', 'conversaciones')}`;
  }
  if (loaded > 0) {
    return `${loaded} ${plural(loaded, 'conversación', 'conversaciones')}`;
  }
  return '';
};

// Une el lote que acaba de llegar con lo que ya estaba en pantalla.
//
// Dos cosas que no se pueden romper al pegar lotes:
// 1. Nada duplicado: el mismo teléfono puede volver en otro lote si mientras
//    tanto entró un mensaje y la conversación cambió de lugar. Gana la versión
//    nueva, que trae el último mensaje y los no leídos al día.
// 2. Nada se mueve de lugar solo: una conversación que ya estaba conserva su
//    posición y las nuevas se agregan al final. El orden final igual lo decide
//    la vista (compareConversationActivity / compareConversationAttention),
//    pero así no parpadea entre lote y lote.
//
// Las filas sin teléfono se descartan: sin teléfono no se pueden identificar
// (ni abrir), así que dejarlas pasar sólo genera repetidos.
export const mergeConversationBatches = (current, incoming) => {
  const merged = new Map();
  const push = (rows) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      const phone = String(row?.phone || '').trim();
      if (!phone) return;
      const existing = merged.get(phone);
      if (existing) {
        merged.set(phone, {
          ...existing,
          ...row,
          customer_name: row?.customer_name?.trim() || existing?.customer_name || null,
          saved_name: row?.saved_name?.trim() || existing?.saved_name || null,
          contact_name: row?.contact_name?.trim() || existing?.contact_name || null,
          push_name: row?.push_name?.trim() || existing?.push_name || null,
          name: row?.name?.trim() || existing?.name || null,
        });
      } else {
        merged.set(phone, row);
      }
    });
  };
  push(current);
  push(incoming);
  return [...merged.values()];
};

// Cuántos pedidos de segundo plano se permiten como mucho. Es el mismo tope
// contado en pedidos en vez de en conversaciones: el primer lote es chico y el
// resto viene en lotes grandes, más un pedido de margen.
export const INBOX_BACKGROUND_MAX_BATCHES = Math.ceil(
  INBOX_BACKGROUND_MAX / INBOX_BACKGROUND_PAGE_SIZE,
) + 1;

// ¿Sigo trayendo lotes solo o ya está bien? Sin cursor no hay más nada que
// pedir; con el tope alcanzado se corta y lo que falte llega por scroll.
export const shouldPrefetchMore = ({ loaded, cursor, batches, max } = {}) => {
  if (!String(cursor || '').trim()) return false;
  // Segundo freno, por cantidad de pedidos: si el bot llegara a devolver lotes
  // repetidos, el contador de conversaciones no crecería y la cadena no se
  // cortaría nunca. Contar los pedidos corta igual.
  if (normalizeCount(batches) >= INBOX_BACKGROUND_MAX_BATCHES) return false;
  const limit = normalizeTotal(max) ?? INBOX_BACKGROUND_MAX;
  return normalizeCount(loaded) < limit;
};

export const describeInboxProgress = ({
  phase,
  loaded,
  total,
  elapsedMs,
} = {}) => {
  const safePhase = normalizePhase(phase);
  const safeLoaded = normalizeCount(loaded);
  const safeTotal = normalizeTotal(total);
  const safeElapsed = normalizeCount(elapsedMs);
  const isSlow = safeElapsed > INBOX_SLOW_MS;

  if (safePhase === 'ready') {
    return {
      phase: 'ready',
      percent: 100,
      label: 'Listo',
      detail: describeDetail(safeLoaded, safeTotal),
      isSlow,
    };
  }

  if (safePhase === 'fetching') {
    const span = INBOX_FETCHING_CAP - INBOX_CONNECTING_CAP;
    // Con total conocido el avance es proporcional de verdad. Sin total, se
    // usa lo que llegó (o el tiempo, si todavía no llegó nada) para moverse
    // sin prometer un final que no se conoce.
    const ratio = safeTotal !== null
      ? Math.min(safeLoaded / safeTotal, 1)
      : (safeLoaded > 0
        ? asymptotic(safeLoaded, FETCHING_HALF_ITEMS)
        : asymptotic(safeElapsed, CONNECTING_HALF_MS));
    return {
      phase: 'fetching',
      percent: Math.min(
        // Redondear para abajo: así el avance que se acerca al techo sin
        // llegar tampoco lo alcanza por redondeo.
        Math.floor(INBOX_CONNECTING_CAP + (span * ratio)),
        INBOX_FETCHING_CAP,
      ),
      label: 'Trayendo conversaciones…',
      detail: describeDetail(safeLoaded, safeTotal),
      isSlow,
    };
  }

  return {
    phase: 'connecting',
    percent: Math.floor(INBOX_CONNECTING_CAP * asymptotic(safeElapsed, CONNECTING_HALF_MS)),
    label: 'Conectando con WhatsApp…',
    detail: describeDetail(safeLoaded, safeTotal),
    isSlow,
  };
};
