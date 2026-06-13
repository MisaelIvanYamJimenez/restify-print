const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restifyPrint', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  getSavedPrinters: () => ipcRenderer.invoke('get-saved-printers'),
});
