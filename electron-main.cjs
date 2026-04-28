const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Cotillón Rebu System',
    icon: path.join(__dirname, 'public/rebu-logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Esto ya lo tenÃ­as, Â¡es vital dejarlo asÃ­!
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

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

  // âœ¨ MOTOR DE GENERACIÃ“N DE PDF NATIVO (SIN VENTANA DE IMPRESIÃ“N)
  ipcMain.handle('save-as-pdf', async (event, defaultName) => {
    try {
      // Obtener la ruta donde está el ejecutable (.exe)
      const isPackaged = app.isPackaged;
      // Si está compilado (exe), guardamos al lado del exe. Si está en desarrollo, en la carpeta del proyecto.
      const basePath = isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
      const suggestedPath = path.join(basePath, defaultName);

      // 1. Abrimos la ventana NATVA de Windows "Guardar como..."
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: suggestedPath,
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
      });

      if (!filePath) return { success: false, canceled: true }; // El usuario canceló

      // 2. Le pedimos a Electron que renderice la vista actual en formato PDF (Silencioso)
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        marginsType: 0 
      });

      // 3. Escribimos el archivo en el disco
      fs.writeFileSync(filePath, pdfData);
      
      return { success: true, filePath };
    } catch (error) {
      console.error('Error generando PDF:', error);
      return { success: false, error: error.message };
    }
  });

  // DespuÃ©s de configurar el "disfraz", abrimos la ventana
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
