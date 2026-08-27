import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_PERMISSION_GROUPS,
  getEffectivePermissions,
} from '../src/utils/userPermissions.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('el editor de usuarios incluye el grupo Catálogo web', () => {
  const group = APP_PERMISSION_GROUPS.find((entry) => entry.id === 'catalog');
  assert.equal(group?.label, 'Catálogo web');
  assert.equal(group?.viewKey, 'catalog.view');
  assert.deepEqual(group?.actions.map((entry) => entry.key), ['catalog.edit', 'catalog.publish']);
});

test('Sistema y Dueño tienen catálogo; Caja requiere override explícito', () => {
  for (const role of ['system', 'owner']) {
    const permissions = getEffectivePermissions(role);
    assert.equal(permissions['catalog.view'], true);
    assert.equal(permissions['catalog.edit'], true);
    assert.equal(permissions['catalog.publish'], true);
  }
  const seller = getEffectivePermissions('seller');
  assert.equal(seller['catalog.view'], false);
  assert.equal(seller['catalog.edit'], false);
  assert.equal(seller['catalog.publish'], false);
  const overridden = getEffectivePermissions({
    role: 'seller',
    permissions_override: { 'catalog.view': true, 'catalog.edit': true },
  });
  assert.equal(overridden['catalog.view'], true);
  assert.equal(overridden['catalog.edit'], true);
  assert.equal(overridden['catalog.publish'], false);
});

test('los datos base sensibles se actualizan después de Supabase Auth', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8');
  const bootBlock = source.slice(source.indexOf('const bootSharedUsersSnapshot'), source.indexOf('let realtimeFallbackSyncTimer'));
  assert.doesNotMatch(bootBlock, /loadCoreCloudData/);
  const loginBlock = source.slice(source.indexOf('const finalizeLogin'), source.indexOf('const handleSystemLogoAccess'));
  assert.match(loginBlock, /supabaseAuthMeta\.signedIn[\s\S]*loadCoreCloudData/);
  assert.match(source, /hydrateOfflineSnapshots/);
});
