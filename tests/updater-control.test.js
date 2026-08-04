import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createUpdateManager } = require('../electron-update-manager.cjs');

class FakeAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = 0;
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    this.emit('checking-for-update');
    this.emit('update-available', { version: '1.1.19' });
    return { updateInfo: { version: '1.1.19' } };
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    this.emit('download-progress', { percent: 42.4 });
    this.emit('update-downloaded', { version: '1.1.19' });
    return ['installer.exe'];
  }

  quitAndInstall() {
    this.installCalls += 1;
  }
}

const createManagerFixture = () => {
  const updater = new FakeAutoUpdater();
  const app = { isPackaged: true, getVersion: () => '1.1.18' };
  const manager = createUpdateManager({
    autoUpdater: updater,
    app,
    scheduleInstall: (callback) => callback(),
  });
  return { updater, manager };
};

test('detecta una version nueva sin descargarla automaticamente', async () => {
  const { updater, manager } = createManagerFixture();

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);

  const result = await manager.checkForUpdates();

  assert.equal(result.success, true);
  assert.equal(updater.checkCalls, 1);
  assert.equal(updater.downloadCalls, 0);
  assert.equal(updater.installCalls, 0);
  assert.equal(manager.getState().phase, 'available');
  assert.equal(manager.getState().latestVersion, '1.1.19');
});

test('solo descarga e instala despues de las acciones manuales', async () => {
  const { updater, manager } = createManagerFixture();
  await manager.checkForUpdates();

  const downloadResult = await manager.downloadUpdate();

  assert.equal(downloadResult.success, true);
  assert.equal(updater.downloadCalls, 1);
  assert.equal(updater.installCalls, 0);
  assert.equal(manager.getState().phase, 'downloaded');
  assert.equal(manager.getState().progress, 100);

  const installResult = manager.installUpdate();

  assert.equal(installResult.success, true);
  assert.equal(updater.installCalls, 1);
  assert.equal(manager.getState().phase, 'installing');
});

test('un error queda visible y no dispara descarga ni instalacion', async () => {
  const updater = new FakeAutoUpdater();
  updater.checkForUpdates = async function checkWithFailure() {
    this.checkCalls += 1;
    this.emit('checking-for-update');
    const error = new Error('latest.yml no disponible');
    this.emit('error', error);
    throw error;
  };
  const manager = createUpdateManager({
    autoUpdater: updater,
    app: { isPackaged: true, getVersion: () => '1.1.18' },
  });

  const result = await manager.checkForUpdates();

  assert.equal(result.success, false);
  assert.equal(manager.getState().phase, 'error');
  assert.match(manager.getState().error, /latest\.yml/);
  assert.equal(updater.downloadCalls, 0);
  assert.equal(updater.installCalls, 0);
});

test('el modo desarrollo no consulta GitHub ni simula una actualizacion', async () => {
  const updater = new FakeAutoUpdater();
  const manager = createUpdateManager({
    autoUpdater: updater,
    app: { isPackaged: false, getVersion: () => '1.1.18' },
  });

  const result = await manager.checkForUpdates();

  assert.equal(result.success, false);
  assert.equal(updater.checkCalls, 0);
  assert.equal(manager.getState().phase, 'development');
});
