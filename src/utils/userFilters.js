import { APP_USER_ROLE_META, normalizeAppUserRole, normalizeUserText } from './appUsers';
import { resolveUserPresentation } from './userPresentation';

const SYSTEM_ALIASES = ['system', 'sistema', 'admin'];
const LEGACY_USER_OPTIONS = [
  {
    key: 'legacy_user:dueno',
    bucket: 'legacy_user',
    role: 'owner',
    displayName: 'Due\u00f1o',
    color: APP_USER_ROLE_META.owner.color,
    aliases: ['dueno', 'duenio', 'due\u00f1o', 'owner'],
    remoteAliases: ['Due\u00f1o', 'Dueno', 'Duenio', 'owner'],
  },
  {
    key: 'legacy_user:vendedor',
    bucket: 'legacy_user',
    role: 'seller',
    displayName: 'Vendedor',
    color: APP_USER_ROLE_META.seller.color,
    aliases: ['vendedor', 'seller'],
    remoteAliases: ['Vendedor', 'seller'],
  },
  {
    key: 'legacy_user:caja',
    bucket: 'legacy_user',
    role: 'seller',
    displayName: 'Caja',
    color: APP_USER_ROLE_META.seller.color,
    aliases: ['caja'],
    remoteAliases: ['Caja'],
  },
];

const SYSTEM_ALIAS_SET = new Set(SYSTEM_ALIASES.map((value) => normalizeUserText(value)));
const LEGACY_OPTIONS_BY_KEY = new Map(LEGACY_USER_OPTIONS.map((option) => [option.key, option]));
const LEGACY_OPTIONS_BY_ALIAS = new Map(
  LEGACY_USER_OPTIONS.flatMap((option) =>
    option.aliases.map((alias) => [normalizeUserText(alias), option])
  )
);

const SYSTEM_FILTER_KEY = 'bucket:system';
const LEGACY_HUMAN_CAJA_FILTER_KEY = 'bucket:legacy_human_caja';

const uniqueNormalized = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeUserText(value)).filter(Boolean))];

const uniqueStrings = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];

const toUserCandidate = (record) => {
  if (!record) return null;

  if (
    Object.prototype.hasOwnProperty.call(record, 'user') ||
    Object.prototype.hasOwnProperty.call(record, 'userId') ||
    Object.prototype.hasOwnProperty.call(record, 'userRole')
  ) {
    return {
      id: record.userId || record.id || null,
      role: record.userRole || record.role || null,
      name: record.user || record.displayName || record.name || '',
      displayName: record.user || record.displayName || record.name || '',
      nameColor: record.nameColor || record.name_color || null,
    };
  }

  return {
    id: record.id || null,
    role: record.role || null,
    name: record.displayName || record.name || record.user || '',
    displayName: record.displayName || record.name || record.user || '',
    nameColor: record.nameColor || record.name_color || null,
  };
};

const buildSystemOptionSeed = () => ({
  key: SYSTEM_FILTER_KEY,
  bucket: 'system',
  displayName: 'Sistema',
  color: APP_USER_ROLE_META.system.color,
  userIds: [],
  aliases: [...SYSTEM_ALIAS_SET],
  remoteAliases: [...SYSTEM_ALIASES],
});

const buildLegacyUserOptionSeed = (option) => ({
  key: option.key,
  bucket: option.bucket,
  role: option.role,
  displayName: option.displayName,
  color: option.color,
  userIds: [],
  aliases: uniqueNormalized(option.aliases),
  remoteAliases: uniqueStrings(option.remoteAliases),
});

const buildLegacyHumanCajaOptionSeed = () => ({
  key: LEGACY_HUMAN_CAJA_FILTER_KEY,
  bucket: 'legacy_user_group',
  displayName: 'Due\u00f1o / Vendedor / Caja',
  color: APP_USER_ROLE_META.seller.color,
  userIds: [],
  aliases: uniqueNormalized(LEGACY_USER_OPTIONS.flatMap((option) => option.aliases)),
  remoteAliases: uniqueStrings(LEGACY_USER_OPTIONS.flatMap((option) => option.remoteAliases)),
});

const isSystemName = (value) => SYSTEM_ALIAS_SET.has(normalizeUserText(value));
const getLegacyOptionByName = (value) => LEGACY_OPTIONS_BY_ALIAS.get(normalizeUserText(value)) || null;

