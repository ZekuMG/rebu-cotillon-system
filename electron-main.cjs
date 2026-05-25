const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow;

const APP_NAME = 'Rebu Cotillon System';
const isDev = !app.isPackaged;
const sanitizePdfFileName = (value) => {
  const fallback = 'rebu-documento.pdf';
  const baseName = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 120);
  return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName || 'rebu-documento'}.pdf`;
};

const isTrustedIpcSender = (event) => Boolean(mainWindow && event?.sender === mainWindow.webContents);

const isAllowedAppNavigation = (targetUrl) => {
  try {
    const parsedUrl = new URL(targetUrl);
    const currentUrl = mainWindow?.webContents?.getURL?.() || '';
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : '';
    if (isDev && parsedUrl.origin === currentOrigin) return true;
    return parsedUrl.protocol === 'file:';
  } catch {
    return false;
  }
};

const getPrimaryLocalIp = () => {
  try {
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const net of interfaces || []) {
        const isIPv4 = net?.family === 'IPv4' || net?.family === 4;
        if (isIPv4 && !net.internal && net.address) return net.address;
      }
    }
  } catch {
    return null;
  }
  return null;
};

app.setName(APP_NAME);

if (isDev) {
  const devDataPath = path.join(app.getPath('appData'), 'RebuCotillonSystemDev');
  const devSessionPath = path.join(devDataPath, 'Session');
  const devCachePath = path.join(devDataPath, 'Cache');

  fs.mkdirSync(devSessionPath, { recursive: true });
  fs.mkdirSync(devCachePath, { recursive: true });

  app.setPath('userData', devDataPath);
  app.setPath('sessionData', devSessionPath);
  app.commandLine.appendSwitch('disk-cache-dir', devCachePath);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_NAME,
    icon: path.join(__dirname, 'public/rebu-logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedAppNavigation(targetUrl)) return;
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

app.on('ready', () => {
  ipcMain.handle('save-as-pdf', async (event, defaultName) => {
    try {
      if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };
      const isPackaged = app.isPackaged;
      const basePath = isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
      const suggestedPath = path.join(basePath, sanitizePdfFileName(defaultName));

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: suggestedPath,
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
      });

      if (!filePath) return { success: false, canceled: true };

      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        marginsType: 0,
      });

      fs.writeFileSync(filePath, pdfData);

      return { success: true, filePath };
    } catch (error) {
      console.error('Error generando PDF:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('print-silent', async (event) => {
    try {
      if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };
      if (!mainWindow) return { success: false, error: 'Ventana no disponible' };
      mainWindow.webContents.print({ silent: true, printBackground: true });
      return { success: true };
    } catch (error) {
      console.error('Error imprimiendo:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-device-info', async (event) => {
    if (!isTrustedIpcSender(event)) return null;
    return {
      deviceName: os.hostname?.() || 'Equipo desconocido',
      ipAddress: getPrimaryLocalIp() || 'No disponible',
      platform: `${os.platform?.() || 'desktop'} ${os.release?.() || ''}`.trim(),
      runtime: 'Electron',
    };
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

autoUpdater.on('update-available', () => {
  console.log('Actualizacion disponible');
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});
