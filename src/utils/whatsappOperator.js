import { supabase } from '../supabase/client';
// Los tamaños de lote viven en un solo lugar, en `inboxLoadProgress.js`, para
// poder moverlos sin tocar este archivo ni la vista.
import { CONVERSATION_PAGE_SIZE, INBOX_PAGE_SIZE } from './inboxLoadProgress';

const OPERATOR_PREFIX = '/api/operator';
const ENABLE_AUTHENTICATED_OPERATOR_SESSION = import.meta.env.VITE_REBU_WHATSAPP_AUTH_SESSION === '1';

const getAccessToken = async () => {
  let token = '';
  if (ENABLE_AUTHENTICATED_OPERATOR_SESSION) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || '';
    } catch {
      token = '';
    }
    // Antes, si no habia sesion en memoria, se leia el token CRUDO de
    // localStorage. Eso saltea la renovacion de supabase-js y manda un token
    // viejo: con la sesion persistida es un error garantizado. Se pide la
    // renovacion por la via normal y, si no sale, se cae a la anon key.
    if (!token) {
      try {
        const { data } = await supabase.auth.refreshSession();
        token = data?.session?.access_token || '';
      } catch {
        token = '';
      }
    }
  }
  if (!token) {
    token = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'rebu-operator-session';
  }
  return token;
};

const parseResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  const error = new Error(body?.error || 'No se pudo comunicar con WhatsApp.');
  error.code = body?.error || 'operator_request_failed';
  error.status = response.status;
  throw error;
};

