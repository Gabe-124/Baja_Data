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
   * Prompt the user to save a track GeoJSON file
   * @param {Object} payload - { geojson: Feature, suggestedName?: string, defaultPath?: string }
   * @returns {Promise<{canceled: boolean, filePath?: string}>}
   */
  saveTrackFile: (payload) => ipcRenderer.invoke('save-track-file', payload),

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
  },

  /**
   * Start endurance grid polling with optional overrides
   * @param {Object} options
   * @returns {Promise<{running: boolean, payload: Object|null}>}
   */
  startEndurancePolling: (options) => ipcRenderer.invoke('endurance-start', options),

  /**
   * Stop endurance grid polling
   * @returns {Promise<{running: boolean}>}
   */
  stopEndurancePolling: () => ipcRenderer.invoke('endurance-stop'),

  /**
   * Retrieve current endurance polling status and cached payload
   * @returns {Promise<{running: boolean, payload: Object|null}>}
   */
  getEnduranceStatus: () => ipcRenderer.invoke('endurance-status'),

  /**
   * Force a one-time endurance fetch (independent of interval state)
   * @returns {Promise<{running: boolean, payload: Object|null}>}
   */
  refreshEnduranceOnce: () => ipcRenderer.invoke('endurance-refresh'),

  /**
   * Subscribe to endurance grid data updates
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onEnduranceData: (callback) => {
    const channel = 'endurance-data';
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Subscribe to endurance polling status updates
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onEnduranceStatus: (callback) => {
    const channel = 'endurance-status';
    const handler = (event, status) => callback(status);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Subscribe to endurance polling errors
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  onEnduranceError: (callback) => {
    const channel = 'endurance-error';
    const handler = (event, error) => callback(error);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Leaderboard polling API
   */
  startLeaderboardPolling: (options) => ipcRenderer.invoke('leaderboard-start', options),
  stopLeaderboardPolling: () => ipcRenderer.invoke('leaderboard-stop'),
  getLeaderboardStatus: () => ipcRenderer.invoke('leaderboard-status'),
  refreshLeaderboardOnce: () => ipcRenderer.invoke('leaderboard-refresh'),
  onLeaderboardData: (callback) => {
    const channel = 'leaderboard-data';
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onLeaderboardStatus: (callback) => {
    const channel = 'leaderboard-status';
    const handler = (event, status) => callback(status);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onLeaderboardError: (callback) => {
    const channel = 'leaderboard-error';
    const handler = (event, error) => callback(error);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Penalties polling API (Black Flags)
   */
  startPenaltiesPolling: (options) => ipcRenderer.invoke('penalties-start', options),
  stopPenaltiesPolling: () => ipcRenderer.invoke('penalties-stop'),
  getPenaltiesStatus: () => ipcRenderer.invoke('penalties-status'),
  refreshPenaltiesOnce: () => ipcRenderer.invoke('penalties-refresh'),
  onPenaltiesData: (callback) => {
    const channel = 'penalties-data';
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onPenaltiesStatus: (callback) => {
    const channel = 'penalties-status';
    const handler = (event, status) => callback(status);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onPenaltiesError: (callback) => {
    const channel = 'penalties-error';
    const handler = (event, error) => callback(error);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * USB test transmit controls
   */
  startTestTransmit: (options) => ipcRenderer.invoke('test-transmit-start', options),
  stopTestTransmit: () => ipcRenderer.invoke('test-transmit-stop'),
  getTestTransmitStatus: () => ipcRenderer.invoke('test-transmit-status'),
  onTestTransmitStatus: (callback) => {
    const channel = 'test-transmit-status';
    const handler = (event, status) => callback(status);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
