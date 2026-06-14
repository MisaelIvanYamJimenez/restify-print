const Store = require('electron-store').default;
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const store = new Store();

// Comandos ESC/POS
const ESC = 0x1b;
const GS = 0x1d;
const COMMANDS = {
  INIT: Buffer.from([ESC, 0x40]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  TEXT_NORMAL: Buffer.from([ESC, 0x21, 0x00]),
  TEXT_DOUBLE: Buffer.from([ESC, 0x21, 0x30]),
  TEXT_DOUBLE_WIDTH: Buffer.from([ESC, 0x21, 0x20]),
  TEXT_DOUBLE_HEIGHT: Buffer.from([ESC, 0x21, 0x10]),
  FEED_3: Buffer.from([ESC, 0x64, 0x03]),
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x42, 0x00]),
  CASH_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
  LINE_FEED: Buffer.from([0x0a]),
};

const PAPER_WIDTHS = { 80: 48, 58: 32 };
const DEFAULT_LINE_WIDTH = 48;

// Generador de bytes ESC/POS
class TicketBuilder {
  constructor(lineWidth = DEFAULT_LINE_WIDTH) {
    this.buffer = [];
    this.lineWidth = lineWidth;
  }

  raw(buf) {
    this.buffer.push(buf);
    return this;
  }

  text(str) {
    this.buffer.push(Buffer.from(str, 'latin1'));
    return this;
  }

  println(str = '') {
    return this.text(str).raw(COMMANDS.LINE_FEED);
  }

  bold(on) {
    return this.raw(on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF);
  }

  alignCenter() { return this.raw(COMMANDS.ALIGN_CENTER); }
  alignLeft() { return this.raw(COMMANDS.ALIGN_LEFT); }
  alignRight() { return this.raw(COMMANDS.ALIGN_RIGHT); }

  textNormal() { return this.raw(COMMANDS.TEXT_NORMAL); }
  textDouble() { return this.raw(COMMANDS.TEXT_DOUBLE); }

  drawLine(char = '-') {
    return this.println(char.repeat(this.lineWidth));
  }

  tableRow(left, right, width) {
    width = width || this.lineWidth;
    const space = width - left.length - right.length;
    const padding = space > 0 ? ' '.repeat(space) : ' ';
    return this.println(`${left}${padding}${right}`);
  }

  table3Col(col1, col2, col3, w1 = 6, w3 = 12) {
    const c1 = col1.toString().padEnd(w1);
    const c3 = col3.toString().padStart(w3);
    const w2 = this.lineWidth - w1 - w3;
    const c2 = col2.toString().substring(0, w2).padEnd(w2);
    return this.println(`${c1}${c2}${c3}`);
  }

  cut() {
    // Avanza 3 lineas, corta, avanza 3 lineas para que salga el papel
    return this.raw(COMMANDS.FEED_3).raw(COMMANDS.CUT_PARTIAL).raw(COMMANDS.FEED_3);
  }
  openDrawer() { return this.raw(COMMANDS.CASH_DRAWER); }

  build() {
    return Buffer.concat(this.buffer);
  }
}

// Enviar bytes RAW a la impresora de Windows usando winspool API via PowerShell
async function sendRawToWindowsPrinter(printerName, data) {
  const tmpFile = path.join(os.tmpdir(), `restify-print-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, data);

  const escapedName = printerName.replace(/'/g, "''");
  const escapedFile = tmpFile.replace(/\\/g, '\\\\');

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct DOCINFOW { public string pDocName; public string pOutputFile; public string pDatatype; }
    [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    public static string SendRaw(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return "OpenPrinter fallo: " + Marshal.GetLastWin32Error();
        var di = new DOCINFOW() { pDocName = "RestifyPrint", pDatatype = "RAW" };
        if (!StartDocPrinter(hPrinter, 1, ref di)) { ClosePrinter(hPrinter); return "StartDoc fallo: " + Marshal.GetLastWin32Error(); }
        StartPagePrinter(hPrinter);
        int written;
        bool ok = WritePrinter(hPrinter, data, data.Length, out written);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        if (!ok) return "WritePrinter fallo: " + Marshal.GetLastWin32Error();
        return "OK:" + written;
    }
}
"@
\\$d = [System.IO.File]::ReadAllBytes('${escapedFile}')
\\$r = [RawPrint]::SendRaw('${escapedName}', \\$d)
Write-Output \\$r
`.trim();

  return new Promise((resolve, reject) => {
    const psFile = path.join(os.tmpdir(), `restify-ps-${Date.now()}.ps1`);
    fs.writeFileSync(psFile, psScript.replace(/\\\$/g, '$'), 'utf8');

    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 15000 },
      (error, stdout) => {
        // Limpiar archivos temporales
        try { fs.unlinkSync(tmpFile); } catch {}
        try { fs.unlinkSync(psFile); } catch {}

        const output = (stdout || '').trim();

        if (error || !output.startsWith('OK:')) {
          reject(new Error(output || 'No se pudo enviar a la impresora'));
        } else {
          resolve();
        }
      }
    );
  });
}

