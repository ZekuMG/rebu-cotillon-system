import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('supplier session restores silently and logout only clears its isolated partition', async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../preload.cjs', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /ipcMain\.handle\('supplier-session-connect'/);
  assert.match(mainSource, /ensureSupplierSessionWindow\(\{ show: false \}\)/);
  assert.match(mainSource, /ipcMain\.handle\('supplier-session-logout'/);
  assert.match(mainSource, /session\.fromPartition\(SUPPLIER_IMAGE_PARTITION\)/);
  assert.doesNotMatch(mainSource, /defaultSession\.clearStorageData/);
  assert.match(preloadSource, /supplierSessionConnect: \(\) => ipcRenderer\.invoke\('supplier-session-connect'\)/);
  assert.match(preloadSource, /supplierSessionLogout: \(\) => ipcRenderer\.invoke\('supplier-session-logout'\)/);
});

test('primary login action never opens the supplier window', async () => {
  const viewSource = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  const connectHandler = viewSource.match(/const handleConnectSupplierSession = async \(\) => \{([\s\S]*?)\n  \};/i)?.[1] || '';
  const manualHandler = viewSource.match(/const handleOpenSupplierLogin = async \(\) => \{([\s\S]*?)\n  \};/i)?.[1] || '';

  assert.match(connectHandler, /supplierSessionConnect\(\)/);
  assert.doesNotMatch(connectHandler, /supplierImageOpenLogin/);
  assert.match(manualHandler, /supplierImageOpenLogin\(\)/);
  assert.match(viewSource, /onClick=\{handleConnectSupplierSession\}[\s\S]{0,700}Iniciar sesion/);
  assert.match(viewSource, /onClick=\{handleOpenSupplierLogin\}[\s\S]{0,700}(Acceso manual|Abrir proveedor)/);
  assert.match(viewSource, /Rebu no guarda tu clave/);
});

test('expired supplier searches invalidate the cached session indicator', async () => {
  const mainSource = await readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8');
  const invalidations = mainSource.match(/if \(result\?\.status === 'login_required'\) supplierSessionVerified = false;/g) || [];
  assert.equal(invalidations.length, 2);
});
