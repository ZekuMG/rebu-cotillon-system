import { supabase } from '../supabase/client';
import { isImageAvatar } from './avatarUtils';
import {
  getEffectivePermissions,
  normalizePermissionsOverride,
} from './userPermissions';

export const APP_USER_NAME_COLORS = [
  '#0f172a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
];

export const APP_USER_ROLE_META = {
  system: { label: 'Sistema', avatar: 'SI', color: '#334155' },
  owner: { label: 'Dueño', avatar: 'DU', color: '#4f46e5' },
  seller: { label: 'Caja', avatar: 'VE', color: '#059669' },
};

export const normalizeUserText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const getRoleLabel = (role) => APP_USER_ROLE_META[normalizeAppUserRole(role)]?.label || 'Usuario';

export const normalizeAppUserRole = (value) => {
  const normalized = normalizeUserText(value);
  if (['system', 'sistema', 'admin'].includes(normalized)) return 'system';
  if (['owner', 'dueno', 'dueño'].includes(normalized)) return 'owner';
  if (['seller', 'vendedor', 'caja'].includes(normalized)) return 'seller';
  return 'seller';
};

export const getInitialsFromName = (value, fallback = 'US') => {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

export const normalizeAppUserRecord = (record) => {
  if (!record) return null;

  const role = normalizeAppUserRole(record.role);
  const displayName = String(
    record.display_name || record.displayName || record.name || getRoleLabel(role),
  ).trim();

  const rawAvatar = String(record.avatar || '').trim();
  const normalizedAvatar =
    isImageAvatar(rawAvatar)
      ? rawAvatar
      : String(
          rawAvatar || getInitialsFromName(displayName, APP_USER_ROLE_META[role]?.avatar || 'US'),
        )
          .trim()
          .slice(0, 4)
          .toUpperCase();

  return {
    id: record.id || `legacy-${role}`,
    displayName,
    name: displayName,
    role,
    avatar: normalizedAvatar,
    nameColor: record.name_color || record.nameColor || APP_USER_ROLE_META[role]?.color || '#0f172a',
    theme: record.theme || 'light',
    isActive: record.is_active !== false && record.isActive !== false,
    permissionsOverride: normalizePermissionsOverride(record.permissions_override || record.permissionsOverride),
    permissionsVersion: Number(record.permissions_version || record.permissionsVersion || 1),
    forceReauthPermissionsVersion: Number(
      record.force_reauth_permissions_version || record.forceReauthPermissionsVersion || 0,
    ),
    effectivePermissions: getEffectivePermissions({
      role,
      permissionsOverride: normalizePermissionsOverride(record.permissions_override || record.permissionsOverride),
    }),
    createdAt: record.created_at || record.createdAt || null,
    updatedAt: record.updated_at || record.updatedAt || null,
    createdBy: record.created_by || record.createdBy || null,
    source: record.source || 'supabase',
  };
};

export const buildLegacyBootstrapSeed = (legacyUsers = {}, legacySettings = {}) => {
  const adminSeed = legacyUsers.admin || {};
  const sellerSeed = legacyUsers.seller || {};
  const adminSettings = legacySettings.admin || {};
  const sellerSettings = legacySettings.seller || {};

  return {
    systemUser: {
      display_name: String(adminSettings.name || 'Sistema').trim(),
      role: 'system',
      avatar: String(adminSettings.avatar || 'SI').trim().slice(0, 4).toUpperCase(),
      name_color: adminSettings.nameColor || '#4f46e5',
      theme: adminSettings.theme || 'light',
      password: adminSettings.password || adminSeed.password || '1234',
    },
    sellerUser: {
      display_name: String(sellerSettings.name || sellerSeed.name || 'Caja').trim(),
      role: 'seller',
      avatar: String(sellerSettings.avatar || sellerSeed.avatar || 'VE').trim().slice(0, 4).toUpperCase(),
      name_color: sellerSettings.nameColor || '#059669',
      theme: sellerSettings.theme || 'light',
      password: sellerSettings.password || sellerSeed.password || '4321',
    },
  };
};

export const buildLegacyUsers = (legacyUsers = {}, legacySettings = {}) => {
  const seed = buildLegacyBootstrapSeed(legacyUsers, legacySettings);

  return [
    normalizeAppUserRecord({
      id: 'legacy-system',
      display_name: seed.systemUser.display_name,
      role: 'system',
      avatar: seed.systemUser.avatar,
      name_color: seed.systemUser.name_color,
      theme: seed.systemUser.theme,
      is_active: true,
      source: 'legacy',
    }),
    normalizeAppUserRecord({
      id: 'legacy-seller',
      display_name: seed.sellerUser.display_name,
      role: 'seller',
      avatar: seed.sellerUser.avatar,
      name_color: seed.sellerUser.name_color,
      theme: seed.sellerUser.theme,
      is_active: true,
      source: 'legacy',
    }),
  ].filter(Boolean);
};

export const buildUserCatalog = (users = []) => {
  const normalizedUsers = (Array.isArray(users) ? users : [])
    .map(normalizeAppUserRecord)
    .filter(Boolean);

  const byId = Object.fromEntries(normalizedUsers.map((user) => [String(user.id), user]));
  const byRole = {
    system: normalizedUsers.filter((user) => user.role === 'system'),
    owner: normalizedUsers.filter((user) => user.role === 'owner'),
    seller: normalizedUsers.filter((user) => user.role === 'seller'),
  };

  const primarySystem = byRole.system[0] || null;
  const primaryOwner = byRole.owner[0] || null;
  const primarySeller = byRole.seller[0] || null;

  return {
    all: normalizedUsers,
    byId,
    byRole,
    primaryByRole: {
      system: primarySystem,
      owner: primaryOwner,
      seller: primarySeller,
    },
    legacyEntries: {
      admin: primarySystem || primaryOwner || null,
      seller: primarySeller || null,
    },
  };
};

export const hasOwnerAccess = (user) => ['system', 'owner'].includes(normalizeAppUserRole(user?.role));
export const isSystemUser = (user) => normalizeAppUserRole(user?.role) === 'system';
export const isSellerUser = (user) => normalizeAppUserRole(user?.role) === 'seller';

export const fetchAppUsersPublic = async () => {
  const { data, error } = await supabase
    .from('app_users_public')
    .select('*')
    .order('role', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeAppUserRecord).filter(Boolean);
};

export const bootstrapAppUsers = async ({ systemUser, sellerUser }) => {
  const { error } = await supabase.rpc('bootstrap_app_users', {
    p_system_user: systemUser,
    p_seller_user: sellerUser,
  });

  if (error) throw error;
};

export const verifyAppUserLogin = async ({ userId, password }) => {
  const { data, error } = await supabase.rpc('verify_app_user_login', {
    p_user_id: userId,
    p_password: password,
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};

export const createAppUser = async ({ actorId, displayName, role, password, avatar, nameColor, theme }) => {
  const { data, error } = await supabase.rpc('create_app_user', {
    p_actor_id: actorId,
    p_display_name: displayName,
    p_role: role,
    p_password: password,
    p_avatar: avatar,
    p_name_color: nameColor,
    p_theme: theme,
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};

export const updateAppUserProfile = async ({ actorId, targetId, displayName, role, avatar, nameColor, theme }) => {
  const { data, error } = await supabase.rpc('update_app_user_profile', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_display_name: displayName,
    p_role: role,
    p_avatar: avatar,
    p_name_color: nameColor,
    p_theme: theme,
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};

export const updateAppUserPassword = async ({ actorId, targetId, password }) => {
  const { data, error } = await supabase.rpc('update_app_user_password', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_password: password,
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};

export const setAppUserActive = async ({ actorId, targetId, isActive }) => {
  const { data, error } = await supabase.rpc('set_app_user_active', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_is_active: isActive,
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};

export const updateAppUserPermissions = async ({ actorId, targetId, permissionsOverride, applyNow }) => {
  const { data, error } = await supabase.rpc('update_app_user_permissions', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_permissions_override: permissionsOverride || {},
    p_apply_now: Boolean(applyNow),
  });

  if (error) throw error;
  if (Array.isArray(data)) return normalizeAppUserRecord(data[0] || null);
  return normalizeAppUserRecord(data || null);
};
