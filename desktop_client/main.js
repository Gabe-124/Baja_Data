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
const { EndurancePoller } = require('./poll_endurance');
const { LeaderboardPoller } = require('./poll_leaderboard');

let mainWindow;
let loraReceiver;
let endurancePoller;
let leaderboardPoller;

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

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  initLoRaReceiver();
  initEndurancePoller();
  initLeaderboardPoller();

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