const request = async (path, {
  method = 'GET',
  body,
  idempotencyKey,
  timeoutMs = path.endsWith('/messages/catalog-media') ? 120000 : 45000,
} = {}) => {
  const accessToken = await getAccessToken();
  const requestPayload = {
    path: `${OPERATOR_PREFIX}${path}`,
    method,
    accessToken,
    body: body ?? null,
    idempotencyKey: idempotencyKey || null,
  };

  if (window.electronAPI?.whatsappBotRequest) {
    const result = await window.electronAPI.whatsappBotRequest(requestPayload);
    if (result?.ok) return result.body;
    const error = new Error(result?.body?.error || result?.error || 'No se pudo comunicar con WhatsApp.');
    error.code = result?.body?.error || result?.error || 'operator_request_failed';
    error.status = result?.status || 0;
    throw error;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await parseResponse(await fetch(`/bot-api${OPERATOR_PREFIX}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } catch (requestError) {
    if (requestError?.name !== 'AbortError') throw requestError;
    const timeoutError = new Error('WhatsApp tardó demasiado en responder. Intentá nuevamente.');
    timeoutError.code = 'bot_request_timeout';
    throw timeoutError;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const whatsappOperator = {
  summary: () => request('/summary'),
  overview: ({
    limit = INBOX_PAGE_SIZE,
    cursor = '',
    filter = 'all',
    search = '',
  } = {}) => request(
    `/overview?limit=${encodeURIComponent(limit)}&filter=${encodeURIComponent(filter)}`
      + `${search ? `&search=${encodeURIComponent(search)}` : ''}`
      + `${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  conversation: (phone, { limit = CONVERSATION_PAGE_SIZE, cursor = '' } = {}) => request(
    `/conversations/${encodeURIComponent(phone)}?limit=${encodeURIComponent(limit)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  conversationActivity: (phone) => request(
    `/conversations/${encodeURIComponent(phone)}/activity`,
  ),
  // Desde cuándo muestra la bandeja las conversaciones de este número.
  // Elegir ver menos NO borra nada: mueve una fecha, y siempre se puede volver.
  //
  // ⚠️ Son DOS cosas distintas y no hay que confundirlas:
  //   - importChats        → baja conversaciones DEL TELÉFONO (WhatsApp)
  //   - historyWindowOlder → muestra lo que Rebu YA TIENE guardado
  // Que el mismo botón hiciera lo segundo diciendo lo primero era el bug.
  historyWindow: () => request('/history-window'),
  setHistoryWindow: (mode) => request('/history-window', {
    method: 'POST',
    body: { mode },
  }),
  historyWindowOlder: (batchSize = INBOX_PAGE_SIZE) => request('/history-window/older', {
    method: 'POST',
    body: { batchSize },
  }),
  // Trae conversaciones reales del teléfono. `batchSize` va topeado a 50 y
  // `messagesPerChat` a 200 del lado del bot: no hace falta cuidarlo acá.
  importChats: (batchSize = 10, messagesPerChat = 50) => request('/import-chats', {
    method: 'POST',
    body: { batchSize, messagesPerChat },
  }),
  profilePictures: (phones, { refresh = false } = {}) => request('/profiles', {
    method: 'POST',
    body: { phones, refresh },
  }),
  markRead: (phone) => request(`/conversations/${encodeURIComponent(phone)}/read`, {
    method: 'POST',
  }),
  archiveConversation: (phone) => request(`/conversations/${encodeURIComponent(phone)}/archive`, {
    method: 'POST',
  }),
  deleteConversation: (phone, confirmation) => request(`/conversations/${encodeURIComponent(phone)}`, {
    method: 'DELETE',
    body: { confirmation },
  }),
  quickReplies: (phone, { refresh = false, sourceMessageId = null } = {}) => request(
    `/conversations/${encodeURIComponent(phone)}/suggestions`,
    { method: 'POST', body: { refresh, sourceMessageId } },
  ),
  acquireTypingLock: (phone, lockToken) => request(
    `/conversations/${encodeURIComponent(phone)}/typing-acquire`,
    { method: 'POST', body: { lockToken } },
  ),
  releaseTypingLock: (phone, lockToken) => request(
    `/conversations/${encodeURIComponent(phone)}/typing-release`,
    { method: 'POST', body: { lockToken } },
  ),
  setMode: (mode) => request('/mode', { method: 'POST', body: { mode } }),
  takeConversation: (phone) => request(`/conversations/${encodeURIComponent(phone)}/take`, {
    method: 'POST',
  }),
  releaseConversation: (phone) => request(`/conversations/${encodeURIComponent(phone)}/release`, {
    method: 'POST',
  }),
  sendMessage: ({
    phone,
    content,
    attachment = null,
    sourceMessageId = null,
    idempotencyKey = null,
  }) => request('/messages', {
    method: 'POST',
    body: { phone, content, attachment, sourceMessageId },
    idempotencyKey: idempotencyKey || globalThis.crypto?.randomUUID?.()
      || `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }),
  sendCatalogMedia: ({
    phone,
    content,
    productIds,
    sourceMessageId = null,
    idempotencyKey = null,
  }) => request('/messages/catalog-media', {
    method: 'POST',
    body: { phone, content, productIds, sourceMessageId },
    idempotencyKey: idempotencyKey || globalThis.crypto?.randomUUID?.()
      || `desktop-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }),
  retryMessage: (messageId, idempotencyKey = null) => request(`/messages/${encodeURIComponent(messageId)}/retry`, {
    method: 'POST',
    idempotencyKey: idempotencyKey || globalThis.crypto?.randomUUID?.()
      || `desktop-retry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }),
  dismissFailedMessage: (messageId) => request(`/messages/${encodeURIComponent(messageId)}/dismiss-failure`, {
    method: 'POST',
  }),
  editMessage: (messageId, content, idempotencyKey = null) => request(`/messages/${encodeURIComponent(messageId)}/edit`, {
    method: 'POST',
    body: { content },
    idempotencyKey: idempotencyKey || globalThis.crypto?.randomUUID?.()
      || `desktop-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }),
  deleteMessage: (messageId, idempotencyKey = null) => request(`/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    idempotencyKey: idempotencyKey || globalThis.crypto?.randomUUID?.()
      || `desktop-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }),
  attachment: (id) => request(`/attachments/${encodeURIComponent(id)}`),
  settings: () => request('/settings'),
  publishSettings: (data) => request('/settings', { method: 'POST', body: { data } }),
  botSettings: () => request('/bot-settings'),
  publishBotSettings: (data) => request('/bot-settings', { method: 'POST', body: { data } }),
  centralMachine: () => request('/central-machine'),
  claimCentralMachine: (data) => request('/central-machine', { method: 'POST', body: data }),
  previewBotReply: ({ message, behavior, phone }) => request('/bot-settings/preview', {
    method: 'POST',
    body: { message, behavior, phone },
  }),
  setTestMode: ({ enabled, phone = '' }) => request('/test-mode', {
    method: 'POST',
    body: { enabled, phone },
  }),
  createBudgetDraft: (phone) => request('/budgets', {
    method: 'POST',
    body: { phone },
  }),
  updateBudgetDraft: (id, payload) => request(`/budgets/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: payload,
  }),
  recordBudgetResult: (id, payload) => request(`/budgets/${encodeURIComponent(id)}/result`, {
    method: 'POST',
    body: payload,
  }),
  connection: () => request('/connection'),
  connectionAction: (action) => request('/connection', { method: 'POST', body: { action } }),
};
