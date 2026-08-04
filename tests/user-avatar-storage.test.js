import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUserAvatarStoragePaths,
  getUserAvatarStoragePaths,
  isEmbeddedUserAvatar,
  isUserAvatarStorageUrl,
} from '../src/utils/userAvatarStorage.js';

test('los avatares embebidos se distinguen de iniciales y URLs', () => {
  assert.equal(isEmbeddedUserAvatar('data:image/png;base64,abc'), true);
  assert.equal(isEmbeddedUserAvatar('RA'), false);
  assert.equal(isEmbeddedUserAvatar('https://example.com/avatar.webp'), false);
});

test('las rutas de avatar conservan original y miniatura bajo el mismo identificador', () => {
  const paths = buildUserAvatarStoragePaths({
    userId: 'User 123',
    timestamp: 123456,
    randomToken: 'fixed',
  });

  assert.deepEqual(paths, {
    originalPath: 'avatars/user-123/originals/123456_fixed',
    thumbnailPath: 'avatars/user-123/thumbs/123456_fixed.webp',
  });
});

test('desde la URL publica se recuperan ambos objetos para una limpieza segura', () => {
  const url = 'https://project.supabase.co/storage/v1/object/public/product-images/avatars/user-123/thumbs/123_fixed.webp';

  assert.deepEqual(getUserAvatarStoragePaths(url), [
    'avatars/user-123/thumbs/123_fixed.webp',
    'avatars/user-123/originals/123_fixed',
  ]);
  assert.equal(isUserAvatarStorageUrl(url), true);
  assert.equal(isUserAvatarStorageUrl('data:image/png;base64,abc'), false);
});
