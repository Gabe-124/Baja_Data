/**
 * Preload Script
 * 
 * Bridge between the Electron main process and the renderer process.
 * Exposes safe IPC channels to the frontend via the contextBridge API.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get list of available serial ports
   * @returns {Promise<Array>} Array of port objects with path and info
   */
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),

  /**
   * Connect to a serial port
   * @param {string} portPath - Path to the serial port
   * @returns {Promise<boolean>} Success status
   */
  connectSerial: (portPath) => ipcRenderer.invoke('connect-serial', portPath),

  /**
   * Disconnect from the current serial port
   * @returns {Promise<boolean>} Success status
   */
  disconnectSerial: () => ipcRenderer.invoke('disconnect-serial'),

  /**
   * Save configuration to disk
   * @param {Object} config - Configuration object
   * @returns {Promise<boolean>} Success status
   */
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  /**
   * Load configuration from disk
   * @returns {Promise<Object>} Configuration object
   */
  loadConfig: () => ipcRenderer.invoke('load-config'),

  /**
   * Listen for telemetry data from the LoRa receiver
   * @param {Function} callback - Function to call when data is received
   */
  onTelemetryData: (callback) => {
    ipcRenderer.on('telemetry-data', (event, data) => callback(data));
  },

  /**
   * Listen for connection status changes
   * @param {Function} callback - Function to call when status changes
   */
  onConnectionStatus: (callback) => {
    ipcRenderer.on('connection-status', (event, status) => callback(status));
  },

  /**
   * Listen for connection errors
   * @param {Function} callback - Function to call when an error occurs
   */
  onConnectionError: (callback) => {
    ipcRenderer.on('connection-error', (event, error) => callback(error));
  }
});
