'use strict';

const DEFAULT_WHATSAPP_BOT_URL = 'https://rebu-whatsapp-central.tailbdf1e7.ts.net';

const ALLOWED_QUERY_PARAMETERS = new Set([
  'limit',
  'cursor',
  'history',
  'filter',
  'search',
]);

const normalizeWhatsAppBotRequestPath = (rawPath) => {
  let requestUrl;
  try {
    requestUrl = new URL(String(rawPath || '').trim(), 'http://rebu.local');
  } catch {
    return null;
  }

  const hasUnexpectedQuery = [...requestUrl.searchParams.keys()]
    .some((key) => !ALLOWED_QUERY_PARAMETERS.has(key));
  if (
    requestUrl.origin !== 'http://rebu.local'
    || !/^\/api\/operator(?:\/[a-z0-9_-]+)*$/i.test(requestUrl.pathname)
    || hasUnexpectedQuery
    || requestUrl.hash
  ) {
    return null;
  }

  return `${requestUrl.pathname}${requestUrl.search}`;
};

const normalizeWhatsAppBotBaseUrl = (rawUrl) => {
  const parsed = new URL(String(rawUrl || '').trim());
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback))
    || parsed.username
    || parsed.password
  ) {
    throw new Error('La API de WhatsApp debe usar HTTPS o una direccion local.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.href.replace(/\/$/, '');
};

const resolveWhatsAppBotBaseUrl = ({
  localOverride = '',
  environmentOverride = '',
  fileOverride = '',
  fallback = DEFAULT_WHATSAPP_BOT_URL,
} = {}) => normalizeWhatsAppBotBaseUrl(
  [localOverride, environmentOverride, fileOverride, fallback]
    .map((value) => String(value || '').trim())
    .find(Boolean),
);

module.exports = {
  DEFAULT_WHATSAPP_BOT_URL,
  normalizeWhatsAppBotRequestPath,
  normalizeWhatsAppBotBaseUrl,
  resolveWhatsAppBotBaseUrl,
};
