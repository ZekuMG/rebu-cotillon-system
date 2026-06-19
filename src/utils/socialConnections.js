export const INSTAGRAM_COUPON_CODES = new Set(['REBUINSTA']);

const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const sanitizeInstagramNotes = (value = '') => String(value || '').trim();

export const normalizeInstagramHandle = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const withoutUrl = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^instagram\.com\//i, '');

  return withoutUrl
    .split(/[/?#]/)[0]
    .replace(/^@+/, '')
    .trim()
    .toLowerCase();
};

export const formatInstagramHandle = (value = '') => {
  const normalized = normalizeInstagramHandle(value);
  return normalized ? `@${normalized}` : '';
};

export const getSocialConnections = (member = {}) =>
  toObject(member.socialConnections || member.social_connections);

export const getInstagramConnection = (member = {}) => {
  const connection = toObject(getSocialConnections(member).instagram);
  const handle = normalizeInstagramHandle(connection.handle || connection.username || connection.user);

  return {
    ...connection,
    handle,
    isConnected: Boolean(connection.isConnected ?? connection.connected ?? connection.verified),
    source: connection.source || 'manual',
    connectedAt: connection.connectedAt || connection.connected_at || null,
    updatedAt: connection.updatedAt || connection.updated_at || null,
    notes: connection.notes || '',
  };
};

export const hasInstagramConnection = (member = {}) => {
  const instagram = getInstagramConnection(member);
  return Boolean(instagram.handle && instagram.isConnected);
};

export const buildSocialConnectionsWithInstagram = (
  existingConnections = {},
  { handle = '', isConnected = false, source = 'manual', notes = '', now = new Date().toISOString() } = {},
) => {
  const previous = toObject(existingConnections);
  const normalizedHandle = normalizeInstagramHandle(handle);
  const previousInstagram = toObject(previous.instagram);

  if (!normalizedHandle) {
    const { instagram: _removed, ...rest } = previous;
    return rest;
  }

  const wasConnected = Boolean(previousInstagram.isConnected ?? previousInstagram.connected ?? previousInstagram.verified);

  return {
    ...previous,
    instagram: {
      ...previousInstagram,
      handle: normalizedHandle,
      isConnected: Boolean(isConnected),
      source,
      notes: sanitizeInstagramNotes(notes),
      connectedAt: isConnected
        ? previousInstagram.connectedAt || previousInstagram.connected_at || (wasConnected ? null : now) || now
        : null,
      updatedAt: now,
    },
  };
};

export const getCouponUsageOverrides = (member = {}) => {
  const connections = getSocialConnections(member);
  const couponUsage = toObject(connections.couponUsage || connections.coupon_usage);
  const rawCodes = Array.isArray(couponUsage.reenabledCodes)
    ? couponUsage.reenabledCodes
    : Array.isArray(couponUsage.reenabled_codes)
      ? couponUsage.reenabled_codes
      : [];

  return {
    reenabledCodes: Array.from(
      new Set(rawCodes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)),
    ),
    updatedAt: couponUsage.updatedAt || couponUsage.updated_at || null,
  };
};

export const buildSocialConnectionsWithCouponUsageOverrides = (
  existingConnections = {},
  { reenabledCodes = [], now = new Date().toISOString() } = {},
) => {
  const previous = toObject(existingConnections);
  const normalizedCodes = Array.from(
    new Set(reenabledCodes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)),
  );

  const previousCouponUsage = toObject(previous.couponUsage || previous.coupon_usage);

  return {
    ...previous,
    couponUsage: {
      ...previousCouponUsage,
      reenabledCodes: normalizedCodes,
      updatedAt: now,
    },
  };
};

export const couponRequiresInstagramConnection = (couponCode = '') =>
  INSTAGRAM_COUPON_CODES.has(String(couponCode || '').trim().toUpperCase());

export const getInstagramFormValues = (member = {}) => {
  const instagram = getInstagramConnection(member);

  return {
    instagramHandle: instagram.handle || '',
    instagramConnected: Boolean(instagram.isConnected),
    instagramNotes: sanitizeInstagramNotes(instagram.notes),
  };
};