const isGenericLegacyHumanUser = (user) => {
  if (!user) return false;

  const normalizedRole = normalizeAppUserRole(user.role);
  if (!['owner', 'seller'].includes(normalizedRole)) return false;

  return Boolean(getLegacyOptionByName(user.displayName || user.name));
};

const findCatalogUserByPersonalName = (userCatalog, normalizedName) => {
  if (!normalizedName || !Array.isArray(userCatalog?.all)) return null;

  return (
    userCatalog.all.find((user) => {
      if (!user) return false;
      if (normalizeAppUserRole(user.role) === 'system') return false;
      if (isGenericLegacyHumanUser(user)) return false;
      return normalizeUserText(user.displayName || user.name) === normalizedName;
    }) || null
  );
};

const classifyUnifiedUserCandidate = (rawRecord, userCatalog = null) => {
  const candidate = toUserCandidate(rawRecord);
  if (!candidate) return null;

  const normalizedName = normalizeUserText(candidate.displayName || candidate.name);
  const explicitRole = candidate.role ? normalizeAppUserRole(candidate.role) : null;
  const catalogUserById =
    candidate.id && userCatalog?.byId?.[String(candidate.id)] ? userCatalog.byId[String(candidate.id)] : null;

  const catalogName = normalizeUserText(catalogUserById?.displayName || catalogUserById?.name);
  const catalogRole = catalogUserById?.role ? normalizeAppUserRole(catalogUserById.role) : null;

  if (catalogRole === 'system' || isSystemName(catalogName) || explicitRole === 'system' || isSystemName(normalizedName)) {
    const seed = buildSystemOptionSeed();
    if (candidate.id && (catalogRole === 'system' || explicitRole === 'system')) {
      seed.userIds.push(String(candidate.id));
    }
    return seed;
  }

  const legacyOptionByName = getLegacyOptionByName(normalizedName);
  if (!candidate.id && legacyOptionByName) {
    return buildLegacyUserOptionSeed(legacyOptionByName);
  }

  if (!candidate.id && !normalizedName && ['owner', 'seller'].includes(explicitRole || '')) {
    const roleFallback = explicitRole === 'owner'
      ? LEGACY_OPTIONS_BY_KEY.get('legacy_user:dueno')
      : LEGACY_OPTIONS_BY_KEY.get('legacy_user:vendedor');
    return buildLegacyUserOptionSeed(roleFallback);
  }

  const matchedRealUser =
    catalogUserById ||
    (!candidate.id && normalizedName ? findCatalogUserByPersonalName(userCatalog, normalizedName) : null) ||
    null;

  const presentation = resolveUserPresentation(matchedRealUser || candidate, userCatalog);
  const displayName = String(presentation.displayName || candidate.displayName || candidate.name || 'Usuario').trim();
  const normalizedDisplayName = normalizeUserText(displayName) || 'usuario';

  const aliases = uniqueNormalized([
    candidate.displayName,
    candidate.name,
    matchedRealUser?.displayName,
    matchedRealUser?.name,
    displayName,
  ]);

  const remoteAliases = uniqueStrings([
    matchedRealUser?.displayName,
    matchedRealUser?.name,
    displayName,
  ]);

  return {
    key: `user:${normalizedDisplayName}`,
    bucket: 'real_user',
    displayName,
    color: presentation.nameColor || candidate.nameColor || '#64748b',
    userIds: uniqueStrings([candidate.id, matchedRealUser?.id]).map((value) => String(value)),
    aliases,
    remoteAliases: remoteAliases.length > 0 ? remoteAliases : uniqueStrings([candidate.displayName, candidate.name]),
  };
};

const mergeFilterOption = (target, source) => {
  const next = target || {
    key: source.key,
    bucket: source.bucket,
    role: source.role,
    displayName: source.displayName,
    color: source.color,
    userIds: [],
    aliases: [],
    remoteAliases: [],
  };

  next.userIds = [...new Set([...(next.userIds || []), ...(source.userIds || [])].filter(Boolean).map(String))];
  next.aliases = [...new Set([...(next.aliases || []), ...(source.aliases || [])].filter(Boolean))];
  next.remoteAliases = [...new Set([...(next.remoteAliases || []), ...(source.remoteAliases || [])].filter(Boolean))];

  if (!next.color && source.color) {
    next.color = source.color;
  }

  return next;
};

