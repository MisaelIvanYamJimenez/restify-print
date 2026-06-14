const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restifyPrint', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  getSavedPrinters: () => ipcRenderer.invoke('get-saved-printers'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, version) => callback(version)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, version) => callback(version)),
});
