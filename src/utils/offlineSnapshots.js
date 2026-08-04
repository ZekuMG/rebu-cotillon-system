const offlineInitials = (value, fallback = 'US') => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

const isImageAvatarValue = (value) =>
  /^(data:image\/|https?:\/\/|\/)/i.test(String(value || '').trim());

export const getOfflineAvatarFingerprint = (value) => {
  const avatar = String(value || '').trim();
  if (!avatar) return '';

  let hash = 2166136261;
  for (let index = 0; index < avatar.length; index += 1) {
    hash ^= avatar.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${avatar.length}-${(hash >>> 0).toString(36)}`;
};

const compactOfflineAvatar = (user = {}) => {
  const avatar = String(user.avatar || '').trim();
  const isEmbeddedOrRemote = (
    avatar.length > 32
    || /^data:/i.test(avatar)
    || /^https?:/i.test(avatar)
    || /^blob:/i.test(avatar)
  );
  if (!avatar || isEmbeddedOrRemote) {
    return offlineInitials(user.displayName || user.name, 'US');
  }
  return avatar.slice(0, 4).toUpperCase();
};

export const compactSharedUsersSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;

  return {
    savedAt: snapshot.savedAt || null,
    authMode: snapshot.authMode || 'supabase',
    scope: snapshot.scope || 'active',
    users: (Array.isArray(snapshot.users) ? snapshot.users : []).map((user) => {
      const avatar = String(user.avatar || '').trim();
      return {
        id: user.id,
        displayName: user.displayName || user.name || '',
        name: user.name || user.displayName || '',
        role: user.role || 'seller',
        avatar: compactOfflineAvatar(user),
        avatarFingerprint:
          isImageAvatarValue(avatar)
            ? getOfflineAvatarFingerprint(avatar)
            : user.avatarFingerprint || getOfflineAvatarFingerprint(avatar),
        nameColor: user.nameColor || '#0f172a',
        theme: user.theme || 'light',
        metricsViewMode: user.metricsViewMode,
        isActive: user.isActive !== false,
        permissionsOverride: user.permissionsOverride || {},
        permissionsVersion: Number(user.permissionsVersion || 1),
        forceReauthPermissionsVersion: Number(user.forceReauthPermissionsVersion || 0),
        authUserId: user.authUserId || null,
        authEmail: user.authEmail || null,
        effectivePermissions: user.effectivePermissions || {},
        source: user.source || 'supabase',
      };
    }),
  };
};

export const hydrateSharedUsersSnapshotAvatars = (snapshot, avatarCache) => {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.users)) return snapshot;
  const entries = avatarCache?.entries && typeof avatarCache.entries === 'object'
    ? avatarCache.entries
    : {};

  return {
    ...snapshot,
    users: snapshot.users.map((user) => {
      const cachedEntry = entries[String(user.id || '')];
      if (
        !cachedEntry ||
        !isImageAvatarValue(cachedEntry.avatar) ||
        !user.avatarFingerprint ||
        cachedEntry.fingerprint !== user.avatarFingerprint
      ) {
        return user;
      }
      return { ...user, avatar: cachedEntry.avatar };
    }),
  };
};

export const createOfflineAvatarThumbnail = (avatar, { size = 160, quality = 0.82 } = {}) => {
  const source = String(avatar || '').trim();
  if (!/^data:image\//i.test(source) || typeof document === 'undefined') {
    return Promise.resolve(source);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context || !image.naturalWidth || !image.naturalHeight) {
          reject(new Error('No se pudo preparar la miniatura del avatar.'));
          return;
        }

        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
        const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          size,
          size,
        );
        resolve(canvas.toDataURL('image/webp', quality));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('No se pudo leer el avatar para generar su miniatura.'));
    image.src = source;
  });
};

export const buildSharedUserAvatarCache = async (
  users,
  {
    previousCache = null,
    createThumbnail = createOfflineAvatarThumbnail,
    maxUsers = 24,
    maxAvatarLength = 120_000,
  } = {},
) => {
  const previousEntries = previousCache?.entries && typeof previousCache.entries === 'object'
    ? previousCache.entries
    : {};
  const imageUsers = (Array.isArray(users) ? users : [])
    .filter((user) => user?.id && isImageAvatarValue(user.avatar))
    .slice(0, maxUsers);

  const cacheEntries = await Promise.all(imageUsers.map(async (user) => {
    const id = String(user.id);
    const sourceAvatar = String(user.avatar || '').trim();
    const fingerprint = user.avatarFingerprint || getOfflineAvatarFingerprint(sourceAvatar);
    const previousEntry = previousEntries[id];
    if (
      previousEntry?.fingerprint === fingerprint &&
      isImageAvatarValue(previousEntry.avatar)
    ) {
      return [id, previousEntry];
    }

    try {
      const cachedAvatar = /^data:image\//i.test(sourceAvatar)
        ? await createThumbnail(sourceAvatar)
        : sourceAvatar;
      if (!isImageAvatarValue(cachedAvatar) || String(cachedAvatar).length > maxAvatarLength) {
        return null;
      }
      return [id, { fingerprint, avatar: cachedAvatar }];
    } catch {
      return null;
    }
  }));

  return {
    savedAt: new Date().toISOString(),
    entries: Object.fromEntries(cacheEntries.filter(Boolean)),
  };
};
