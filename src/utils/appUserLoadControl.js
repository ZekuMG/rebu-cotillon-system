export const shouldLoadPrivateAppUserDirectory = ({ actorId, includeInactive = false } = {}) =>
  Boolean(actorId && includeInactive);

export const isMissingSharedUsersSchemaError = (error) =>
  error?.code === 'PGRST205' &&
  /app_users_public|app_users/i.test(String(error?.message || ''));

export const getAppUserDirectoryLoadErrorMessage = ({ error = null, offline = false } = {}) => {
  if (offline) {
    return 'No hay conexión y este equipo todavía no tiene un directorio de usuarios guardado.';
  }

  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.name,
  ].filter(Boolean).join(' ');

  if (/timeout|tiempo de espera|REBU_TIMEOUT/i.test(errorText)) {
    return 'La carga de usuarios tardó demasiado. Revisá la conexión y volvé a intentar.';
  }

  if (/permission denied|42501|401|403|row-level security/i.test(errorText)) {
    return 'Supabase no permitió leer el directorio de usuarios. Revisá el acceso de app_users_public.';
  }

  return 'No se pudo cargar el directorio de usuarios desde Supabase.';
};

export const resolveLoginUsers = ({
  activeUsers = [],
  authMode = 'supabase',
  legacyUsers = [],
} = {}) => {
  const availableUsers = Array.isArray(activeUsers) ? activeUsers : [];
  if (availableUsers.length > 0) return availableUsers;
  if (authMode !== 'legacy') return [];
  return (Array.isArray(legacyUsers) ? legacyUsers : []).filter((user) => user?.isActive !== false);
};

export const mergeAppUserDirectories = (...userGroups) => {
  const usersById = new Map();

  userGroups.flat().forEach((user) => {
    if (!user?.id) return;
    const key = String(user.id);
    usersById.set(key, {
      ...(usersById.get(key) || {}),
      ...user,
    });
  });

  return Array.from(usersById.values()).sort((left, right) => {
    const roleComparison = String(left.role || '').localeCompare(String(right.role || ''));
    if (roleComparison !== 0) return roleComparison;
    return String(left.displayName || left.name || '').localeCompare(
      String(right.displayName || right.name || ''),
    );
  });
};
