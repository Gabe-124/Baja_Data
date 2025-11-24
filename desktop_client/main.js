/**
 * Electron Main Process
 * 
 * Manages the main application window, serial port communication with the Waveshare USB LoRa module,
 * and IPC (inter-process communication) between the Node.js backend and the UI renderer.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const LoRaReceiver = require('./lora_receiver');
const fs = require('fs');
const { EndurancePoller } = require('./poll_endurance');
const { LeaderboardPoller } = require('./poll_leaderboard');
const { PenaltiesPoller } = require('./poll_penalties');

let mainWindow;
let loraReceiver;
let endurancePoller;
let leaderboardPoller;
let penaltiesPoller;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hidden',
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

  mainWindow.webContents.once('did-finish-load', () => {
    if (endurancePoller) {
      mainWindow.webContents.send('endurance-status', { running: endurancePoller.isRunning() });
      const payload = endurancePoller.getLastPayload();
      if (payload) {
        mainWindow.webContents.send('endurance-data', payload);
      }
    }
    if (leaderboardPoller) {
      mainWindow.webContents.send('leaderboard-status', { running: leaderboardPoller.isRunning() });
      const boardPayload = leaderboardPoller.getLastPayload();
      if (boardPayload) {
        mainWindow.webContents.send('leaderboard-data', boardPayload);
      }
    }
    if (penaltiesPoller) {
      mainWindow.webContents.send('penalties-status', { running: penaltiesPoller.isRunning() });
      const penaltiesPayload = penaltiesPoller.getLastPayload();
      if (penaltiesPayload) {
        mainWindow.webContents.send('penalties-data', penaltiesPayload);
      }
    }
    if (loraReceiver) {
      mainWindow.webContents.send('test-transmit-status', loraReceiver.getTestTransmitStatus());
    }
  });
}

// Initialize the LoRa receiver and set up event handlers
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

  loraReceiver.on('test-status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('test-transmit-status', status);
    }
  });
}

function initEndurancePoller() {
  if (endurancePoller) {
    return endurancePoller;
  }

  endurancePoller = new EndurancePoller();

  endurancePoller.on('data', (payload) => {
    if (mainWindow) {
      mainWindow.webContents.send('endurance-data', payload);
    }
  });

  endurancePoller.on('error', (error) => {
    console.error('Endurance poller error:', error);
    if (mainWindow) {
      const message = error && error.message ? error.message : String(error);
      mainWindow.webContents.send('endurance-error', message);
    }
  });

  endurancePoller.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('endurance-status', { running: !!status.running });
    }
  });

  return endurancePoller;
}

function initLeaderboardPoller() {
  if (leaderboardPoller) {
    return leaderboardPoller;
  }

  leaderboardPoller = new LeaderboardPoller();

  leaderboardPoller.on('data', (payload) => {
    if (mainWindow) {
      mainWindow.webContents.send('leaderboard-data', payload);
    }
  });

  leaderboardPoller.on('error', (error) => {
    console.error('Leaderboard poller error:', error);
    if (mainWindow) {
      const message = error && error.message ? error.message : String(error);
      mainWindow.webContents.send('leaderboard-error', message);
    }
  });

  leaderboardPoller.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('leaderboard-status', { running: !!status.running });
    }
  });

  return leaderboardPoller;
}

function initPenaltiesPoller() {
  if (penaltiesPoller) {
    return penaltiesPoller;
  }

  penaltiesPoller = new PenaltiesPoller();

  penaltiesPoller.on('data', (payload) => {
    if (mainWindow) {
      mainWindow.webContents.send('penalties-data', payload);
    }
  });

  penaltiesPoller.on('error', (error) => {
    console.error('Penalties poller error:', error);
    if (mainWindow) {
      const message = error && error.message ? error.message : String(error);
      mainWindow.webContents.send('penalties-error', message);
    }
  });

  penaltiesPoller.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('penalties-status', { running: !!status.running });
    }
  });

  return penaltiesPoller;
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  initLoRaReceiver();
  initEndurancePoller();
  initLeaderboardPoller();
  initPenaltiesPoller();

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
  if (endurancePoller) {
    endurancePoller.destroy();
    endurancePoller = null;
  }
  if (leaderboardPoller) {
    leaderboardPoller.destroy();
    leaderboardPoller = null;
  }
  if (penaltiesPoller) {
    penaltiesPoller.destroy();
    penaltiesPoller = null;
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

// Save a track GeoJSON file to disk via native dialog
ipcMain.handle('save-track-file', async (event, options = {}) => {
  const { geojson, suggestedName = 'baja-track.geojson', defaultPath } = options;
  if (!geojson) {
    throw new Error('No GeoJSON payload provided');
  }

  const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
  const documentsDir = app.getPath('documents');
  const fallbackPath = path.join(documentsDir, suggestedName || 'baja-track.geojson');

  const dialogResult = await dialog.showSaveDialog(targetWindow, {
    title: 'Save Track Layout',
    defaultPath: defaultPath || fallbackPath,
    buttonLabel: 'Save Track',
    filters: [
      { name: 'GeoJSON', extensions: ['geojson', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (dialogResult.canceled || !dialogResult.filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(dialogResult.filePath, JSON.stringify(geojson, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save track file:', error);
    throw error;
  }

  return { canceled: false, filePath: dialogResult.filePath };
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

// Endurance polling controls
ipcMain.handle('endurance-start', async (event, options = {}) => {
  const poller = initEndurancePoller();

  if (options.intervalMs) {
    try {
      poller.updateInterval(options.intervalMs);
    } catch (error) {
      console.warn('Invalid endurance interval requested:', error.message);
    }
  }

  const payload = await poller.startWithImmediate();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

ipcMain.handle('endurance-stop', async () => {
  if (endurancePoller) {
    endurancePoller.stop();
  }
  return { running: endurancePoller ? endurancePoller.isRunning() : false };
});

ipcMain.handle('endurance-status', async () => {
  if (!endurancePoller) {
    return { running: false, payload: null };
  }
  return { running: endurancePoller.isRunning(), payload: endurancePoller.getLastPayload() };
});

ipcMain.handle('endurance-refresh', async () => {
  const poller = initEndurancePoller();
  const payload = await poller.pollOnce();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

// Leaderboard polling controls
ipcMain.handle('leaderboard-start', async (event, options = {}) => {
  const poller = initLeaderboardPoller();

  if (options.intervalMs) {
    try {
      poller.updateInterval(options.intervalMs);
    } catch (error) {
      console.warn('Invalid leaderboard interval requested:', error.message);
    }
  }

  const payload = await poller.startWithImmediate();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

ipcMain.handle('leaderboard-stop', async () => {
  if (leaderboardPoller) {
    leaderboardPoller.stop();
  }
  return { running: leaderboardPoller ? leaderboardPoller.isRunning() : false };
});

ipcMain.handle('leaderboard-status', async () => {
  if (!leaderboardPoller) {
    return { running: false, payload: null };
  }
  return {
    running: leaderboardPoller.isRunning(),
    payload: leaderboardPoller.getLastPayload()
  };
});

ipcMain.handle('leaderboard-refresh', async () => {
  const poller = initLeaderboardPoller();
  const payload = await poller.pollOnce();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

// Penalties polling controls
ipcMain.handle('penalties-start', async (event, options = {}) => {
  const poller = initPenaltiesPoller();

  if (options.intervalMs) {
    try {
      poller.updateInterval(options.intervalMs);
    } catch (error) {
      console.warn('Invalid penalties interval requested:', error.message);
    }
  }

  const payload = await poller.startWithImmediate();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

ipcMain.handle('penalties-stop', async () => {
  if (penaltiesPoller) {
    penaltiesPoller.stop();
  }
  return { running: penaltiesPoller ? penaltiesPoller.isRunning() : false };
});

ipcMain.handle('penalties-status', async () => {
  if (!penaltiesPoller) {
    return { running: false, payload: null };
  }
  return {
    running: penaltiesPoller.isRunning(),
    payload: penaltiesPoller.getLastPayload()
  };
});

ipcMain.handle('penalties-refresh', async () => {
  const poller = initPenaltiesPoller();
  const payload = await poller.pollOnce();
  return {
    running: poller.isRunning(),
    payload: payload || poller.getLastPayload()
  };
});

// Test transmit controls
ipcMain.handle('test-transmit-start', async (event, options = {}) => {
  if (!loraReceiver) {
    initLoRaReceiver();
  }
  if (!loraReceiver) {
    throw new Error('LoRa receiver unavailable');
  }
  return loraReceiver.startTestTransmit(options);
});

ipcMain.handle('test-transmit-stop', async () => {
  if (!loraReceiver) {
    initLoRaReceiver();
  }
  if (!loraReceiver) {
    return { running: false };
  }
  return loraReceiver.stopTestTransmit();
});

ipcMain.handle('test-transmit-status', async () => {
  if (!loraReceiver) {
    initLoRaReceiver();
  }
  if (!loraReceiver) {
    return { running: false };
  }
  return loraReceiver.getTestTransmitStatus();
});

ipcMain.handle('send-lora-command', async (event, payload = {}) => {
  if (!loraReceiver) {
    initLoRaReceiver();
  }
  if (!loraReceiver) {
    throw new Error('LoRa receiver unavailable');
  }
  const command = typeof payload === 'string' ? payload : payload.command;
  if (!command || !command.toString().trim()) {
    throw new Error('Command cannot be empty');
  }
  await loraReceiver.sendCommand(command.toString());
  return { ok: true };
});
