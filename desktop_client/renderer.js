/**
 * Renderer Process
 * 
 * Main UI controller - connects LoRa receiver, map, and lap manager.
 * Handles all UI interactions and updates.
 */

// Initialize modules
const trackMap = new TrackMap('map');
const lapManager = new LapManager();

// UI state
let isConnected = false;
let currentTelemetry = null;

/**
 * Initialize the application
 */
async function init() {
  console.log('Initializing Baja Telemetry Client...');

  // Load saved configuration
  await loadConfiguration();

  // Set up UI event listeners
  setupEventListeners();

  // Populate serial port list
  await refreshSerialPorts();

  // Set up telemetry data listener
  window.electronAPI.onTelemetryData(handleTelemetryData);

  // Set up connection status listener
  window.electronAPI.onConnectionStatus(handleConnectionStatus);

  // Set up error listener
  window.electronAPI.onConnectionError(handleConnectionError);

  // Set up lap manager callbacks
  lapManager.onLapComplete = handleLapComplete;
  lapManager.onCurrentTimeUpdate = handleCurrentTimeUpdate;

  console.log('Initialization complete');
}

/**
 * Set up all UI event listeners
 */
function setupEventListeners() {
  // Connection controls
  document.getElementById('connectBtn').addEventListener('click', connectToSerial);
  document.getElementById('disconnectBtn').addEventListener('click', disconnectFromSerial);

  // Map controls
  document.getElementById('centerMapBtn').addEventListener('click', () => {
    trackMap.centerOnCar();
    trackMap.setAutoCenter(true);
  });

  document.getElementById('resetTrackBtn').addEventListener('click', () => {
    if (confirm('Clear the current track path?')) {
      trackMap.clearTrack();
    }
  });

  // Map type toggle (satellite vs tiles)
  document.getElementById('toggleMapTypeBtn').addEventListener('click', () => {
    const newType = trackMap.toggleMapType();
    // Update the button icon to reflect the selected layer
    const btn = document.getElementById('toggleMapTypeBtn');
    btn.textContent = newType === 'satellite' ? '🗺️' : '🛰️';
    btn.title = newType === 'satellite' ? 'Switch to street map' : 'Switch to satellite view';
  });

  // Draw/Edit/Save/Import track controls
  document.getElementById('drawTrackBtn').addEventListener('click', () => {
    trackMap.enableDrawing();
    alert('Drawing enabled: use the draw toolbar to trace the track. When finished, click the save button.');
  });

  document.getElementById('editTrackBtn').addEventListener('click', () => {
    // Toggle editing: enabling drawing control also provides edit/remove UI
    if (trackMap._drawingEnabled) {
      trackMap.disableDrawing();
      alert('Drawing disabled. Use Save to persist track.');
    } else {
      trackMap.enableDrawing();
    }
  });

  document.getElementById('saveTrackBtn').addEventListener('click', async () => {
    const geo = trackMap.getDrawnTrackGeoJSON();
    if (!geo) {
      alert('No drawn track to save. Draw or import a track first.');
      return;
    }

    // Wrap into a Feature if necessary
    const feature = geo.type === 'Feature' ? geo : { type: 'Feature', geometry: geo.geometry || geo, properties: { name: 'Baja Track' } };

    try {
      await window.electronAPI.saveConfig({ trackGeoJSON: feature });
      alert('Track saved to application config.');
    } catch (err) {
      console.error('Failed to save track:', err);
      alert('Failed to save track. Check logs.');
    }
  });

  // Import track (GeoJSON or GPX)
  document.getElementById('importTrackBtn').addEventListener('click', () => {
    document.getElementById('trackFileInput').click();
  });

  // Handle file selection for import
  document.getElementById('trackFileInput').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    const name = file.name.toLowerCase();

    try {
      if (name.endsWith('.geojson') || name.endsWith('.json')) {
        const json = JSON.parse(text);
        trackMap.importTrackGeoJSON(json);
        alert('Imported GeoJSON track. You can edit and then Save.');
      } else if (name.endsWith('.gpx')) {
        // Parse GPX as XML and convert using togeojson
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        const gj = toGeoJSON.gpx(doc);
        // Use first track or route if available
        if (gj && gj.features && gj.features.length) {
          trackMap.importTrackGeoJSON(gj.features[0]);
          alert('Imported GPX track. You can edit and then Save.');
        } else {
          alert('No track found in GPX file.');
        }
      } else {
        alert('Unsupported file type. Use GeoJSON (.geojson/.json) or GPX (.gpx).');
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import track file. See console for details.');
    } finally {
      // Reset input so same file can be re-selected later
      ev.target.value = '';
    }
  });

  // Lap controls
  document.getElementById('clearLapsBtn').addEventListener('click', () => {
    if (confirm('Clear all lap times?')) {
      lapManager.clearLaps();
      updateLapTimesTable();
      updateBestLapDisplay();
    }
  });

  // Import competitor data
  document.getElementById('importCompetitorBtn').addEventListener('click', importCompetitorData);

  // Disable auto-center when user manually pans the map
  trackMap.map.on('drag', () => {
    trackMap.setAutoCenter(false);
  });

  // Double-click on map to set start/finish line
  trackMap.map.on('dblclick', (e) => {
    const { lat, lng } = e.latlng;
    if (confirm(`Set start/finish line at this location?\nLat: ${lat.toFixed(6)}, Lon: ${lng.toFixed(6)}`)) {
      lapManager.setStartFinishLine(lat, lng, 10);
      trackMap.setStartFinishLine(lat, lng, 10);
      saveConfiguration();
    }
  });
}

