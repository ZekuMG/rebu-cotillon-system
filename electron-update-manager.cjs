const UPDATE_CHANNEL = 'update-status';

const getErrorMessage = (error) =>
  String(error?.message || error || 'No se pudo comprobar la actualizacion.');

const createUpdateManager = ({
  autoUpdater,
  app,
  getWindow = () => null,
  scheduleInstall = (callback) => setImmediate(callback),
} = {}) => {
  if (!autoUpdater || !app) {
    throw new Error('El administrador de actualizaciones requiere autoUpdater y app.');
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let revision = 0;
  let checkPromise = null;
  let downloadPromise = null;
  let state = {
    phase: 'idle',
    currentVersion: String(app.getVersion?.() || ''),
    latestVersion: null,
    progress: null,
    error: null,
    checkedAt: null,
    revision,
    isPackaged: Boolean(app.isPackaged),
  };

  const getState = () => ({ ...state });

  const broadcast = () => {
    const targetWindow = getWindow();
    if (!targetWindow || targetWindow.isDestroyed?.()) return;
    if (!targetWindow.webContents || targetWindow.webContents.isDestroyed?.()) return;
    targetWindow.webContents.send(UPDATE_CHANNEL, getState());
  };

  const transition = (patch) => {
    revision += 1;
    state = {
      ...state,
      ...(patch || {}),
      revision,
    };
    broadcast();
    return getState();
  };

  autoUpdater.on('checking-for-update', () => {
    transition({ phase: 'checking', progress: null, error: null });
  });

  autoUpdater.on('update-available', (info = {}) => {
    transition({
      phase: 'available',
      latestVersion: info.version ? String(info.version) : state.latestVersion,
      progress: null,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on('update-not-available', (info = {}) => {
    transition({
      phase: 'up-to-date',
      latestVersion: info.version ? String(info.version) : state.currentVersion,
      progress: null,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on('download-progress', (progress = {}) => {
    const percent = Number(progress.percent);
    transition({
      phase: 'downloading',
      progress: Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null,
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info = {}) => {
    transition({
      phase: 'downloaded',
      latestVersion: info.version ? String(info.version) : state.latestVersion,
      progress: 100,
      error: null,
    });
  });

  autoUpdater.on('error', (error) => {
    transition({
      phase: 'error',
      progress: null,
      error: getErrorMessage(error),
      checkedAt: new Date().toISOString(),
    });
  });

  const checkForUpdates = async () => {
    if (!app.isPackaged) {
      return {
        success: false,
        state: transition({ phase: 'development', error: null }),
        error: 'La comprobacion remota solo se ejecuta en una aplicacion empaquetada.',
      };
    }

    if (checkPromise) return checkPromise;

    transition({ phase: 'checking', progress: null, error: null });
    checkPromise = Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .then(() => ({ success: true, state: getState() }))
      .catch((error) => {
        if (state.phase !== 'error' || state.error !== getErrorMessage(error)) {
          transition({
            phase: 'error',
            progress: null,
            error: getErrorMessage(error),
            checkedAt: new Date().toISOString(),
          });
        }
        return { success: false, error: getErrorMessage(error), state: getState() };
      })
      .finally(() => {
        checkPromise = null;
      });

    return checkPromise;
  };

  const downloadUpdate = async () => {
    if (state.phase !== 'available') {
      return {
        success: false,
        error: 'No hay una actualizacion disponible para descargar.',
        state: getState(),
      };
    }

    if (downloadPromise) return downloadPromise;

    transition({ phase: 'downloading', progress: 0, error: null });
    downloadPromise = Promise.resolve()
      .then(() => autoUpdater.downloadUpdate())
      .then(() => {
        if (state.phase === 'downloading') {
          transition({ phase: 'downloaded', progress: 100, error: null });
        }
        return { success: true, state: getState() };
      })
      .catch((error) => {
        if (state.phase !== 'error' || state.error !== getErrorMessage(error)) {
          transition({ phase: 'error', progress: null, error: getErrorMessage(error) });
        }
        return { success: false, error: getErrorMessage(error), state: getState() };
      })
      .finally(() => {
        downloadPromise = null;
      });

    return downloadPromise;
  };

  const installUpdate = () => {
    if (state.phase !== 'downloaded') {
      return {
        success: false,
        error: 'La actualizacion todavia no esta lista para instalar.',
        state: getState(),
      };
    }

    const nextState = transition({ phase: 'installing', error: null });
    scheduleInstall(() => autoUpdater.quitAndInstall(false, true));
    return { success: true, state: nextState };
  };

  return {
    getState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
};

module.exports = {
  UPDATE_CHANNEL,
  createUpdateManager,
};
