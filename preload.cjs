const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAsPdf: (defaultName) => ipcRenderer.invoke('save-as-pdf', defaultName),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
});