/**
 * Refresh the list of available serial ports
 */
async function refreshSerialPorts() {
  const portSelect = document.getElementById('portSelect');
  const ports = await window.electronAPI.getSerialPorts();

  // Clear existing options (except the first placeholder)
  portSelect.innerHTML = '<option value="">Select LoRa Port...</option>';

  // Add ports to dropdown
  ports.forEach(port => {
    const option = document.createElement('option');
    option.value = port.path;
    option.textContent = `${port.path} - ${port.manufacturer}`;
    portSelect.appendChild(option);
  });

  console.log(`Found ${ports.length} serial ports`);
}

/**
 * Connect to the selected serial port
 */
async function connectToSerial() {
  const portSelect = document.getElementById('portSelect');
  const selectedPort = portSelect.value;

  if (!selectedPort) {
    alert('Please select a serial port');
    return;
  }

  try {
    const success = await window.electronAPI.connectSerial(selectedPort);
    if (success) {
      console.log(`Connected to ${selectedPort}`);
    }
  } catch (error) {
    console.error('Connection failed:', error);
    alert(`Failed to connect: ${error.message}`);
  }
}

/**
 * Disconnect from the serial port
 */
async function disconnectFromSerial() {
  try {
    await window.electronAPI.disconnectSerial();
    console.log('Disconnected from serial port');
  } catch (error) {
    console.error('Disconnect failed:', error);
  }
}

/**
 * Handle incoming telemetry data
 * @param {Object} telemetry - Telemetry data object
 */
function handleTelemetryData(telemetry) {
  currentTelemetry = telemetry;

  // Update map with new position
  trackMap.updateCarPosition(telemetry.latitude, telemetry.longitude);

  // Process position for lap timing
  lapManager.processPosition(telemetry);

  // Update GPS status display
  updateGPSStatus(telemetry);
}

/**
 * Handle connection status changes
 * @param {Object} status - Status object with connected flag
 */
function handleConnectionStatus(status) {
  isConnected = status.connected;

  // Update UI
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const portSelect = document.getElementById('portSelect');

  if (status.connected) {
    statusDot.classList.remove('disconnected');
    statusDot.classList.add('connected');
    statusText.textContent = `Connected: ${status.port}`;
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    portSelect.disabled = true;
  } else {
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    portSelect.disabled = false;
  }
}

/**
 * Handle connection errors
 * @param {string} error - Error message
 */
function handleConnectionError(error) {
  console.error('Connection error:', error);
  alert(`Connection error: ${error}`);
}

/**
 * Update GPS status display
 * @param {Object} telemetry - Telemetry data
 */
function updateGPSStatus(telemetry) {
  const gpsStatus = document.getElementById('gpsStatus');
  const satCount = document.getElementById('satCount');
  const hdopValue = document.getElementById('hdopValue');

  // GPS fix quality
  const fixTypes = ['No Fix', 'GPS Fix', 'DGPS Fix', 'PPS Fix', 'RTK Fix', 'Float RTK', 'Dead Reckoning'];
  gpsStatus.textContent = fixTypes[telemetry.fix] || 'Unknown';
  gpsStatus.style.color = telemetry.fix > 0 ? '#00ff88' : '#ff4444';

  // Satellite count
  satCount.textContent = telemetry.satellites;

  // HDOP (horizontal dilution of precision)
  hdopValue.textContent = telemetry.hdop ? telemetry.hdop.toFixed(1) : '--';
}

/**
 * Handle lap completion
 * @param {Object} lap - Completed lap object
 * @param {number} bestTime - Best lap time
 * @param {number} bestIndex - Index of best lap
 */
function handleLapComplete(lap, bestTime, bestIndex) {
  console.log(`Lap ${lap.lapNumber} complete: ${lapManager.formatTime(lap.finalTime)}`);

  // Update lap times table
  updateLapTimesTable();

  // Update best lap display
  updateBestLapDisplay();

  // Reset current lap display
  document.getElementById('currentLapTime').textContent = '00:00.000';
  document.getElementById('deltaValue').textContent = '--';
  document.getElementById('deltaValue').className = 'delta-value neutral';
}

