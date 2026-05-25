const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAsPdf: (defaultName) => ipcRenderer.invoke('save-as-pdf', defaultName),
  printSilent: () => ipcRenderer.invoke('print-silent'),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
});
