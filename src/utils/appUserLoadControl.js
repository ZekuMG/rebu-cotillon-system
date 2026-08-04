export const shouldLoadPrivateAppUserDirectory = ({ actorId, includeInactive = false } = {}) =>
  Boolean(actorId && includeInactive);

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