function getSavedPrinters() {
  const printers = store.get('printers', { cashier: null, kitchen: null });
  // Migrar formato antiguo (string) al nuevo (objeto con name y paperSize)
  for (const type of ['cashier', 'kitchen']) {
    if (typeof printers[type] === 'string') {
      printers[type] = { name: printers[type], paperSize: 80 };
      store.set('printers', printers);
    }
  }
  return printers;
}

function savePrinterConfig(type, printerName, paperSize = 80) {
  const printers = getSavedPrinters();
  printers[type] = { name: printerName, paperSize };
  store.set('printers', printers);
}

function clearPrinterConfig() {
  store.set('printers', { cashier: null, kitchen: null });
}

function getLineWidth(printerType) {
  const printers = getSavedPrinters();
  const printer = printers[printerType];
  if (!printer) return DEFAULT_LINE_WIDTH;
  return PAPER_WIDTHS[printer.paperSize] || DEFAULT_LINE_WIDTH;
}

async function getSystemPrinters() {
  return new Promise((resolve) => {
    exec(
      'wmic printer get Name,PortName,Shared /format:csv',
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const printers = stdout
          .split('\n')
          .filter((line) => line.trim() && !line.includes('Node,'))
          .map((line) => {
            const parts = line.trim().split(',');
            if (parts.length >= 3) {
              return parts[1]?.trim();
            }
            return null;
          })
          .filter(Boolean);
        resolve(printers);
      }
    );
  });
}

async function printTicket(printerType, ticketData, openDrawer = false) {
  const printers = getSavedPrinters();
  const printer = printers[printerType];

  if (!printer || !printer.name) {
    throw new Error(`No hay impresora asignada para: ${printerType}`);
  }

  const printerName = printer.name;
  const lineWidth = getLineWidth(printerType);
  const t = new TicketBuilder(lineWidth);

  // Encabezado
  t.alignCenter().bold(true).textDouble();
  t.println(ticketData.businessName || 'RESTAURANTE');
  t.bold(false).textNormal();

  if (ticketData.branchName) {
    t.println(ticketData.branchName);
  }

  t.drawLine();

  if (ticketData.type === 'comanda') {
    buildComanda(t, ticketData);
  } else if (ticketData.type === 'receipt') {
    buildReceipt(t, ticketData);
  } else if (ticketData.type === 'precuenta') {
    buildPrecuenta(t, ticketData);
  }

  t.cut();

  if (openDrawer && printerType === 'cashier') {
    t.openDrawer();
  }

  try {
    await sendRawToWindowsPrinter(printerName, t.build());
    return { success: true };
  } catch (error) {
    throw new Error(`Error al imprimir: ${error.message}`);
  }
}

function buildComanda(t, data) {
  t.alignCenter().bold(true).textDouble();
  t.println('COMANDA');
  t.bold(false).textNormal();

  t.alignLeft();
  if (data.ticketNumber) {
    t.println(`Orden #: ${data.ticketNumber}`);
  }
  t.println(`Mesa: ${data.table || '-'}`);
  t.println(`Mesero: ${data.waiter || '-'}`);
  t.println(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  t.drawLine();

  t.bold(true);
  t.tableRow('Cant  Producto', '');
  t.bold(false);
  t.drawLine();

  for (const item of data.items || []) {
    t.println(`${String(item.qty).padEnd(6)}${item.name}`);
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const qtyStr = mod.qty > 1 ? ` x${mod.qty}` : '';
        t.println(`      + ${mod.group}: ${mod.name}${qtyStr}`);
      }
    }
    if (item.notes) {
      t.println(`      >> ${item.notes}`);
    }
  }

  t.drawLine();

  if (data.notes) {
    t.println(`NOTAS: ${data.notes}`);
    t.drawLine();
  }
}

