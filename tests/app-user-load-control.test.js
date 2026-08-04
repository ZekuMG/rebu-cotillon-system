import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeAppUserDirectories,
  shouldLoadPrivateAppUserDirectory,
} from '../src/utils/appUserLoadControl.js';

test('el directorio privado solo se usa para administrar usuarios inactivos', () => {
  assert.equal(
    shouldLoadPrivateAppUserDirectory({ actorId: 'seller-1', includeInactive: false }),
    false,
  );
  assert.equal(
    shouldLoadPrivateAppUserDirectory({ actorId: 'owner-1', includeInactive: true }),
    true,
  );
  assert.equal(
    shouldLoadPrivateAppUserDirectory({ actorId: null, includeInactive: true }),
    false,
  );
});

test('una lista privada restringida no reemplaza el directorio completo de login', () => {
  const publicUsers = [
    { id: 'system-1', displayName: 'Sistema', role: 'system', isActive: true },
    { id: 'owner-1', displayName: 'Dueño', role: 'owner', isActive: true },
    { id: 'seller-1', displayName: 'Caja', role: 'seller', isActive: true },
  ];
  const privateUsers = [
    {
      id: 'seller-1',
      displayName: 'Caja',
      role: 'seller',
      isActive: true,
      permissionsOverride: { 'dashboard.view': false },
      permissionsVersion: 3,
    },
  ];

  const merged = mergeAppUserDirectories(publicUsers, privateUsers);

  assert.deepEqual(
    new Set(merged.map((user) => user.id)),
    new Set(['system-1', 'owner-1', 'seller-1']),
  );
  assert.equal(
    merged.find((user) => user.id === 'seller-1')?.permissionsVersion,
    3,
  );
});
