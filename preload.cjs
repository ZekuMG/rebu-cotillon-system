const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAsPdf: (defaultName) => ipcRenderer.invoke('save-as-pdf', defaultName),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  clearHostResolverCache: () => ipcRenderer.invoke('clear-host-resolver-cache'),
  openExternalUrl: (targetUrl) => ipcRenderer.invoke('open-external-url', targetUrl),
  supplierOpenUrl: (targetUrl) => ipcRenderer.invoke('supplier-open-url', targetUrl),
  supplierImageOpenLogin: () => ipcRenderer.invoke('supplier-image-open-login'),
  supplierSessionConnect: () => ipcRenderer.invoke('supplier-session-connect'),
  supplierSessionVerify: () => ipcRenderer.invoke('supplier-session-verify'),
  supplierSessionLogout: () => ipcRenderer.invoke('supplier-session-logout'),
  supplierImageLoginState: () => ipcRenderer.invoke('supplier-image-login-state'),
  supplierImageSearch: (request) => ipcRenderer.invoke('supplier-image-search', request),
  supplierPriceSearch: (request) => ipcRenderer.invoke('supplier-price-search', request),
  openAIImageEdit: (request) => ipcRenderer.invoke('openai-image-edit', request),
  whatsappBotRequest: (request) => ipcRenderer.invoke('whatsapp-bot-request', request),
  getWhatsAppAccessDevice: () => ipcRenderer.invoke('get-whatsapp-access-device'),
  getWhatsAppCentralCandidate: () => ipcRenderer.invoke('get-whatsapp-central-candidate'),
  activateWhatsAppCentralMachine: (deviceId) => ipcRenderer.invoke('activate-whatsapp-central-machine', deviceId),
  deactivateWhatsAppCentralMachine: (deviceId) => ipcRenderer.invoke('deactivate-whatsapp-central-machine', deviceId),
  generateWhatsAppBudgetPdf: (payload) => ipcRenderer.invoke('generate-whatsapp-budget-pdf', payload),
  saveSupplierPriceReportPdf: (payload) => ipcRenderer.invoke('save-supplier-price-report-pdf', payload),
  captureExportPdf: () => ipcRenderer.invoke('capture-export-pdf'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
});
