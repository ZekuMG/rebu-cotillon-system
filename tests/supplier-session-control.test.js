import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('supplier session restores silently and logout only clears its isolated partition', async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../preload.cjs', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /ipcMain\.handle\('supplier-session-connect'/);
  assert.match(mainSource, /ipcMain\.handle\('supplier-session-verify'/);
  assert.match(mainSource, /ensureSupplierSessionWindow\(\{ show: false \}\)/);
  assert.match(mainSource, /ipcMain\.handle\('supplier-session-logout'/);
  assert.match(mainSource, /session\.fromPartition\(SUPPLIER_IMAGE_PARTITION\)/);
  assert.doesNotMatch(mainSource, /defaultSession\.clearStorageData/);
  assert.match(preloadSource, /supplierSessionConnect: \(\) => ipcRenderer\.invoke\('supplier-session-connect'\)/);
  assert.match(preloadSource, /supplierSessionVerify: \(\) => ipcRenderer\.invoke\('supplier-session-verify'\)/);
  assert.match(preloadSource, /supplierSessionLogout: \(\) => ipcRenderer\.invoke\('supplier-session-logout'\)/);
  assert.match(preloadSource, /supplierCredentialsSave: \(credentials\) => ipcRenderer\.invoke\('supplier-credentials-save', credentials\)/);
});

test('supplier credentials are encrypted by Electron and used for automatic login', async () => {
  const mainSource = await readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8');

  assert.match(mainSource, /safeStorage\s*\.encryptString/);
  assert.match(mainSource, /safeStorage\.decryptString/);
  assert.match(mainSource, /SUPPLIER_CREDENTIALS_FILE = 'casa-alberto-credentials\.json'/);
  assert.match(mainSource, /encryptedPayload/);
  assert.match(mainSource, /buildSupplierAutomaticLoginScript/);
  assert.match(mainSource, /loginSupplierWithStoredCredentials/);
  assert.match(mainSource, /verificationMethod: 'automatic_credentials'/);
  assert.match(mainSource, /ipcMain\.handle\('supplier-credentials-save'/);
  assert.match(mainSource, /SUPPLIER_LOGIN_URL = 'https:\/\/cotilloncasaalberto\.com\.ar\/pedido\/login\.php'/);
});

test('supplier verification reaches the restricted page without trusting the cached flag', async () => {
  const mainSource = await readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8');
  const verifyBlock = mainSource.match(/const verifySupplierSession = async \(\) => \{[\s\S]+?\n\};/)?.[0] || '';
  const restoreBlock = mainSource.match(/const restoreSupplierSession = async \(\) => \{[\s\S]+?\n\};/)?.[0] || '';

  assert.match(verifyBlock, /SUPPLIER_RESTRICTED_PATH/);
  assert.match(verifyBlock, /allowCached: false/);
  assert.match(verifyBlock, /verificationMethod: 'restricted_page'/);
  assert.match(restoreBlock, /allowCached: false/);
  assert.doesNotMatch(restoreBlock, /currentState\.isLikelyLoggedIn/);
});

test('primary login action never opens the supplier window', async () => {
  const viewSource = await readFile(new URL('../src/views/BulkEditorView.jsx', import.meta.url), 'utf8');
  const connectHandler = viewSource.match(/const handleConnectSupplierSession = async \(\) => \{([\s\S]*?)\n  \};/i)?.[1] || '';
  const manualHandler = viewSource.match(/const handleOpenSupplierLogin = async \(\) => \{([\s\S]*?)\n  \};/i)?.[1] || '';

  assert.match(connectHandler, /supplierSessionConnect\(\)/);
  assert.match(connectHandler, /credentialsRequired/);
  assert.match(connectHandler, /requestSupplierCredentials/);
  assert.match(connectHandler, /supplierSessionConnect\(\)[\s\S]+supplierSessionConnect\(\)/);
  assert.doesNotMatch(connectHandler, /supplierImageOpenLogin/);
  assert.match(manualHandler, /supplierImageOpenLogin\(\)/);
  assert.match(viewSource, /onClick=\{handleConnectSupplierSession\}[\s\S]{0,700}Iniciar sesion/);
  assert.match(viewSource, /onClick=\{handleOpenSupplierLogin\}[\s\S]{0,700}(Acceso manual|Abrir proveedor)/);
  assert.match(viewSource, /se guardan cifrados en este equipo/);
  assert.doesNotMatch(viewSource, /Rebu no guarda tu clave/);
});

test('expired supplier searches invalidate the cached session indicator', async () => {
  const mainSource = await readFile(new URL('../electron-main.cjs', import.meta.url), 'utf8');
  const invalidations = mainSource.match(/if \(result\?\.status === 'login_required'\) supplierSessionVerified = false;/g) || [];
  assert.equal(invalidations.length, 2);
});
