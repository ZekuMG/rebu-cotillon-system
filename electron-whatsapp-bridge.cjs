'use strict';

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

module.exports = {
  normalizeWhatsAppBotRequestPath,
};
