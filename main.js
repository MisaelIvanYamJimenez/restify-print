const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const AutoLaunch = require('auto-launch');
const wsServer = require('./src/websocket-server');
const tray = require('./src/tray');
const { getToken, setToken, clearToken } = require('./src/security');
const { getSavedPrinters, clearPrinterConfig } = require('./src/printer');

let mainWindow = null;

const autoLauncher = new AutoLaunch({
  name: 'Restify Print',
  path: app.getPath('exe'),
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(async () => {
  createWindow();

  tray.create(mainWindow);

  wsServer.start((status) => {
    tray.updateMenu(mainWindow, status === 'connected' ? 'Conectado' : 'Error');
  });

  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (!isEnabled) {
      await autoLauncher.enable();
    }
  } catch (error) {
    console.error('Error al configurar auto-launch:', error);
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  wsServer.stop();
  tray.destroy();
});

// IPC: comunicacion entre la UI y el proceso principal
ipcMain.handle('get-token', () => {
  return getToken();
});

ipcMain.handle('set-token', (event, token) => {
  setToken(token);
  tray.updateMenu(mainWindow, 'Conectado');
  return { success: true };
});

ipcMain.handle('clear-token', () => {
  clearToken();
  clearPrinterConfig();
  tray.updateMenu(mainWindow, 'Sin token');
  return { success: true };
});

ipcMain.handle('get-saved-printers', () => {
  return getSavedPrinters();
});