function buildReceipt(t, data) {
  t.alignCenter().bold(true);
  t.println('TICKET DE VENTA');
  t.bold(false);

  t.alignLeft();
  t.println(`Mesa: ${data.table || '-'}`);
  t.println(`Atendio: ${data.waiter || '-'}`);
  t.println(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  if (data.ticketNumber) {
    t.println(`Ticket #: ${data.ticketNumber}`);
  }
  t.drawLine();

  t.bold(true);
  t.table3Col('Cant', 'Producto', 'Precio');
  t.bold(false);
  t.drawLine();

  for (const item of data.items || []) {
    const total = (item.qty * item.price).toFixed(2);
    t.table3Col(item.qty, item.name, `$${total}`);
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const qtyStr = mod.qty > 1 ? ` x${mod.qty}` : '';
        t.println(`      + ${mod.group}: ${mod.name}${qtyStr}`);
      }
    }
  }

  t.drawLine();

  if (data.subtotal != null) {
    t.tableRow('Subtotal:', `$${data.subtotal.toFixed(2)}`);
  }

  if (data.tip != null && data.tip > 0) {
    t.tableRow('Propina:', `$${data.tip.toFixed(2)}`);
  }

  t.bold(true).textDouble();
  t.tableRow('TOTAL:', `$${(data.total || 0).toFixed(2)}`);
  t.bold(false).textNormal();

  t.drawLine();

  if (data.paymentMethod) {
    t.println(`Pago: ${data.paymentMethod}`);
  }

  if (data.cashReceived != null) {
    t.println(`Recibido: $${data.cashReceived.toFixed(2)}`);
    const change = data.cashReceived - (data.total || 0);
    t.println(`Cambio: $${change.toFixed(2)}`);
  }

  t.drawLine();
  t.alignCenter();
  t.println('Gracias por su visita');
}

function buildPrecuenta(t, data) {
  t.alignCenter().bold(true);
  t.println('PRE-CUENTA');
  t.println('(Este no es un comprobante de pago)');
  t.bold(false);

  t.alignLeft();
  t.println(`Mesa: ${data.table || '-'}`);
  t.println(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  t.drawLine();

  for (const item of data.items || []) {
    const total = (item.qty * item.price).toFixed(2);
    t.table3Col(item.qty, item.name, `$${total}`);
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const qtyStr = mod.qty > 1 ? ` x${mod.qty}` : '';
        t.println(`      + ${mod.group}: ${mod.name}${qtyStr}`);
      }
    }
  }

  t.drawLine();
  t.bold(true);
  t.tableRow('TOTAL:', `$${(data.total || 0).toFixed(2)}`);
  t.bold(false);
}

async function printTest(printerType, businessName, branchName) {
  const printers = getSavedPrinters();
  const printer = printers[printerType];

  if (!printer || !printer.name) {
    throw new Error(`No hay impresora asignada para: ${printerType}`);
  }

  const printerName = printer.name;
  const lineWidth = getLineWidth(printerType);
  const t = new TicketBuilder(lineWidth);

  t.alignCenter();
  t.drawLine();
  t.bold(true).textDouble();
  t.println('PRUEBA DE IMPRESION');
  t.bold(false).textNormal();
  t.drawLine();
  t.println('');
  t.bold(true);
  t.println(businessName || 'RESTAURANTE');
  t.bold(false);

  if (branchName) {
    t.println(branchName);
  }

  t.println('');
  t.println(`Impresora: ${printerName}`);
  t.println(`Tipo: ${printerType === 'cashier' ? 'Caja' : 'Cocina'}`);
  t.println(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  t.println('');
  t.drawLine();
  t.println('Si puedes leer esto, la');
  t.println('impresora esta funcionando');
  t.println('correctamente.');
  t.drawLine();

  t.cut();

  if (printerType === 'cashier') {
    t.openDrawer();
  }

  try {
    await sendRawToWindowsPrinter(printerName, t.build());
    return { success: true, message: `Prueba impresa en: ${printerName}` };
  } catch (error) {
    throw new Error(`Error en prueba de impresion: ${error.message}`);
  }
}

async function openCashDrawer() {
  const printers = getSavedPrinters();
  const printerName = printers.cashier?.name;

  if (!printerName) {
    throw new Error('No hay impresora de caja asignada');
  }

  const t = new TicketBuilder();
  t.openDrawer();

  try {
    await sendRawToWindowsPrinter(printerName, t.build());
    return { success: true };
  } catch (error) {
    throw new Error(`Error al abrir cajon: ${error.message}`);
  }
}

module.exports = {
  getSavedPrinters,
  savePrinterConfig,
  clearPrinterConfig,
  getSystemPrinters,
  printTicket,
  printTest,
  openCashDrawer,
};
