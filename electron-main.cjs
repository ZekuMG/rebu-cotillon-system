const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Cotillón Rebu System",
    icon: path.join(__dirname, 'public/favicon.svg'), // Asegúrate de tener un icono aquí
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Si estamos en desarrollo, espera a Vite. Si es producción, carga el archivo.
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  // Buscar actualizaciones apenas abre
  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Eventos de Actualización
autoUpdater.on('update-available', () => {
  // Aquí podrías avisarle al usuario (opcional)
  console.log('Actualización disponible');
});

autoUpdater.on('update-downloaded', () => {
  // Se instala sola al cerrar y abrir, o forzamos:
  autoUpdater.quitAndInstall();
});