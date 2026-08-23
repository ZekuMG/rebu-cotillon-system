/**
 * Utilidades para gestión de Etiquetas (Tags), Estados de No Leído / Silenciado
 * e Historial de Ventas de Socios en la bandeja de WhatsApp.
 */

export const REBU_WA_TAGS_STORAGE_KEY = 'rebu:whatsapp:chat_tags';
export const REBU_WA_UNREAD_STORAGE_KEY = 'rebu:whatsapp:marked_unread_phones';
export const REBU_WA_MUTED_STORAGE_KEY = 'rebu:whatsapp:muted_phones';
export const REBU_WA_ALIASES_STORAGE_KEY = 'rebu:whatsapp:contact_aliases_v1';

export const SYSTEM_TAGS = [
  {
    id: 'budget',
    label: 'Presupuesto',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.28)',
  },
  {
    id: 'order',
    label: 'Pedido',
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.28)',
  },
  {
    id: 'wholesale',
    label: 'Mayorista',
    color: '#7c3aed',
    bg: 'rgba(124, 58, 237, 0.12)',
    border: 'rgba(124, 58, 237, 0.28)',
  },
  {
    id: 'vip',
    label: 'Cliente Frecuente',
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.28)',
  },
  {
    id: 'urgent',
    label: 'Urgente',
    color: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.28)',
  },
  {
    id: 'claim',
    label: 'Reclamo / Duda',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.28)',
  },
  {
    id: 'cotillon',
    label: 'Cotillón / Evento',
    color: '#0d9488',
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.28)',
  },
];

export const getTagById = (tagId) => (
  SYSTEM_TAGS.find((t) => t.id === tagId) || {
    id: tagId,
    label: tagId,
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.28)',
  }
);

/**
 * Carga el mapa de etiquetas desde localStorage.
 * @returns {Record<string, string[]>} mapa de phone -> [tagId, ...]
 */
