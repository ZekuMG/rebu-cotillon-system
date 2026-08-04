import { supabase } from '../supabase/client';

const OPERATOR_PREFIX = '/api/operator';

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) {
    const authError = new Error('Tu sesión venció. Cerrá sesión e ingresá nuevamente.');
    authError.code = 'authentication_required';
    throw authError;
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
    limit = 40,
    cursor = '',
    filter = 'all',
    search = '',
  } = {}) => request(
    `/overview?limit=${encodeURIComponent(limit)}&filter=${encodeURIComponent(filter)}`
      + `${search ? `&search=${encodeURIComponent(search)}` : ''}`
      + `${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  conversation: (phone, { limit = 80, cursor = '' } = {}) => request(
    `/conversations/${encodeURIComponent(phone)}?limit=${encodeURIComponent(limit)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  conversationActivity: (phone) => request(
    `/conversations/${encodeURIComponent(phone)}/activity`,
  ),
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
