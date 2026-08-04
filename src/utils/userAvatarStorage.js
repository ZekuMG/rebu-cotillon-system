export const USER_AVATAR_STORAGE_BUCKET = 'product-images';

export const isEmbeddedUserAvatar = (value) =>
  /^data:image\//i.test(String(value || '').trim());

const sanitizeAvatarOwnerKey = (value) => {
  const normalized = String(value || 'unassigned')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'unassigned';
};

export const buildUserAvatarStoragePaths = ({
  userId,
  timestamp = Date.now(),
  randomToken = Math.random().toString(36).slice(2, 10),
} = {}) => {
  const ownerKey = sanitizeAvatarOwnerKey(userId);
  const baseName = `${Number(timestamp) || Date.now()}_${String(randomToken || 'avatar')}`;
  return {
    originalPath: `avatars/${ownerKey}/originals/${baseName}`,
    thumbnailPath: `avatars/${ownerKey}/thumbs/${baseName}.webp`,
  };
};

export const getUserAvatarStoragePaths = (url) => {
  const source = String(url || '').trim();
  const marker = `/storage/v1/object/public/${USER_AVATAR_STORAGE_BUCKET}/`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return [];

  const thumbnailPath = decodeURIComponent(source.slice(markerIndex + marker.length).split('?')[0]);
  const match = thumbnailPath.match(/^avatars\/([^/]+)\/thumbs\/([^/]+)\.webp$/i);
  if (!match) return [];

  return [
    thumbnailPath,
    `avatars/${match[1]}/originals/${match[2]}`,
  ];
};

export const isUserAvatarStorageUrl = (url) => getUserAvatarStoragePaths(url).length > 0;
