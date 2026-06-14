const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const AutoLaunch = require('auto-launch');
const wsServer = require('./src/websocket-server');
const tray = require('./src/tray');
const { getToken, setToken, clearToken } = require('./src/security');
const { getSavedPrinters, clearPrinterConfig } = require('./src/printer');

let mainWindow = null;

if (!app.isPackaged && process.argv.length <= 1) {
  app.quit();
}

const autoLauncher = new AutoLaunch({
  name: 'Restify Print',
  path: app.getPath('exe'),
  args: ['--hidden'],
});

function createWindow(hidden = false) {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    show: !hidden,
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
  const launchedAtStartup = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
  createWindow(launchedAtStartup);

  tray.create(mainWindow);

  wsServer.start((status) => {
    tray.updateMenu(mainWindow, status === 'connected' ? 'Conectado' : 'Error');
  });

  if (app.isPackaged) {
    try {
      const isEnabled = await autoLauncher.isEnabled();
      if (!isEnabled) {
        await autoLauncher.enable();
      }
    } catch (error) {
      console.error('Error al configurar auto-launch:', error);
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 2 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });
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

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});
