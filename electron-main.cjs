const { app, BrowserWindow, ipcMain, session } = require('electron'); // AÑADIMOS 'session' AQUÍ
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Cotillón Rebu System",
    icon: path.join(__dirname, 'public/favicon.svg'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Esto ya lo tenías, ¡es vital dejarlo así!
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

// 👇 AQUÍ ESTÁ LA MAGIA 👇
app.on('ready', () => {
  // Interceptamos la red ANTES de que salga la petición
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.supabase.co/*'] }, // Solo afectamos las peticiones a Supabase
    (details, callback) => {
      // Engañamos a Supabase forzando el Origin y el Referer
      details.requestHeaders['Origin'] = 'http://localhost';
      details.requestHeaders['Referer'] = 'http://localhost/';
      
      // Enviamos la petición modificada
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Después de configurar el "disfraz", abrimos la ventana
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

autoUpdater.on('update-available', () => {
  console.log('Actualización disponible');
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});