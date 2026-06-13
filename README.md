# Restify Print

Aplicacion de escritorio que conecta tu sistema web Restify con impresoras termicas de 80mm y cajon de dinero.

## Requisitos

- Windows 10/11
- Node.js 18+
- Impresora termica 80mm conectada por USB

## Instalacion (desarrollo)

```bash
npm install
npm start
```

## Estructura del proyecto

```
impresora/
├── main.js                 # Proceso principal de Electron
├── preload.js              # Bridge entre UI y proceso principal
├── package.json            # Configuracion y dependencias
├── assets/
│   ├── icon.png            # Icono 256x256 (PNG)
│   └── icon.ico            # Icono para Windows
├── ui/
│   └── index.html          # Interfaz grafica
└── src/
    ├── config.js            # Origenes permitidos y puerto WebSocket
    ├── security.js          # Manejo de token y validacion de origen
    ├── printer.js           # TicketBuilder (ESC/POS) + impresion via winspool API
    ├── websocket-server.js  # Servidor WebSocket en puerto 9632
    └── tray.js              # Icono en bandeja del sistema
```

## Como funciona

1. El usuario instala la app y pega el token de su sucursal
2. La app levanta un servidor WebSocket en `localhost:9632`
3. La web de Restify se conecta al WebSocket y envia comandos de impresion
4. La app genera los bytes ESC/POS y los envia a la impresora via Windows Raw Print API (winspool.dll)

## Tipos de ticket

| Tipo | Descripcion | Impresora |
|------|-------------|-----------|
| `comanda` | Pedido para cocina (mesa, mesero, items con notas) | Cocina |
| `receipt` | Ticket de venta (items, subtotal, propina, total, pago, cambio) | Caja |
| `precuenta` | Pre-cuenta (items con precios, no es comprobante) | Caja |

## Impresoras soportadas

- 2 tipos: **Caja** (cashier) y **Cocina** (kitchen)
- Se asignan desde la web de Restify
- El cajon de dinero solo se abre con la impresora de Caja
- Si solo hay 1 impresora, se asigna como Caja y funciona normal

## Seguridad

- Solo acepta conexiones de origenes autorizados (configurados en `src/config.js`)
- Cada mensaje requiere el token de la sucursal
- El token se genera en la web de Restify por sucursal

## Compilar el instalador (.exe)

```bash
npm run build
```

El archivo se genera en `dist/Restify Print Setup X.X.X.exe`

## Publicar una actualizacion

La app se actualiza automaticamente via GitHub Releases. Sigue estos pasos en orden:

1. **Hacer los cambios** en el branch `dev`
2. **Subir la version** en `package.json` (ej. `"version": "1.1.0"`)
3. **Compilar** el nuevo instalador:
   ```bash
   npm run build
   ```
4. **Commit y push** de los cambios a `dev`:
   ```bash
   git add .
   git commit -m "descripcion del cambio"
   git push origin dev
   ```
5. **Merge a main** (produccion):
   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```
6. **Crear el Release en GitHub** con el .exe:
   ```bash
   gh release create v1.1.0 "dist/Restify Print Setup 1.1.0.exe" "dist/Restify Print Setup 1.1.0.exe.blockmap" --title "Restify Print v1.1.0" --notes "Descripcion de los cambios"
   ```
7. **Volver a dev** para seguir trabajando:
   ```bash
   git checkout dev
   ```

> Sin el paso 6 (crear el Release), la app instalada no detecta la nueva version.

## Puerto WebSocket

Puerto por defecto: `9632` (configurable en `src/config.js`)
