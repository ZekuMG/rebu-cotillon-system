import {
  APP_USER_ROLE_META,
  getInitialsFromName,
  normalizeAppUserRole,
  normalizeUserText,
} from './appUsers';

const SYSTEM_FALLBACK = {
  displayName: 'Sistema',
  nameColor: '#475569',
  avatar: 'SI',
  type: 'system',
};

const UNKNOWN_FALLBACK = {
  displayName: 'Usuario',
  nameColor: '#64748b',
  avatar: 'US',
  type: 'unknown',
};

export const hexToRgba = (hex, alpha = 1) => {
  const safeHex = String(hex || '').replace('#', '').trim();

  if (![3, 6].includes(safeHex.length)) return null;

  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : safeHex;

  const r = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const g = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const b = Number.parseInt(normalizedHex.slice(4, 6), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) return null;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildPresentation = ({
  displayName,
  nameColor,
  avatar,
  type,
}) => {
  const color = nameColor || UNKNOWN_FALLBACK.nameColor;
  const borderColor = hexToRgba(color, 0.22) || '#cbd5e1';
  const backgroundColor = hexToRgba(color, 0.12) || '#f8fafc';

  return {
    displayName,
    nameColor: color,
    avatar,
    type,
    badgeStyle: {
      color,
      backgroundColor,
      borderColor,
    },
    textStyle: {
      color,
    },
  };
};

const normalizeCandidateUser = (user) => {
  if (!user) return null;
  if (typeof user === 'string') {
    const trimmed = user.trim();
    if (!trimmed) return null;
    return {
      id: null,
      displayName: trimmed,
      name: trimmed,
      role: null,
      nameColor: null,
      avatar: getInitialsFromName(trimmed),
    };
  }

  const displayName = String(
    user.displayName || user.name || user.userName || user.user || '',
  ).trim();

  return {
    id: user.id || user.userId || null,
    displayName,
    name: displayName,
    role: user.role || user.userRole || null,
    nameColor: user.nameColor || user.name_color || null,
    avatar: user.avatar || (displayName ? getInitialsFromName(displayName) : null),
  };
};

const normalizeExplicitRole = (value) => {
  const normalized = normalizeUserText(value);
  if (!normalized) return null;
  return normalizeAppUserRole(value);
};

const getGenericHistoricalRole = (value) => {
  const normalized = normalizeUserText(value);

  if (!normalized) return null;

  if (['system', 'sistema', 'admin', 'dueno', 'dueño', 'dueã±o', 'due?o'].includes(normalized)) {
    return 'system';
  }

  if (['seller', 'vendedor', 'caja'].includes(normalized)) {
    return 'seller';
  }

  return null;
};

const buildGenericRolePresentation = (role) => {
  const roleMeta = APP_USER_ROLE_META[role];

  if (!roleMeta) return null;

  return buildPresentation({
    displayName: roleMeta.label,
    nameColor: roleMeta.color,
    avatar: roleMeta.avatar,
    type: role,
  });
};

const findUserByCatalog = (candidate, userCatalog) => {
  if (!userCatalog) return null;

  if (candidate?.id && userCatalog.byId?.[String(candidate.id)]) {
    return userCatalog.byId[String(candidate.id)];
  }

  const normalizedName = normalizeUserText(candidate?.displayName || candidate?.name);
  const genericHistoricalRole = getGenericHistoricalRole(normalizedName);
  if (genericHistoricalRole) {
    return null;
  }

  const explicitRole = normalizeExplicitRole(candidate?.role);
  if (explicitRole && !normalizedName && userCatalog.primaryByRole?.[explicitRole]) {
    return userCatalog.primaryByRole[explicitRole];
  }

  if (!normalizedName) {
    return null;
  }

  return (userCatalog.all || []).find((user) => {
    const userName = normalizeUserText(user.displayName || user.name);
    return userName === normalizedName;
  }) || null;
};

export const resolveUserPresentation = (user, userCatalog = null) => {
  const candidate = normalizeCandidateUser(user);

  if (!candidate) {
    return buildPresentation(UNKNOWN_FALLBACK);
  }

  const genericHistoricalRole = getGenericHistoricalRole(candidate.displayName || candidate.name);
  if (!candidate.id && genericHistoricalRole) {
    return buildGenericRolePresentation(genericHistoricalRole);
  }

  const catalogMatch = findUserByCatalog(candidate, userCatalog);
  const matchedUser = catalogMatch || candidate;

  const normalizedRole = normalizeExplicitRole(matchedUser.role);
  const roleMeta = APP_USER_ROLE_META[normalizedRole];

  if (!matchedUser.displayName && normalizedRole === 'system') {
    return buildPresentation(SYSTEM_FALLBACK);
  }

  if (!matchedUser.displayName && roleMeta) {
    return buildPresentation({
      displayName: roleMeta.label,
      nameColor: matchedUser.nameColor || roleMeta.color,
      avatar: matchedUser.avatar || roleMeta.avatar,
      type: normalizedRole,
    });
  }

  if (!matchedUser.displayName) {
    return buildPresentation(UNKNOWN_FALLBACK);
  }

  return buildPresentation({
    displayName: matchedUser.displayName,
    nameColor: matchedUser.nameColor || roleMeta?.color || UNKNOWN_FALLBACK.nameColor,
    avatar: matchedUser.avatar || roleMeta?.avatar || getInitialsFromName(matchedUser.displayName),
    type: roleMeta ? normalizedRole : UNKNOWN_FALLBACK.type,
  });
};

export const resolveUserBadgeStyle = (user, userCatalog = null) =>
  resolveUserPresentation(user, userCatalog).badgeStyle;

export const resolveUserTextStyle = (user, userCatalog = null) =>
  resolveUserPresentation(user, userCatalog).textStyle;

export default resolveUserPresentation;