export const loadChatTags = () => {
  try {
    const raw = window.localStorage.getItem(REBU_WA_TAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};
/**
 * Guarda el mapa de etiquetas en localStorage.
 * @param {Record<string, string[]>} tagsMap
 */
export const saveChatTags = (tagsMap) => {
  try {
    window.localStorage.setItem(REBU_WA_TAGS_STORAGE_KEY, JSON.stringify(tagsMap || {}));
  } catch {
    // Manejo de error silencioso en cuotas de almacenamiento
  }
};

/**
 * Obtiene las etiquetas de un teléfono específico.
 * @param {Record<string, string[]>} tagsMap
 * @param {string} phone
 * @returns {Array<{ id: string, label: string, color: string, bg: string, border: string }>}
 */
export const getTagsForPhone = (tagsMap = {}, phone = '') => {
  if (!phone) return [];
  const tagIds = tagsMap[String(phone)] || [];
  return tagIds.map(getTagById);
};

/**
 * Alterna una etiqueta para un teléfono dado.
 * @param {Record<string, string[]>} tagsMap
 * @param {string} phone
 * @param {string} tagId
 * @returns {Record<string, string[]>} nuevo mapa
 */
export const toggleTagForPhone = (tagsMap = {}, phone = '', tagId = '') => {
  if (!phone || !tagId) return tagsMap;
  const key = String(phone);
  const currentTags = Array.isArray(tagsMap[key]) ? tagsMap[key] : [];
  const nextTags = currentTags.includes(tagId)
    ? currentTags.filter((id) => id !== tagId)
    : [...currentTags, tagId];

  const nextMap = { ...tagsMap };
  if (nextTags.length > 0) {
    nextMap[key] = nextTags;
  } else {
    delete nextMap[key];
  }
  saveChatTags(nextMap);
  return nextMap;
};

/**
 * Carga el conjunto de teléfonos marcados como no leídos.
 * @returns {Set<string>}
 */
export const loadMarkedUnreadPhones = () => {
  try {
    const raw = window.localStorage.getItem(REBU_WA_UNREAD_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
};

/**
 * Guarda el conjunto de teléfonos marcados como no leídos.
 * @param {Set<string>|string[]} phones
 */
export const saveMarkedUnreadPhones = (phones) => {
  try {
    const array = Array.from(phones || []).map(String);
    window.localStorage.setItem(REBU_WA_UNREAD_STORAGE_KEY, JSON.stringify(array));
  } catch {
    // Silencioso
  }
};

/**
 * Carga el conjunto de teléfonos silenciados.
 * @returns {Set<string>}
 */
export const loadMutedPhones = () => {
  try {
    const raw = window.localStorage.getItem(REBU_WA_MUTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
};

/**
 * Guarda el conjunto de teléfonos silenciados.
 * @param {Set<string>|string[]} phones
 */
export const saveMutedPhones = (phones) => {
  try {
    const array = Array.from(phones || []).map(String);
    window.localStorage.setItem(REBU_WA_MUTED_STORAGE_KEY, JSON.stringify(array));
  } catch {
    // Silencioso
  }
};

/**
 * Normaliza dígitos telefónicos para comparaciones.
 * @param {string|number} value
 * @returns {string}
 */
const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

/**
 * Calcula métricas y resumen de ventas para un socio o cliente vinculado.
 * @param {object} member
 * @param {Array<object>} transactions
 * @returns {{
 *   totalSpent: number,
 *   ticketCount: number,
 *   averageTicket: number,
 *   lastPurchaseDate: string | null,
 *   recentTransactions: Array<object>,
 * }}
 */
export const calculateMemberSalesStats = (member, transactions = []) => {
  if (!member || !Array.isArray(transactions) || transactions.length === 0) {
    return {
      totalSpent: 0,
      ticketCount: 0,
      averageTicket: 0,
      lastPurchaseDate: null,
      recentTransactions: [],
    };
  }

  const memberId = member.id != null ? String(member.id) : '';
  const memberNum = (member.memberNumber ?? member.member_number) != null
    ? String(member.memberNumber ?? member.member_number)
    : '';
  const memberDni = member.dni ? String(member.dni).trim() : '';
  const memberPhoneDigits = normalizeDigits(member.phone || member.phoneNumber || member.telephone);

  const matched = transactions.filter((tx) => {
    if (!tx || ['voided', 'deleted'].includes(tx.status)) return false;
    const client = tx.client;
    if (!client) return false;

    if (typeof client === 'object') {
      if (memberId && String(client.id) === memberId) return true;
      if (memberNum && String(client.memberNumber || client.number || '') === memberNum) return true;
      if (memberDni && String(client.dni || '').trim() === memberDni) return true;
      if (memberPhoneDigits && normalizeDigits(client.phone || client.phoneNumber) === memberPhoneDigits) {
        return true;
      }
    }
    return false;
  });

  const sorted = [...matched].sort((a, b) => {
    const dateA = new Date(a.date || a.created_at).getTime() || 0;
    const dateB = new Date(b.date || b.created_at).getTime() || 0;
    return dateB - dateA;
  });

  const totalSpent = sorted.reduce((sum, tx) => sum + Number(tx.total || 0), 0);
  const ticketCount = sorted.length;
  const averageTicket = ticketCount > 0 ? totalSpent / ticketCount : 0;
  const lastPurchaseDate = sorted.length > 0 ? (sorted[0].date || sorted[0].created_at) : null;

  return {
    totalSpent,
    ticketCount,
    averageTicket,
    lastPurchaseDate,
    recentTransactions: sorted.slice(0, 5),
  };
};

/**
 * Carga el mapa de apodos / nombres personalizados desde localStorage.
 * @returns {Record<string, string>} mapa de phone -> alias
 */
export const loadContactAliases = () => {
  try {
    const raw = window.localStorage.getItem(REBU_WA_ALIASES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Guarda el mapa de apodos en localStorage.
 * @param {Record<string, string>} aliasesMap
 */
export const saveContactAliases = (aliasesMap) => {
  try {
    window.localStorage.setItem(REBU_WA_ALIASES_STORAGE_KEY, JSON.stringify(aliasesMap || {}));
  } catch {
    // Silencioso
  }
};

/**
 * Asigna o elimina el apodo / nombre personalizado para un teléfono.
 * @param {Record<string, string>} aliasesMap
 * @param {string} phone
 * @param {string} alias
 * @returns {Record<string, string>}
 */
export const setContactAlias = (aliasesMap, phone, alias) => {
  const next = { ...(aliasesMap || {}) };
  const key = String(phone || '').trim();
  if (!key) return next;
  const cleanAlias = String(alias || '').trim();
  if (cleanAlias) {
    next[key] = cleanAlias;
  } else {
    delete next[key];
  }
  saveContactAliases(next);
  return next;
};

/**
 * Partes numéricas para comparación flexible de teléfonos.
 */
export const extractPhoneParts = (value) => {
  const digits = normalizeDigits(value);
  if (!digits) return { full: '', national: '', subscriber: '' };
  let national = digits;
  if (national.startsWith('549') && national.length >= 13) national = national.slice(3);
  else if (national.startsWith('54') && national.length >= 12) national = national.slice(2);
  else if (national.startsWith('0') && national.length >= 11) national = national.slice(1);
  if (national.length > 10) national = national.slice(-10);
  return {
    full: digits,
    national,
    subscriber: national.length >= 8 ? national.slice(-8) : '',
  };
};

/**
 * Resuelve el nombre del contacto según la jerarquía de prioridad:
 * 1. Apodo personalizado en Rebu
 * 2. Nombre agendado en Agenda de Rebu
 * 3. Nombre agendado / guardado en el teléfono (saved_name / contact_name)
 * 4. Nombre del socio en Rebu Socios
 * 5. Nombre original de WhatsApp (customer_name / push_name / verified_name)
 * 6. Fallback a Contacto XXXX o teléfono
 */
export const resolveContactName = (row, {
  aliases = {},
  agendaContacts = [],
  members = [],
} = {}) => {
  if (!row && typeof row !== 'string') return 'Contacto';
  const targetPhone = typeof row === 'string' ? String(row).trim() : String(row?.phone || '').trim();

  // 1. Apodo o nombre personalizado guardado en Rebu
  if (targetPhone && aliases[targetPhone]?.trim()) {
    return aliases[targetPhone].trim();
  }

  // 2. Nombre agendado en Agenda de Rebu
  if (targetPhone && Array.isArray(agendaContacts) && agendaContacts.length > 0) {
    const targetParts = extractPhoneParts(targetPhone);
    if (targetParts.full) {
      const match = agendaContacts.find((c) => {
        const cParts = extractPhoneParts(c.phone || c.phoneNumber || c.telephone);
        return (
          cParts.full && (
            cParts.full === targetParts.full
            || (cParts.subscriber && cParts.subscriber === targetParts.subscriber && cParts.national === targetParts.national)
          )
        );
      });
      if (match?.name?.trim()) return match.name.trim();
    }
  }

  // 3. Nombre agendado en el teléfono / reportado por WhatsApp
  if (typeof row === 'object' && row) {
    const saved = row.saved_name?.trim() || row.contact_name?.trim() || row.agenda_name?.trim();
    if (saved && !saved.startsWith('549') && !saved.startsWith('+54') && saved !== targetPhone) {
      return saved;
    }
  }

  // 4. Socio vinculado en Rebu Socios
  if (targetPhone && Array.isArray(members) && members.length > 0) {
    const targetParts = extractPhoneParts(targetPhone);
    if (targetParts.full) {
      const match = members.find((m) => {
        const mParts = extractPhoneParts(m.phone || m.phoneNumber || m.telephone || m.customer_phone);
        return (
          mParts.full && (
            mParts.full === targetParts.full
            || (mParts.subscriber && mParts.subscriber === targetParts.subscriber && mParts.national === targetParts.national)
          )
        );
      });
      const memberName = match?.name?.trim() || match?.displayName?.trim();
      if (memberName) return memberName;
    }
  }

  // 5. Nombre original de WhatsApp
  if (typeof row === 'object' && row) {
    const push = row.customer_name?.trim()
      || row.push_name?.trim()
      || row.pushname?.trim()
      || row.verified_name?.trim()
      || row.notify_name?.trim()
      || (row.name && row.name !== targetPhone ? row.name.trim() : '');
    if (push && !push.startsWith('549') && !push.startsWith('+54') && push !== targetPhone) {
      return push;
    }
  }

  // 6. Fallback
  if (targetPhone) {
    return `Contacto ${targetPhone.slice(-4)}`;
  }
  return 'Contacto';
};
