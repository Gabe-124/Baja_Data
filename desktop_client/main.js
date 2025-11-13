/**
 * Electron Main Process
 * 
 * Manages the main application window, serial port communication with the Waveshare USB LoRa module,
 * and IPC (inter-process communication) between the Node.js backend and the UI renderer.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const LoRaReceiver = require('./lora_receiver');
const fs = require('fs');

let mainWindow;
let loraReceiver;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Baja Telemetry Client'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize the LoRa receiver and set up event handlers
 */
function initLoRaReceiver() {
  loraReceiver = new LoRaReceiver();

  // Forward telemetry data to the renderer process
  loraReceiver.on('data', (telemetry) => {
    if (mainWindow) {
      mainWindow.webContents.send('telemetry-data', telemetry);
    }
  });

  // Handle connection status changes
  loraReceiver.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('connection-status', status);
    }
  });

  // Handle errors
  loraReceiver.on('error', (error) => {
    console.error('LoRa receiver error:', error);
    if (mainWindow) {
      mainWindow.webContents.send('connection-error', error.message);
    }
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  initLoRaReceiver();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (loraReceiver) {
    loraReceiver.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC handlers for renderer process requests
 */

// Get list of available serial ports
ipcMain.handle('get-serial-ports', async () => {
  return await loraReceiver.listPorts();
});

// Connect to a specific serial port
ipcMain.handle('connect-serial', async (event, portPath) => {
  return await loraReceiver.connect(portPath);
});

// Disconnect from serial port
ipcMain.handle('disconnect-serial', async () => {
  return await loraReceiver.disconnect();
});

// Save configuration
ipcMain.handle('save-config', async (event, config) => {
  try {
    const userData = app.getPath('userData');
    const cfgPath = path.join(userData, 'config.json');
    // Read existing config if present
    let existing = {};
    try {
      if (fs.existsSync(cfgPath)) existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
    } catch (e) {
      console.warn('Failed reading existing config:', e.message);
    }

    const merged = Object.assign({}, existing, config);
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save config:', err);
    throw err;
  }
});

// Load configuration
ipcMain.handle('load-config', async () => {
  try {
    const userData = app.getPath('userData');
    const cfgPath = path.join(userData, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const txt = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(txt);
    }
    return null;
  } catch (err) {
    console.error('Failed to load config:', err);
    return null;
  }
});
