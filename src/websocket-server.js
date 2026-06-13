const { WebSocketServer } = require('ws');
const { WS_PORT } = require('./config');
const { isOriginAllowed, validateRequest } = require('./security');
const {
  printTicket,
  printTest,
  openCashDrawer,
  getSystemPrinters,
  getSavedPrinters,
  savePrinterConfig,
} = require('./printer');

let wss = null;
let onStatusChange = null;

function start(statusCallback) {
  onStatusChange = statusCallback;

  wss = new WebSocketServer({ port: WS_PORT });

  wss.on('listening', () => {
    console.log(`WebSocket escuchando en puerto ${WS_PORT}`);
    if (onStatusChange) onStatusChange('connected');
  });

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;

    if (!isOriginAllowed(origin)) {
      ws.close(4001, 'Origin no permitido');
      console.log(`Conexion rechazada de: ${origin}`);
      return;
    }

    console.log(`Conexion aceptada de: ${origin}`);

    ws.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'JSON invalido' }));
        return;
      }

      try {
        const result = await handleMessage(message, origin);
        ws.send(JSON.stringify(result));
      } catch (error) {
        ws.send(JSON.stringify({ error: error.message }));
      }
    });

    ws.on('close', () => {
      console.log('Cliente desconectado');
    });
  });

  wss.on('error', (error) => {
    console.error('Error en WebSocket:', error.message);
    if (onStatusChange) onStatusChange('error');
  });
}

async function handleMessage(message, origin) {
  const { action, token } = message;

  // Acciones que no requieren token (para configuracion inicial)
  if (action === 'ping') {
    return { status: 'ok', app: 'restify-print', version: '1.0.0' };
  }

  // Validar token para todo lo demas
  const validation = validateRequest(origin, token);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  switch (action) {
    case 'list_printers': {
      const system = await getSystemPrinters();
      const saved = getSavedPrinters();
      return { printers: system, assigned: saved };
    }

    case 'assign_printer': {
      const { printerType, printerName } = message;
      if (!['cashier', 'kitchen'].includes(printerType)) {
        throw new Error('Tipo de impresora invalido. Usa: cashier o kitchen');
      }
      savePrinterConfig(printerType, printerName);
      return { success: true, message: `Impresora ${printerType} asignada: ${printerName}` };
    }

    case 'print': {
      const { printerType, ticket, openDrawer } = message;
      if (!['cashier', 'kitchen'].includes(printerType)) {
        throw new Error('Tipo de impresora invalido');
      }
      const result = await printTicket(printerType, ticket, openDrawer);
      return result;
    }

    case 'open_drawer': {
      const result = await openCashDrawer();
      return result;
    }

    case 'test_print': {
      const { printerType, businessName, branchName } = message;
      if (!['cashier', 'kitchen'].includes(printerType)) {
        throw new Error('Tipo de impresora invalido');
      }
      const result = await printTest(printerType, businessName, branchName);
      return result;
    }

    case 'get_config': {
      const saved = getSavedPrinters();
      return { printers: saved };
    }

    default:
      throw new Error(`Accion desconocida: ${action}`);
  }
}

function stop() {
  if (wss) {
    wss.close();
    wss = null;
  }
}

module.exports = { start, stop };
