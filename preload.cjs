const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAsPdf: (defaultName) => ipcRenderer.invoke('save-as-pdf', defaultName),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  clearHostResolverCache: () => ipcRenderer.invoke('clear-host-resolver-cache'),
  openExternalUrl: (targetUrl) => ipcRenderer.invoke('open-external-url', targetUrl),
  supplierImageOpenLogin: () => ipcRenderer.invoke('supplier-image-open-login'),
  supplierImageLoginState: () => ipcRenderer.invoke('supplier-image-login-state'),
  supplierImageSearch: (request) => ipcRenderer.invoke('supplier-image-search', request),
});
