import test from 'node:test';
import assert from 'node:assert/strict';
import { getPosSaleUsers, resolvePosSaleUser } from '../src/utils/posSaleUser.js';

const activeUser = { id: 'seller-1', displayName: 'Ana', role: 'seller', isActive: true };
const catalog = { all: [activeUser, { id: 'inactive', isActive: false }] };

test('solo ofrece usuarios activos y no elige uno por defecto', () => {
  assert.deepEqual(getPosSaleUsers(catalog), [activeUser]);
  assert.equal(resolvePosSaleUser(catalog, ''), null);
  assert.equal(resolvePosSaleUser(null, 'seller-1'), null);
});

test('rechaza responsables eliminados o desactivados antes del cobro', () => {
  assert.equal(resolvePosSaleUser(catalog, 'inactive'), null);
  assert.equal(resolvePosSaleUser(catalog, 'deleted'), null);
  assert.equal(resolvePosSaleUser(catalog, 'seller-1'), activeUser);
  assert.equal(resolvePosSaleUser({ all: [{ ...activeUser, isActive: false }] }, 'seller-1'), null);
});

test('oculta las dos cuentas web de caja y descarta su selección guardada sin modificar el catálogo de acceso', () => {
  const webUsers = [
    { ...activeUser, id: 'ef8bbf90-6b1a-4724-839a-ea3d8c6aa7ab', displayName: 'Ramiro (web)' },
    { ...activeUser, id: '9b45990c-1dde-46bf-8af9-d0426814c5ac', displayName: 'Cuenta web renombrada' },
  ];
  const loginCatalog = { all: [activeUser, ...webUsers] };
  const original = structuredClone(loginCatalog);

  assert.deepEqual(getPosSaleUsers(loginCatalog), [activeUser]);
  for (const user of webUsers) assert.equal(resolvePosSaleUser(loginCatalog, user.id), null);
  assert.deepEqual(loginCatalog, original);
});
