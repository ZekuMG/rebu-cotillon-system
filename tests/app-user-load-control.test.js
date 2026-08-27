import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAppUserDirectoryLoadErrorMessage,
  isMissingSharedUsersSchemaError,
  mergeAppUserDirectories,
  resolveLoginUsers,
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

test('un error transitorio de Supabase no habilita el usuario Caja legacy', () => {
  const legacyUsers = [
    { id: 'legacy-system', role: 'system', isActive: true },
    { id: 'legacy-seller', role: 'seller', displayName: 'Caja', isActive: true },
  ];

  assert.deepEqual(resolveLoginUsers({
    activeUsers: [],
    authMode: 'supabase',
    legacyUsers,
  }), []);
});

test('el catálogo legacy sigue disponible cuando el modo de autenticación es legacy', () => {
  const legacyUsers = [
    { id: 'legacy-system', role: 'system', isActive: true },
    { id: 'legacy-seller', role: 'seller', displayName: 'Caja', isActive: true },
  ];

  assert.deepEqual(
    resolveLoginUsers({ activeUsers: [], authMode: 'legacy', legacyUsers }),
    legacyUsers,
  );
});

test('sólo la ausencia real del esquema compartido se reconoce como modo legacy', () => {
  assert.equal(isMissingSharedUsersSchemaError({
    code: 'PGRST205',
    message: "Could not find the table 'public.app_users_public' in the schema cache",
  }), true);
  assert.equal(isMissingSharedUsersSchemaError({
    code: 'REBU_TIMEOUT',
    message: 'Carga de usuarios excedió el tiempo de espera.',
  }), false);
  assert.equal(isMissingSharedUsersSchemaError({
    code: '42501',
    message: 'permission denied for relation app_users_public',
  }), false);
});

test('el error de carga explica si falta red, tiempo o permisos', () => {
  assert.match(
    getAppUserDirectoryLoadErrorMessage({ offline: true }),
    /No hay conexión/,
  );
  assert.match(
    getAppUserDirectoryLoadErrorMessage({ error: { code: 'REBU_TIMEOUT' } }),
    /tardó demasiado/,
  );
  assert.match(
    getAppUserDirectoryLoadErrorMessage({ error: { code: '42501' } }),
    /no permitió leer/,
  );
});