/**
 * Handle current lap time updates
 * @param {number} currentTime - Current lap time in ms
 * @param {number} delta - Delta to best lap in ms
 */
function handleCurrentTimeUpdate(currentTime, delta) {
  // Update current lap time display
  document.getElementById('currentLapTime').textContent = lapManager.formatTime(currentTime);
  document.getElementById('currentLapNum').textContent = lapManager.currentLap.lapNumber;

  // Update delta display
  const deltaElement = document.getElementById('deltaValue');
  if (delta !== null) {
    deltaElement.textContent = lapManager.formatDelta(delta);
    deltaElement.className = delta > 0 ? 'delta-value positive' : 'delta-value negative';
  } else {
    deltaElement.textContent = '--';
    deltaElement.className = 'delta-value neutral';
  }
}

/**
 * Update the lap times table
 */
function updateLapTimesTable() {
  const tbody = document.getElementById('lapTimesBody');
  const laps = lapManager.getLaps();

  if (laps.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="3">No laps recorded yet</td></tr>';
    return;
  }

  const bestLap = lapManager.getBestLap();
  tbody.innerHTML = '';

  laps.forEach((lap, index) => {
    const tr = document.createElement('tr');
    const isBest = lap === bestLap;

    if (isBest) {
      tr.classList.add('best-lap');
    }

    // Lap number
    const tdNum = document.createElement('td');
    tdNum.textContent = lap.lapNumber;
    tr.appendChild(tdNum);

    // Lap time
    const tdTime = document.createElement('td');
    tdTime.textContent = lapManager.formatTime(lap.finalTime);
    tr.appendChild(tdTime);

    // Delta to best
    const tdDelta = document.createElement('td');
    if (isBest) {
      tdDelta.textContent = 'BEST';
      tdDelta.style.color = '#00d4ff';
    } else {
      const delta = lap.finalTime - bestLap.finalTime;
      tdDelta.textContent = lapManager.formatDelta(delta);
      tdDelta.style.color = '#ff4444';
    }
    tr.appendChild(tdDelta);

    tbody.appendChild(tr);
  });
}

/**
 * Update the best lap display
 */
function updateBestLapDisplay() {
  const bestLap = lapManager.getBestLap();

  if (bestLap) {
    document.getElementById('bestLapTime').textContent = lapManager.formatTime(bestLap.finalTime);
    document.getElementById('bestLapNum').textContent = bestLap.lapNumber;
  } else {
    document.getElementById('bestLapTime').textContent = '--';
    document.getElementById('bestLapNum').textContent = '--';
  }
}

/**
 * Import competitor data from file
 */
function importCompetitorData() {
  // TODO: Implement file picker and CSV parsing
  // For now, show a placeholder
  alert('Competitor data import feature coming soon!\n\nYou will be able to import CSV files with competitor lap times from Baja SAE events.');
  
  // Example of how competitor data could be displayed:
  const exampleData = [
    { name: 'Team 1', bestTime: 125340 },
    { name: 'Team 2', bestTime: 127890 },
    { name: 'Team 3', bestTime: 129560 }
  ];
  
  displayCompetitorData(exampleData);
}

/**
 * Display competitor lap times
 * @param {Array} competitors - Array of competitor objects
 */
function displayCompetitorData(competitors) {
  const container = document.getElementById('competitorList');
  
  if (!competitors || competitors.length === 0) {
    container.innerHTML = '<div class="empty-state">No competitor data loaded</div>';
    return;
  }

  container.innerHTML = '';

  competitors.forEach((competitor, index) => {
    const div = document.createElement('div');
    div.className = 'competitor-item';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${index + 1}. ${competitor.name}`;

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = lapManager.formatTime(competitor.bestTime);

    div.appendChild(name);
    div.appendChild(time);
    container.appendChild(div);
  });
}

/**
 * Save configuration to disk
 */
async function saveConfiguration() {
  const config = {
    startFinishLine: lapManager.startFinishLine,
    autoCenter: trackMap.autoCenter
  };

  try {
    await window.electronAPI.saveConfig(config);
    console.log('Configuration saved');
  } catch (error) {
    console.error('Failed to save configuration:', error);
  }
}

/**
 * Load configuration from disk
 */
async function loadConfiguration() {
  try {
    const config = await window.electronAPI.loadConfig();
    
    if (config) {
      // Restore start/finish line
      if (config.startFinishLine && config.startFinishLine.lat) {
        lapManager.setStartFinishLine(
          config.startFinishLine.lat,
          config.startFinishLine.lon,
          config.startFinishLine.radius
        );
        trackMap.setStartFinishLine(
          config.startFinishLine.lat,
          config.startFinishLine.lon,
          config.startFinishLine.radius
        );
      }

      // Restore auto-center setting
      if (config.autoCenter !== undefined) {
        trackMap.setAutoCenter(config.autoCenter);
      }

      console.log('Configuration loaded');
    }
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