export const buildUnifiedUserFilterOptions = ({
  catalogUsers = [],
  records = [],
  userCatalog = null,
  includeBaseBuckets = false,
} = {}) => {
  const groupedEntries = new Map();

  const pushCandidate = (rawRecord) => {
    const classification = classifyUnifiedUserCandidate(rawRecord, userCatalog);
    if (!classification) return;

    groupedEntries.set(
      classification.key,
      mergeFilterOption(groupedEntries.get(classification.key), classification),
    );
  };

  if (includeBaseBuckets) {
    pushCandidate({ role: 'system', displayName: 'Sistema' });
    LEGACY_USER_OPTIONS.forEach((option) => {
      groupedEntries.set(option.key, mergeFilterOption(groupedEntries.get(option.key), buildLegacyUserOptionSeed(option)));
    });
  }

  (Array.isArray(catalogUsers) ? catalogUsers : []).forEach((user) => pushCandidate(user));
  (Array.isArray(records) ? records : []).forEach((record) => pushCandidate(record));

  return [...groupedEntries.values()]
    .map((entry) => ({
      ...entry,
      userIds: [...entry.userIds].sort(),
      aliases: [...entry.aliases].sort(),
      remoteAliases: [...entry.remoteAliases].sort(),
    }))
    .sort((a, b) => {
      if (a.bucket === 'system' && b.bucket !== 'system') return -1;
      if (b.bucket === 'system' && a.bucket !== 'system') return 1;
      if (a.bucket === 'legacy_user' && b.bucket === 'real_user') return -1;
      if (b.bucket === 'legacy_user' && a.bucket === 'real_user') return 1;
      return a.displayName.localeCompare(b.displayName, 'es');
    });
};

export const matchesUnifiedUserFilter = (record, selectedFilter, userCatalog = null) => {
  if (!selectedFilter) return true;

  const classification = classifyUnifiedUserCandidate(record, userCatalog);
  if (!classification) return false;

  if (classification.key === selectedFilter.key) return true;

  if (selectedFilter.bucket === 'legacy_user_group') {
    return classification.bucket === 'legacy_user';
  }

  if (selectedFilter.bucket === 'real_user') {
    const selectedUserIds = Array.isArray(selectedFilter.userIds) ? selectedFilter.userIds.map(String) : [];
    const classificationUserIds = Array.isArray(classification.userIds) ? classification.userIds.map(String) : [];
    if (classificationUserIds.some((userId) => selectedUserIds.includes(userId))) {
      return true;
    }
  }

  return false;
};

export const buildFallbackFilterOptionFromKey = (filterKey) => {
  const normalizedKey = String(filterKey || '').trim();
  if (!normalizedKey) return null;

  if (normalizedKey === SYSTEM_FILTER_KEY) {
    return buildSystemOptionSeed();
  }

  if (normalizedKey === LEGACY_HUMAN_CAJA_FILTER_KEY) {
    return buildLegacyHumanCajaOptionSeed();
  }

  const legacyOption = LEGACY_OPTIONS_BY_KEY.get(normalizedKey);
  if (legacyOption) {
    return buildLegacyUserOptionSeed(legacyOption);
  }

  if (normalizedKey.startsWith('user:')) {
    const normalizedName = normalizedKey.slice(5).trim();
    if (!normalizedName) return null;
    return {
      key: normalizedKey,
      bucket: 'real_user',
      displayName: normalizedName,
      color: '#64748b',
      userIds: [],
      aliases: [normalizedName],
      remoteAliases: [normalizedName],
    };
  }

  if (normalizedKey.startsWith('name:')) {
    const normalizedName = normalizedKey.slice(5).trim();
    if (!normalizedName) return null;
    return {
      key: `user:${normalizedName}`,
      bucket: 'real_user',
      displayName: normalizedName,
      color: '#64748b',
      userIds: [],
      aliases: [normalizedName],
      remoteAliases: [normalizedName],
    };
  }

  return null;
};

export const buildRemoteUserFilterValue = (selectedFilterOrKey) => {
  const selectedFilter =
    typeof selectedFilterOrKey === 'string'
      ? buildFallbackFilterOptionFromKey(selectedFilterOrKey)
      : selectedFilterOrKey;

  if (!selectedFilter) return '';

  const aliases = Array.isArray(selectedFilter.remoteAliases)
    ? selectedFilter.remoteAliases.filter(Boolean)
    : Array.isArray(selectedFilter.aliases)
      ? selectedFilter.aliases.filter(Boolean)
      : [];

  if (aliases.length === 0) return '';

  return `name:${aliases.join('|')}`;
};
