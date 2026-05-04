const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

const APP_NAME = 'Rebu Cotillon System';
const isDev = !app.isPackaged;

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
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

app.on('ready', () => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.supabase.co/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'http://localhost';
      details.requestHeaders['Referer'] = 'http://localhost/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  ipcMain.handle('save-as-pdf', async (event, defaultName) => {
    try {
      const isPackaged = app.isPackaged;
      const basePath = isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
      const suggestedPath = path.join(basePath, defaultName);

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
