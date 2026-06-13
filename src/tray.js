const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { getToken } = require('./security');
const { getSavedPrinters } = require('./printer');

let tray = null;

function create(mainWindow) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon;

  try {
    icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Restify Print');

  updateMenu(mainWindow);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

function updateMenu(mainWindow, status = 'Conectado') {
  const token = getToken();
  const printers = getSavedPrinters();

  const tokenLabel = token
    ? `Token: ${token.substring(0, 8)}...`
    : 'Token: No configurado';

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Restify Print', enabled: false },
    { type: 'separator' },
    { label: `Estado: ${token ? status : 'Sin token'}`, enabled: false },
    { label: tokenLabel, enabled: false },
    { type: 'separator' },
    {
      label: `Caja: ${printers.cashier || 'No asignada'}`,
      enabled: false,
    },
    {
      label: `Cocina: ${printers.kitchen || 'No asignada'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Abrir configuracion',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Salir',
      click: () => {
        const { app } = require('electron');
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { create, updateMenu, destroy };
