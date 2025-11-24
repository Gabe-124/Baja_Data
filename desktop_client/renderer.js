/**
 * Renderer Process
 * 
 * Main UI controller - connects LoRa receiver, map, and lap manager.
 * Handles all UI interactions and updates.
 */

// Initialize modules
const trackMap = new TrackMap('map');
const lapManager = new LapManager();
const penaltiesManager = new PenaltiesManager();

// UI state
let isConnected = false;
let currentTelemetry = null;
const enduranceState = {
  running: false,
  lastPayload: null
};

const leaderboardState = {
  running: false,
  lastPayload: null
};

const raceState = {
  trackedCar: ''
};

const penaltiesState = {
  selectedCar: '',
  showAddModal: false
};

const testTransmitState = {
  running: false,
  busy: false
};

const themeState = {
  mode: 'dark'
};

const THEME_STORAGE_KEY = 'bajaTelemetryTheme';

const penaltyOutcomeRules = [
  {
    penaltyId: 'fuel-possession',
    patterns: [
      /possession of fuel/i,
      /fuel\s+is\s+removed.*fuel (?:area|zone)/i,
      /fuel.*removed.*endurance gridding/i,
      /fueling procedure penalty.*possession/i,
      /fueling procedure penalty.*removed/i
    ]
  },
  {
    penaltyId: 'fuel-unchecked',
    patterns: [
      /unchecked fuel/i,
      /fuel.*unchecked/i,
      /fueling procedure penalty.*unchecked/i
    ]
  },
  {
    penaltyId: 'fuel-track',
    patterns: [
      /fueling on (?:the )?track/i,
      /fuel on the track/i
    ]
  },
  {
    penaltyId: 'fuel-tools',
    patterns: [
      /tools? (?:used|in use).*(?:fuel|fueling) area/i,
      /use of tools.*fuel/i,
      /fueling procedure penalty.*tool/i
    ]
  },
  {
    penaltyId: 'fuel-people',
    patterns: [
      /(more than|>\s*3|three).*people.*fuel/i,
      /too many people.*fuel/i,
      /fueling procedure penalty.*people/i
    ]
  },
  {
    penaltyId: 'fuel-driver-car',
    patterns: [
      /driver.*in (?:the )?car.*fuel/i,
      /fueling.*driver.*car/i,
      /fueling procedure penalty.*driver/i
    ]
  },
  {
    penaltyId: 'fuel-extinguisher',
    patterns: [
      /fire extinguisher.*(not ready|missing)/i,
      /no fire extinguisher/i,
      /fueling procedure penalty.*extinguisher/i
    ]
  },
  {
    penaltyId: 'fuel-ran-out',
    patterns: [
      /ran out of fuel/i,
      /out of fuel on the track/i,
      /fueling procedure penalty.*ran out/i
    ]
  },
  {
    penaltyId: 'fuel-container',
    patterns: [
      /oversized.*fuel container/i,
      /modified fuel container/i,
      /fueling procedure penalty.*container/i
    ]
  },
  {
    penaltyId: 'driving-rollover',
    patterns: [
      /roll[\s-]?over/i
    ]
  },
  {
    penaltyId: 'driving-yellow-flag',
    patterns: [
      /passing.*yellow flag/i,
      /yellow flag.*pass/i,
      /yellow.*flag.*passing/i
    ]
  },
  {
    penaltyId: 'driving-black-flag',
    patterns: [
      /failure to stop.*black flag/i,
      /ignored black flag/i,
      /black flag.*failure to stop/i
    ]
  },
  {
    penaltyId: 'driving-course',
    patterns: [
      /leaving the course/i,
      /driving off course/i,
      /off course.*advancing/i,
      /off course.*gain/i
    ]
  },
  {
    penaltyId: 'driving-aggressive',
    patterns: [
      /aggressive driving/i,
      /reckless driving/i,
      /dangerous driving/i
    ]
  },
  {
    penaltyId: 'driving-speeding',
    patterns: [
      /speeding.*pit/i,
      /speeding.*paddock/i,
      /pit speed/i,
      /speed.*paddock/i
    ]
  }
];

const UNMAPPED_PENALTY_PLACEHOLDER = 'Unlisted (Article D.8.4)';

const penaltiesFeedState = {
  running: false,
  lastPayload: null,
  error: null
};

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

  // Endurance polling bridges
  window.electronAPI.onEnduranceData(handleEnduranceData);
  window.electronAPI.onEnduranceStatus(handleEnduranceStatus);
  window.electronAPI.onEnduranceError(handleEnduranceError);

  // Leaderboard polling bridges
  window.electronAPI.onLeaderboardData(handleLeaderboardData);
  window.electronAPI.onLeaderboardStatus(handleLeaderboardStatus);
  window.electronAPI.onLeaderboardError(handleLeaderboardError);

  // Penalties polling bridges
  window.electronAPI.onPenaltiesData(handlePenaltiesData);
  window.electronAPI.onPenaltiesStatus(handlePenaltiesStatus);
  window.electronAPI.onPenaltiesError(handlePenaltiesError);

  // USB test transmit bridge
  window.electronAPI.onTestTransmitStatus(handleTestTransmitStatus);

  // Set up lap manager callbacks
  lapManager.onLapComplete = handleLapComplete;
  lapManager.onCurrentTimeUpdate = handleCurrentTimeUpdate;

  // Sync current endurance status/payload
  try {
    const status = await window.electronAPI.getEnduranceStatus();
    if (status) {
      handleEnduranceStatus(status);
      if (status.payload) {
        handleEnduranceData(status.payload);
      }
    }
  } catch (error) {
    console.warn('Failed to fetch endurance status:', error);
  }

  try {
    const status = await window.electronAPI.getLeaderboardStatus();
    if (status) {
      handleLeaderboardStatus(status);
      if (status.payload) {
        handleLeaderboardData(status.payload);
      }
    }
  } catch (error) {
    console.warn('Failed to fetch leaderboard status:', error);
  }

  try {
    const status = await window.electronAPI.getPenaltiesStatus();
    if (status) {
      handlePenaltiesStatus(status);
      if (status.payload) {
        handlePenaltiesData(status.payload);
      }
    }
  } catch (error) {
    console.warn('Failed to fetch penalties status:', error);
  }

  try {
    const status = await window.electronAPI.getTestTransmitStatus();
    if (status) {
      handleTestTransmitStatus(status);
    }
  } catch (error) {
    console.warn('Failed to fetch test transmit status:', error);
  }

  updatePenaltiesDisplay();

  console.log('Initialization complete');
}

/**
 * Set up all UI event listeners
 */
function setupEventListeners() {
  // Connection controls
  document.getElementById('connectBtn').addEventListener('click', connectToSerial);
  document.getElementById('disconnectBtn').addEventListener('click', disconnectFromSerial);

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = themeState.mode === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
      persistThemePreference(nextTheme);
    });
  }

  const testBtn = document.getElementById('testTxBtn');
  if (testBtn) {
    testBtn.addEventListener('click', toggleTestTransmitMode);
    updateTestTransmitButton();
  }

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
    let geo = trackMap.getDrawnTrackGeoJSON();
    let source = 'drawn';

    if (!geo && Array.isArray(trackMap.trackPoints) && trackMap.trackPoints.length >= 2) {
      geo = trackMap.exportTrackGeoJSON();
      source = 'recorded';
    }

    if (!geo) {
      alert('No track to save. Draw a layout or record laps first.');
      return;
    }

    const feature = geo.type === 'Feature'
      ? geo
      : { type: 'Feature', geometry: geo.geometry || geo, properties: geo.properties || { name: 'Baja Track' } };

    try {
      let savedFilePath = null;
      if (window.electronAPI?.saveTrackFile) {
        const result = await window.electronAPI.saveTrackFile({
          geojson: feature,
          suggestedName: source === 'drawn' ? 'baja-track-layout.geojson' : 'baja-track-session.geojson'
        });

        if (result?.canceled) {
          alert('Track save canceled.');
          return;
        }
        savedFilePath = result?.filePath || null;
      }

      await window.electronAPI.saveConfig({
        trackGeoJSON: feature,
        lastTrackFilePath: savedFilePath
      });

      if (savedFilePath) {
        alert(`Track saved to ${savedFilePath}\nIt will automatically reload on the next launch.`);
      } else {
        alert('Track saved to application config.');
      }
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

  // Endurance controls
  const toggleRaceTrackingBtn = document.getElementById('toggleRaceTrackingBtn');
  if (toggleRaceTrackingBtn) {
    toggleRaceTrackingBtn.addEventListener('click', toggleRaceTracking);
    updateRaceTrackingButton();
  }

  const refreshEnduranceBtn = document.getElementById('refreshEnduranceBtn');
  if (refreshEnduranceBtn) {
    refreshEnduranceBtn.addEventListener('click', () => refreshEnduranceData(refreshEnduranceBtn));
  }

  const trackedCarSelect = document.getElementById('trackedCarSelect');
  if (trackedCarSelect) {
    trackedCarSelect.addEventListener('change', (event) => {
      raceState.trackedCar = event.target.value || '';
      updateTrackedCarSummary();
      updateEnduranceTable();
      updateLeaderboardTable();
    });
  }

  const refreshPenaltiesBtn = document.getElementById('refreshPenaltiesBtn');
  if (refreshPenaltiesBtn) {
    refreshPenaltiesBtn.addEventListener('click', () => refreshPenaltiesData(refreshPenaltiesBtn));
  }

  // Penalties controls
  const penaltiesCar = document.getElementById('penaltiesCar');
  if (penaltiesCar) {
    penaltiesCar.addEventListener('change', (event) => {
      penaltiesState.selectedCar = event.target.value || '';
      updatePenaltiesDisplay();
    });
  }

  const addPenaltyBtn = document.getElementById('addPenaltyBtn');
  if (addPenaltyBtn) {
    addPenaltyBtn.addEventListener('click', openAddPenaltyModal);
  }

  const exportPenaltiesBtn = document.getElementById('exportPenaltiesBtn');
  if (exportPenaltiesBtn) {
    exportPenaltiesBtn.addEventListener('click', exportPenalties);
  }

  const clearPenaltiesBtn = document.getElementById('clearPenaltiesBtn');
  if (clearPenaltiesBtn) {
    clearPenaltiesBtn.addEventListener('click', clearAllPenalties);
  }

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
    if (testTransmitState.running) {
      testTransmitState.running = false;
    }
  }

  updateTestTransmitButton();
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

async function refreshEnduranceData(buttonEl) {
  if (buttonEl) buttonEl.disabled = true;
  try {
    const status = await window.electronAPI.refreshEnduranceOnce();
    if (status) {
      handleEnduranceStatus(status);
      if (status.payload) {
        handleEnduranceData(status.payload);
      }
    }
  } catch (error) {
    handleEnduranceError(error?.message || String(error));
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function refreshPenaltiesData(buttonEl) {
  if (buttonEl) buttonEl.disabled = true;
  try {
    const status = await window.electronAPI.refreshPenaltiesOnce();
    if (status) {
      handlePenaltiesStatus(status);
      if (status.payload) {
        handlePenaltiesData(status.payload);
      }
    }
  } catch (error) {
    handlePenaltiesError(error?.message || String(error));
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function toggleRaceTracking() {
  const toggleBtn = document.getElementById('toggleRaceTrackingBtn');
  if (toggleBtn) toggleBtn.disabled = true;

  const wasEnduranceRunning = enduranceState.running;
  const wasLeaderboardRunning = leaderboardState.running;
  const wasPenaltiesRunning = penaltiesFeedState.running;
  const anyRunning = enduranceState.running || leaderboardState.running || penaltiesFeedState.running;
  let failureScope = null;

  try {
    if (anyRunning) {
      const ops = [];

      if (enduranceState.running) {
        ops.push({
          type: 'endurance',
          promise: window.electronAPI.stopEndurancePolling()
        });
      }

      if (leaderboardState.running) {
        ops.push({
          type: 'leaderboard',
          promise: window.electronAPI.stopLeaderboardPolling()
        });
      }

      if (penaltiesFeedState.running) {
        ops.push({
          type: 'penalties',
          promise: window.electronAPI.stopPenaltiesPolling()
        });
      }

      const settled = await Promise.allSettled(ops.map((op) => op.promise));
      settled.forEach((result, index) => {
        const op = ops[index];
        if (!op) return;
        const type = op.type;
        if (result.status === 'fulfilled' && result.value) {
          if (type === 'endurance') handleEnduranceStatus(result.value);
          else if (type === 'leaderboard') handleLeaderboardStatus(result.value);
          else handlePenaltiesStatus(result.value);
        } else if (result.status === 'rejected') {
          const error = result.reason;
          if (type === 'endurance') handleEnduranceError(error?.message || String(error));
          else if (type === 'leaderboard') handleLeaderboardError(error?.message || String(error));
          else handlePenaltiesError(error?.message || String(error));
        }
      });
    } else {
      try {
        if (!enduranceState.running) {
          failureScope = 'endurance';
          const enduranceResult = await window.electronAPI.startEndurancePolling();
          if (enduranceResult) {
            handleEnduranceStatus(enduranceResult);
            if (enduranceResult.payload) handleEnduranceData(enduranceResult.payload);
          }
        }

        if (!leaderboardState.running) {
          failureScope = 'leaderboard';
          const leaderboardResult = await window.electronAPI.startLeaderboardPolling();
          if (leaderboardResult) {
            handleLeaderboardStatus(leaderboardResult);
            if (leaderboardResult.payload) handleLeaderboardData(leaderboardResult.payload);
          }
        }

        if (!penaltiesFeedState.running) {
          failureScope = 'penalties';
          const penaltiesResult = await window.electronAPI.startPenaltiesPolling();
          if (penaltiesResult) {
            handlePenaltiesStatus(penaltiesResult);
            if (penaltiesResult.payload) handlePenaltiesData(penaltiesResult.payload);
          }
        }

        failureScope = null;
      } catch (error) {
        console.error('Failed to start race tracking:', error);

        if (!wasEnduranceRunning && enduranceState.running) {
          try {
            const rollback = await window.electronAPI.stopEndurancePolling();
            if (rollback) handleEnduranceStatus(rollback);
          } catch (stopError) {
            console.error('Failed to roll back endurance polling:', stopError);
          }
        }

        if (!wasLeaderboardRunning && leaderboardState.running) {
          try {
            const rollback = await window.electronAPI.stopLeaderboardPolling();
            if (rollback) handleLeaderboardStatus(rollback);
          } catch (stopError) {
            console.error('Failed to roll back leaderboard polling:', stopError);
          }
        }

        if (!wasPenaltiesRunning && penaltiesFeedState.running) {
          try {
            const rollback = await window.electronAPI.stopPenaltiesPolling();
            if (rollback) handlePenaltiesStatus(rollback);
          } catch (stopError) {
            console.error('Failed to roll back penalties polling:', stopError);
          }
        }

        throw error;
      }
    }
  } catch (error) {
    console.error('Failed to toggle race tracking:', error);
    const message = error?.message || String(error);
    if (!failureScope || failureScope === 'endurance') {
      handleEnduranceError(message);
    }
    if (!failureScope || failureScope === 'leaderboard') {
      handleLeaderboardError(message);
    }
    if (!failureScope || failureScope === 'penalties') {
      handlePenaltiesError(message);
    }
  } finally {
    if (toggleBtn) toggleBtn.disabled = false;
    updateRaceTrackingButton();
  }
}

function handleEnduranceStatus(status) {
  if (!status) return;
  enduranceState.running = !!status.running;
  updateEnduranceStatusUI();
}

function handleLeaderboardStatus(status) {
  if (!status) return;
  leaderboardState.running = !!status.running;
  updateLeaderboardStatusUI();
}

function handlePenaltiesStatus(status) {
  if (!status) return;
  penaltiesFeedState.running = !!status.running;
  updatePenaltiesStatusUI();
}

function handleEnduranceData(payload) {
  if (!payload) return;
  enduranceState.lastPayload = payload;
  updateEnduranceMeta();
  updateTrackedCarOptions();
  updateEnduranceTable();
  updateTrackedCarSummary();
  updatePenaltiesCarsSelect();
}

function handleLeaderboardData(payload) {
  if (!payload) return;
  leaderboardState.lastPayload = payload;
  updateLeaderboardMeta();
  updateTrackedCarOptions();
  updateLeaderboardTable();
  updateTrackedCarSummary();
  updatePenaltiesCarsSelect();
}

function handlePenaltiesData(payload) {
  if (!payload) return;
  penaltiesFeedState.lastPayload = payload;
  penaltiesFeedState.error = null;
  updatePenaltiesMeta();
  updatePenaltiesCarsSelect();
  updatePenaltiesDisplay();
}

function handleEnduranceError(message) {
  console.error('Endurance polling error:', message);
  const statusEl = document.getElementById('enduranceStatusText');
  if (statusEl) {
    statusEl.textContent = `Endurance error: ${message}`;
    statusEl.classList.remove('active');
    statusEl.classList.add('error');
  }
  updateRaceTrackingButton();
}

function handleLeaderboardError(message) {
  console.error('Leaderboard polling error:', message);
  const statusEl = document.getElementById('leaderboardStatusText');
  if (statusEl) {
    statusEl.textContent = `Leaderboard error: ${message}`;
    statusEl.classList.remove('active');
    statusEl.classList.add('error');
  }
  updateRaceTrackingButton();
}

function handlePenaltiesError(message) {
  console.error('Penalties polling error:', message);
  penaltiesFeedState.error = message;
  const statusEl = document.getElementById('penaltiesStatusText');
  if (statusEl) {
    statusEl.textContent = `Penalties error: ${message}`;
    statusEl.classList.remove('active');
    statusEl.classList.add('error');
  }
  updateRaceTrackingButton();
}

function updateEnduranceStatusUI() {
  const statusEl = document.getElementById('enduranceStatusText');
  if (statusEl) {
    statusEl.classList.remove('error');
    statusEl.textContent = enduranceState.running ? 'Endurance active' : 'Endurance stopped';
    statusEl.classList.toggle('active', enduranceState.running);
  }
  updateRaceTrackingButton();
}

function updateLeaderboardStatusUI() {
  const statusEl = document.getElementById('leaderboardStatusText');
  if (statusEl) {
    statusEl.classList.remove('error');
    statusEl.textContent = leaderboardState.running ? 'Leaderboard active' : 'Leaderboard stopped';
    statusEl.classList.toggle('active', leaderboardState.running);
  }
  updateRaceTrackingButton();
}

function updatePenaltiesStatusUI() {
  const statusEl = document.getElementById('penaltiesStatusText');
  if (statusEl) {
    statusEl.classList.remove('error');
    statusEl.textContent = penaltiesFeedState.running ? 'Penalties active' : 'Penalties stopped';
    statusEl.classList.toggle('active', penaltiesFeedState.running);
  }
  updateRaceTrackingButton();
}

function updateRaceTrackingButton() {
  const toggleBtn = document.getElementById('toggleRaceTrackingBtn');
  if (!toggleBtn) return;

  const anyRunning = enduranceState.running || leaderboardState.running || penaltiesFeedState.running;
  toggleBtn.textContent = anyRunning ? 'Stop Tracking' : 'Start Tracking';
  toggleBtn.title = anyRunning
    ? 'Stop endurance, leaderboard, and penalties polling'
    : 'Start endurance, leaderboard, and penalties polling';
  toggleBtn.classList.toggle('btn-primary', !anyRunning);
  toggleBtn.classList.toggle('btn-secondary', anyRunning);
}

function handleTestTransmitStatus(status) {
  if (!status) return;
  testTransmitState.running = !!status.running;
  testTransmitState.busy = false;
  updateTestTransmitButton();
}

function updateTestTransmitButton() {
  const testBtn = document.getElementById('testTxBtn');
  if (!testBtn) return;

  const label = testTransmitState.running ? 'Stop Test TX' : 'Start Test TX';
  testBtn.textContent = label;
  testBtn.classList.toggle('active', testTransmitState.running);
  testBtn.disabled = !isConnected || testTransmitState.busy;
  testBtn.title = testTransmitState.running
    ? 'Transmitting continuous test packets at 915 MHz. Click to stop.'
    : 'Send repeating 915 MHz test packets once connected.';
}

async function toggleTestTransmitMode() {
  if (!isConnected) {
    alert('Connect to a LoRa port before sending test packets.');
    return;
  }

  if (testTransmitState.busy) {
    return;
  }

  testTransmitState.busy = true;
  updateTestTransmitButton();

  try {
    if (testTransmitState.running) {
      await window.electronAPI.stopTestTransmit();
    } else {
      await window.electronAPI.startTestTransmit({ frequencyMHz: 915, intervalMs: 1000 });
    }
  } catch (error) {
    console.error('Failed to toggle test transmit:', error);
    alert(`Failed to toggle test transmit: ${error?.message || error}`);
  } finally {
    testTransmitState.busy = false;
    updateTestTransmitButton();
  }
}

function updateEnduranceMeta() {
  const asOfEl = document.getElementById('enduranceAsOf');
  if (!asOfEl) return;

  const meta = enduranceState.lastPayload?.meta || {};
  if (meta.finalAsOf) {
    asOfEl.textContent = `Endurance • Final as of ${meta.finalAsOf}`;
  } else if (meta.scrapedAt) {
    asOfEl.textContent = `Endurance • Updated ${formatLocalTimestamp(meta.scrapedAt)}`;
  } else {
    asOfEl.textContent = 'Endurance • --';
  }
}

function updateLeaderboardMeta() {
  const asOfEl = document.getElementById('leaderboardAsOf');
  if (!asOfEl) return;

  const meta = leaderboardState.lastPayload?.meta || {};
  const eventName = meta.event ? meta.event.name : null;
  const label = eventName ? `Leaderboard (${eventName})` : 'Leaderboard';

  if (meta.scrapedAt) {
    asOfEl.textContent = `${label} • Updated ${formatLocalTimestamp(meta.scrapedAt)}`;
  } else {
    asOfEl.textContent = `${label} • --`;
  }
}

function updatePenaltiesMeta() {
  const asOfEl = document.getElementById('penaltiesAsOf');
  if (!asOfEl) return;

  const meta = penaltiesFeedState.lastPayload?.meta || {};
  let label = null;
  if (meta.lastUpdatedText) {
    label = `Site update ${meta.lastUpdatedText}`;
  } else if (meta.latestEntryText) {
    label = `Latest entry ${meta.latestEntryText}`;
  } else if (meta.latestEntryISO) {
    label = `Latest entry ${formatLocalTimestamp(meta.latestEntryISO)}`;
  } else if (meta.scrapedAt) {
    label = `Updated ${formatLocalTimestamp(meta.scrapedAt)}`;
  }

  asOfEl.textContent = label ? `Black Flags • ${label}` : 'Black Flags • --';
}

function updateTrackedCarOptions() {
  const select = document.getElementById('trackedCarSelect');
  if (!select) return;

  const cars = new Set();
  if (Array.isArray(enduranceState.lastPayload?.data)) {
    enduranceState.lastPayload.data.forEach((row) => {
      const car = sanitizeCarNumber(row['Car #']);
      if (car) cars.add(car);
    });
  }
  if (Array.isArray(leaderboardState.lastPayload?.data)) {
    leaderboardState.lastPayload.data.forEach((row) => {
      // Attempt to find a column that looks like car number
      const car = sanitizeCarNumber(row['Car #'] || row['Car'] || row['Car\n#'] || row['Car\u00a0#']);
      if (car) cars.add(car);
    });
  }

  const desiredValues = [''].concat(Array.from(cars).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))); // lexical numeric sort
  const currentValues = Array.from(select.options).map((opt) => opt.value);
  const arraysMatch = desiredValues.length === currentValues.length && desiredValues.every((val, idx) => val === currentValues[idx]);

  if (!arraysMatch) {
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Track car...';
    select.appendChild(placeholder);

    desiredValues.slice(1).forEach((car) => {
      const option = document.createElement('option');
      option.value = car;
      option.textContent = `Car ${car}`;
      select.appendChild(option);
    });
  }

  if (raceState.trackedCar && desiredValues.includes(raceState.trackedCar)) {
    select.value = raceState.trackedCar;
  } else {
    select.value = '';
    raceState.trackedCar = '';
  }
}

function updateEnduranceTable() {
  const tbody = document.getElementById('enduranceTableBody');
  if (!tbody) return;

  const rows = enduranceState.lastPayload?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-state-row"><td colspan="5">No endurance data yet</td></tr>';
    return;
  }

  const tracked = raceState.trackedCar;
  const sorted = reorderForTracked(rows, tracked, (row) => sanitizeCarNumber(row['Car #']));

  const fragment = document.createDocumentFragment();
  sorted.forEach((row) => {
    const tr = document.createElement('tr');
    const car = sanitizeCarNumber(row['Car #']);
    if (tracked && car === tracked) {
      tr.classList.add('tracked');
    }

    ['Position', 'Car #', 'School', 'Team', 'Comments'].forEach((key) => {
      const td = document.createElement('td');
      td.textContent = row[key] || '';
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

function updateLeaderboardTable() {
  const thead = document.getElementById('leaderboardHead');
  const tbody = document.getElementById('leaderboardTableBody');
  if (!thead || !tbody) return;

  const payload = leaderboardState.lastPayload;
  const headers = payload?.meta?.headers || [];
  const rows = payload?.data;

  if (!headers.length || !Array.isArray(rows) || rows.length === 0) {
    const colSpan = headers.length ? headers.length : 5;
    thead.innerHTML = `<tr><th colspan="${colSpan}">Leaderboard data not loaded</th></tr>`;
    tbody.innerHTML = `<tr class="empty-state-row"><td colspan="${colSpan}">No leaderboard data yet</td></tr>`;
    return;
  }

  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tracked = raceState.trackedCar;
  const carAccessor = (row) => {
    // Attempt to find the car number column
    const keys = ['Car #', 'Car', 'Car\n#', 'Car\u00a0#'];
    for (const key of keys) {
      if (key in row) {
        const value = sanitizeCarNumber(row[key]);
        if (value) return value;
      }
    }
    return '';
  };

  const sorted = reorderForTracked(rows, tracked, carAccessor);

  const fragment = document.createDocumentFragment();
  sorted.forEach((row) => {
    const tr = document.createElement('tr');
    const car = carAccessor(row);
    if (tracked && car === tracked) {
      tr.classList.add('tracked');
    }

    headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row[header] || '';
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

function updateTrackedCarSummary() {
  const container = document.getElementById('trackedCarSummary');
  if (!container) return;

  const tracked = raceState.trackedCar;
  if (!tracked) {
    container.innerHTML = '<div class="empty-state">Select a car to track</div>';
    return;
  }

  const enduranceMatch = enduranceState.lastPayload?.data?.find((row) => sanitizeCarNumber(row['Car #']) === tracked);

  const carAccessor = (row) => {
    const keys = ['Car #', 'Car', 'Car\n#', 'Car\u00a0#'];
    for (const key of keys) {
      if (row[key]) return sanitizeCarNumber(row[key]);
    }
    return '';
  };
  const leaderboardMatch = leaderboardState.lastPayload?.data?.find((row) => carAccessor(row) === tracked);

  if (!enduranceMatch && !leaderboardMatch) {
    container.innerHTML = '<div class="empty-state">Car not present in latest results</div>';
    return;
  }

  container.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'tracked-title';
  title.textContent = 'Tracking car';

  const value = document.createElement('div');
  value.className = 'tracked-value';
  value.textContent = `#${tracked}`;

  const subgrid = document.createElement('div');
  subgrid.className = 'tracked-subgrid';

  if (enduranceMatch) {
    const block = document.createElement('div');
    block.className = 'summary-block';
    const heading = document.createElement('div');
    heading.className = 'tracked-title';
    heading.textContent = 'Endurance';

    const position = document.createElement('div');
    position.className = 'tracked-detail';
    position.textContent = enduranceMatch.Position ? `Position: ${enduranceMatch.Position}` : 'Position: --';

    const teamParts = [enduranceMatch.Team, enduranceMatch.School].filter(Boolean);
    const teamInfo = document.createElement('div');
    teamInfo.className = 'tracked-detail';
    teamInfo.textContent = teamParts.length ? teamParts.join(' • ') : 'Team: --';

    block.appendChild(heading);
    block.appendChild(position);
    block.appendChild(teamInfo);

    if (enduranceMatch.Comments) {
      const comments = document.createElement('div');
      comments.className = 'tracked-detail';
      comments.textContent = `Notes: ${enduranceMatch.Comments}`;
      block.appendChild(comments);
    }

    subgrid.appendChild(block);
  }

  if (leaderboardMatch) {
    const block = document.createElement('div');
    block.className = 'summary-block';
    const heading = document.createElement('div');
    heading.className = 'tracked-title';
    const eventName = leaderboardState.lastPayload?.meta?.event?.name || 'Leaderboard';
    heading.textContent = eventName;

    const headers = leaderboardState.lastPayload?.meta?.headers || [];
    headers.slice(0, 3).forEach((header) => {
      const detail = document.createElement('div');
      detail.className = 'tracked-detail';
      detail.textContent = `${header}: ${leaderboardMatch[header] || '--'}`;
      block.appendChild(detail);
    });

    subgrid.appendChild(block);
  }

  container.appendChild(title);
  container.appendChild(value);
  container.appendChild(subgrid);
}

function reorderForTracked(items, tracked, accessor) {
  if (!tracked) return items.slice();
  const trackedItems = [];
  const others = [];

  items.forEach((item) => {
    if (accessor(item) === tracked) trackedItems.push(item);
    else others.push(item);
  });

  return trackedItems.concat(others);
}

function sanitizeCarNumber(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getPenaltiesColumnMap() {
  const headers = penaltiesFeedState.lastPayload?.meta?.headers || [];
  const normalized = headers.map((header) => ({
    header,
    normalized: header.toLowerCase()
  }));

  const buildList = (keywords, defaults) => {
    const matches = normalized
      .filter(({ normalized: label }) => keywords.some((keyword) => label.includes(keyword)))
      .map(({ header }) => header);
    const combined = [...matches, ...defaults];
    return combined.filter((value, index) => value && combined.indexOf(value) === index);
  };

  return {
    timestamp: buildList(['time', 'date'], ['Time', 'Timestamp', 'Date/Time']),
    car: buildList(['car'], ['Car #', 'Car']),
    team: buildList(['team', 'school'], ['Team', 'School', 'School / Team']),
    infraction: buildList(['infraction', 'activity', 'description'], ['Infraction', 'Activity']),
    penalty: buildList(['penalty', 'minute'], ['Penalty', 'Minutes']),
    notes: buildList(['note', 'comment'], ['Notes', 'Comments'])
  };
}

function extractOrdinalFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('third')) return 3;
  if (lower.includes('second')) return 2;
  if (lower.includes('first')) return 1;
  const digit = lower.match(/\b(\d+)(st|nd|rd|th)?\b/);
  if (digit) return parseInt(digit[1], 10);
  return null;
}

function derivePenaltyOutcome(row) {
  const activity = (getPenaltyRowValue(row, 'infraction') || '').trim();
  if (!activity) return '';

  for (const rule of penaltyOutcomeRules) {
    if (!rule.patterns || !rule.patterns.length) continue;
    const matched = rule.patterns.some((pattern) => pattern.test(activity));
    if (!matched) continue;

    const penaltyId = rule.penaltyId;
    if (!penaltyId) {
      continue;
    }

    const offense = rule.offense || extractOrdinalFromText(activity) || 1;
    const penaltyLabel = penaltiesManager.getPenaltyForOffense(penaltyId, offense);
    if (penaltyLabel) {
      return penaltyLabel;
    }
  }

  return '';
}

function getPenaltyRowValue(row, columnKey) {
  const columnMap = getPenaltiesColumnMap();
  const candidates = columnMap[columnKey] || [];
  for (const key of candidates) {
    if (key && Object.prototype.hasOwnProperty.call(row, key) && row[key]) {
      return row[key];
    }
  }
  if (columnKey === 'car') {
    return row.__car || '';
  }
  if (columnKey === 'penalty') {
    return derivePenaltyOutcome(row);
  }
  return '';
}

function getPenaltyRowCar(row) {
  return sanitizeCarNumber(getPenaltyRowValue(row, 'car'));
}

function formatLocalTimestamp(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function initTheme(config) {
  const preferred = getPreferredTheme(config);
  applyTheme(preferred);
}

function getPreferredTheme(config) {
  if (config && typeof config.uiTheme === 'string') {
    return config.uiTheme;
  }

  try {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    if (cached === 'light' || cached === 'dark') {
      return cached;
    }
  } catch (error) {
    console.warn('Unable to read cached theme preference:', error);
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function applyTheme(mode) {
  const normalized = mode === 'light' ? 'light' : 'dark';
  themeState.mode = normalized;

  if (document.documentElement) {
    document.documentElement.setAttribute('data-theme', normalized);
  }
  if (document.body) {
    document.body.setAttribute('data-theme', normalized);
  }

  const toggle = document.getElementById('themeToggleBtn');
  if (toggle) {
    const label = normalized === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    toggle.textContent = normalized === 'light' ? 'Dark Mode' : 'Light Mode';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
}

function persistThemePreference(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (error) {
    console.warn('Unable to cache theme preference:', error);
  }

  if (window?.electronAPI?.saveConfig) {
    window.electronAPI.saveConfig({ uiTheme: mode }).catch((error) => {
      console.warn('Failed to persist theme preference:', error);
    });
  }
}

/**
 * Save configuration to disk
 */
async function saveConfiguration() {
  const config = {
    startFinishLine: lapManager.startFinishLine,
    autoCenter: trackMap.autoCenter,
    uiTheme: themeState.mode
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
  let config = null;
  try {
    config = await window.electronAPI.loadConfig();
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }

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

    if (config.trackGeoJSON) {
      try {
        trackMap.importTrackGeoJSON(config.trackGeoJSON);
      } catch (error) {
        console.warn('Failed to restore saved track:', error);
      }
    }

    console.log('Configuration loaded');
  }

  initTheme(config);
  return config;
}

/**
 * Penalties UI Functions
 */

/**
 * Update penalties car selector dropdown
 */
function updatePenaltiesCarsSelect() {
  const select = document.getElementById('penaltiesCar');
  if (!select) return;

  // Get all unique cars from endurance and leaderboard
  const cars = new Set();
  
  if (enduranceState.lastPayload?.data) {
    enduranceState.lastPayload.data.forEach((row) => {
      const car = sanitizeCarNumber(row['Car #']);
      if (car) cars.add(car);
    });
  }

  if (leaderboardState.lastPayload?.data) {
    leaderboardState.lastPayload.data.forEach((row) => {
      const keys = ['Car #', 'Car', 'Car\n#', 'Car\u00a0#'];
      for (const key of keys) {
        const car = sanitizeCarNumber(row[key]);
        if (car) cars.add(car);
      }
    });
  }

  if (penaltiesFeedState.lastPayload?.data) {
    penaltiesFeedState.lastPayload.data.forEach((row) => {
      const car = getPenaltyRowCar(row);
      if (car) cars.add(car);
    });
  }

  // Add cars that already have penalties
  penaltiesManager.getAllCarsWithPenalties().forEach(car => cars.add(car));

  const sortedCars = Array.from(cars).sort((a, b) => 
    a.localeCompare(b, undefined, { numeric: true })
  );

  const desiredValues = [''].concat(sortedCars);
  const currentValues = Array.from(select.options).map((opt) => opt.value);
  const arraysMatch = desiredValues.length === currentValues.length && 
    desiredValues.every((val, idx) => val === currentValues[idx]);

  if (!arraysMatch) {
    select.innerHTML = '<option value="">All cars</option>';
    sortedCars.forEach((car) => {
      const option = document.createElement('option');
      option.value = car;
      option.textContent = `Car ${car}`;
      select.appendChild(option);
    });
  }
}

/**
 * Update penalties display for selected car
 */
function updatePenaltiesDisplay() {
  const content = document.getElementById('penaltiesContent');
  if (!content) return;

  const car = penaltiesState.selectedCar;
  const remoteRows = penaltiesFeedState.lastPayload?.data || [];
  content.innerHTML = '';

  if (car) {
    const remoteSection = createRemotePenaltiesSection(
      remoteRows.filter((row) => getPenaltyRowCar(row) === car),
      { car }
    );
    if (remoteSection) {
      content.appendChild(remoteSection);
    }

    const manualSection = createManualPenaltiesSection(car);
    if (manualSection) {
      content.appendChild(manualSection);
    }

    if (!remoteSection && !manualSection) {
      content.innerHTML = `<div class="empty-state">No penalties for car ${car}</div>`;
    }
  } else {
    const remoteSection = createRemotePenaltiesSection(remoteRows.slice(0, 40), { showOverview: true });
    if (remoteSection) {
      content.appendChild(remoteSection);
    }

    const manualOverview = createManualPenaltiesOverview();
    if (manualOverview) {
      content.appendChild(manualOverview);
    }

    if (!remoteSection && !manualOverview) {
      content.innerHTML = '<div class="empty-state">No penalties recorded yet</div>';
    }
  }
}

function createRemotePenaltiesSection(rows, { car = null, showOverview = false } = {}) {
  const section = document.createElement('div');
  section.className = 'remote-penalties-section';

  const header = document.createElement('div');
  header.className = 'penalties-subheader';
  if (car) {
    header.textContent = `Live Black Flags for Car ${car}`;
  } else {
    header.textContent = 'Latest Live Black Flags';
  }
  section.appendChild(header);

  if (!rows.length) {
    const message = document.createElement('div');
    message.className = 'empty-state';
    if (car) {
      message.textContent = penaltiesFeedState.running
        ? `No live penalties have been posted for car ${car} yet.`
        : 'Start tracking to pull penalties from the official site.';
    } else if (penaltiesFeedState.running) {
      message.textContent = 'Waiting for the next update from the Black Flags page.';
    } else {
      message.textContent = 'Start tracking to pull penalties from the official site.';
    }
    section.appendChild(message);
    return section;
  }

  const table = buildRemotePenaltiesTable(rows, {
    includeCarColumn: !car,
    limit: car ? 20 : 40
  });
  section.appendChild(table);

  if (!car && showOverview) {
    const helper = document.createElement('div');
    helper.className = 'penalties-helper-text';
    helper.textContent = 'Select a car to focus this view and add manual notes.';
    section.appendChild(helper);
  }

  return section;
}

function buildRemotePenaltiesTable(rows, { includeCarColumn = true, limit = 40 } = {}) {
  const columns = [
    { key: 'timestamp', label: 'Time' }
  ];
  if (includeCarColumn) {
    columns.push({ key: 'car', label: 'Car #' });
  }
  columns.push(
    { key: 'team', label: 'Team / School' },
    { key: 'infraction', label: 'Infraction' },
    { key: 'penalty', label: 'Penalty' },
    { key: 'notes', label: 'Notes' }
  );

  const table = document.createElement('table');
  table.className = 'remote-penalties-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.slice(0, limit).forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      const value = getPenaltyRowValue(row, column.key);
      td.textContent = value || (column.key === 'penalty' ? UNMAPPED_PENALTY_PLACEHOLDER : '');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function createManualPenaltiesSection(car) {
  const carPenalties = penaltiesManager.getPenaltiesForCar(car);
  const timePenalty = penaltiesManager.getTotalTimePenalty(car);
  if (Object.keys(carPenalties).length === 0 && timePenalty.totalMinutes === 0 && !timePenalty.hasDQ) {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'manual-penalties-section';

  const header = document.createElement('div');
  header.className = 'penalties-subheader';
  header.textContent = 'Manual notes & tracking';
  container.appendChild(header);

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'penalties-summary';

  if (timePenalty.hasDQ) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card danger';
    card.innerHTML = '<div class="label">Status</div><div class="value">DQ</div>';
    summaryDiv.appendChild(card);
  } else if (timePenalty.totalMinutes > 0) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card warning';
    card.innerHTML = `<div class="label">Total Time</div><div class="value">${timePenalty.totalMinutes}m</div>`;
    summaryDiv.appendChild(card);
  }

  for (const [type, penalties] of Object.entries(carPenalties)) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card';
    const count = penalties.length;
    card.innerHTML = `<div class="label">${type}</div><div class="value">${count}</div>`;
    summaryDiv.appendChild(card);
  }

  container.appendChild(summaryDiv);

  const list = document.createElement('div');
  list.className = 'penalties-list';
  for (const [type, penalties] of Object.entries(carPenalties)) {
    penalties.forEach((penalty, index) => {
      const item = createPenaltyItem(penalty, type, car, index);
      list.appendChild(item);
    });
  }
  container.appendChild(list);

  return container;
}

function createManualPenaltiesOverview() {
  const allCars = penaltiesManager.getAllCarsWithPenalties();
  if (!allCars.length) {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'manual-penalties-overview';

  const header = document.createElement('div');
  header.className = 'penalties-subheader';
  header.textContent = 'Manual notes by car';
  container.appendChild(header);

  allCars.forEach((carNum) => {
    const summary = createCarPenaltiesSummary(carNum);
    container.appendChild(summary);
  });
  return container;
}

/**
 * Create penalty item element
 */
function createPenaltyItem(penalty, type, car, index) {
  const item = document.createElement('div');
  item.className = 'penalty-item';
  if (penalty.penalty === 'DQ') {
    item.classList.add('dq');
  }

  const content = document.createElement('div');
  content.className = 'penalty-item-content';

  const typeTag = document.createElement('div');
  typeTag.className = `penalty-item-type ${type.toLowerCase()}`;
  typeTag.textContent = type;
  content.appendChild(typeTag);

  const infraction = document.createElement('div');
  infraction.className = 'penalty-item-infraction';
  infraction.textContent = penalty.infraction;
  content.appendChild(infraction);

  const details = document.createElement('div');
  details.className = 'penalty-item-details';

  const offenseRow = document.createElement('div');
  offenseRow.className = 'penalty-detail-row';
  offenseRow.innerHTML = `<span class="penalty-detail-label">Offense:</span><span class="penalty-detail-value offense">${penalty.offense}</span>`;
  details.appendChild(offenseRow);

  const penaltyRow = document.createElement('div');
  penaltyRow.className = 'penalty-detail-row';
  const penaltyClass = penalty.penalty === 'DQ' ? 'dq' : '';
  penaltyRow.innerHTML = `<span class="penalty-detail-label">Penalty:</span><span class="penalty-detail-value ${penaltyClass}">${penalty.penalty}</span>`;
  details.appendChild(penaltyRow);

  const timeRow = document.createElement('div');
  timeRow.className = 'penalty-detail-row';
  const timestamp = new Date(penalty.timestamp).toLocaleTimeString();
  timeRow.innerHTML = `<span class="penalty-detail-label">Time:</span><span class="penalty-detail-value">${timestamp}</span>`;
  details.appendChild(timeRow);

  content.appendChild(details);
  item.appendChild(content);

  // Add remove button
  const actions = document.createElement('div');
  actions.className = 'penalty-item-actions';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'penalty-remove-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    penaltiesManager.removePenalty(car, type, index);
    updatePenaltiesDisplay();
  });
  actions.appendChild(removeBtn);

  item.appendChild(actions);

  return item;
}

/**
 * Create summary for a car with penalties
 */
function createCarPenaltiesSummary(car) {
  const container = document.createElement('div');
  container.style.borderLeft = '3px solid ' + getCarColor(car);
  container.style.paddingLeft = 'var(--spacing-md)';
  container.style.marginBottom = 'var(--spacing-md)';

  const title = document.createElement('div');
  title.style.fontSize = '16px';
  title.style.fontWeight = '700';
  title.style.marginBottom = 'var(--spacing-sm)';
  title.innerHTML = `<span style="color: var(--accent-primary);">Car ${car}</span>`;

  const carPenalties = penaltiesManager.getPenaltiesForCar(car);
  const timePenalty = penaltiesManager.getTotalTimePenalty(car);

  const summary = document.createElement('div');
  summary.style.display = 'grid';
  summary.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))';
  summary.style.gap = 'var(--spacing-sm)';
  summary.style.marginBottom = 'var(--spacing-md)';

  if (timePenalty.hasDQ) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card danger';
    card.innerHTML = '<div class="label">Status</div><div class="value">DQ</div>';
    summary.appendChild(card);
  } else if (timePenalty.totalMinutes > 0) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card warning';
    card.innerHTML = `<div class="label">Time</div><div class="value">${timePenalty.totalMinutes}m</div>`;
    summary.appendChild(card);
  }

  for (const [type, penalties] of Object.entries(carPenalties)) {
    const card = document.createElement('div');
    card.className = 'penalty-summary-card';
    card.innerHTML = `<div class="label">${type}</div><div class="value">${penalties.length}</div>`;
    summary.appendChild(card);
  }

  container.appendChild(title);
  container.appendChild(summary);

  return container;
}

/**
 * Get a color for a car number
 */
function getCarColor(car) {
  const colors = ['#00d4ff', '#00ff88', '#ffaa00', '#ff4444', '#ff00ff', '#00ffaa'];
  const hash = car.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * Open add penalty modal
 */
function openAddPenaltyModal() {
  const car = penaltiesState.selectedCar;
  if (!car) {
    alert('Please select a car first');
    return;
  }

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'penalty-add-modal';
  modal.innerHTML = `
    <div class="penalty-modal-content">
      <div class="penalty-modal-header">Add Penalty - Car ${car}</div>
      
      <div class="penalty-modal-section">
        <label>Penalty Type</label>
        <select id="penaltyType" class="penalty-modal-select">
          <option value="">Select type...</option>
          <option value="Fuel">Fuel</option>
          <option value="Driving">Driving</option>
        </select>
      </div>

      <div class="penalty-modal-section">
        <label>Infraction</label>
        <div id="infractionList" class="penalty-infraction-list"></div>
        <input type="hidden" id="selectedInfractionId" value="">
      </div>

      <div class="penalty-modal-section">
        <label>Notes (Optional)</label>
        <textarea id="penaltyNotes" class="penalty-modal-input" rows="3" placeholder="Add any additional notes..."></textarea>
      </div>

      <div class="penalty-modal-buttons">
        <button class="btn btn-secondary" onclick="this.closest('.penalty-add-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddPenalty()">Add Penalty</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Set up type selector
  const typeSelect = modal.querySelector('#penaltyType');
  typeSelect.addEventListener('change', () => {
    updateInfractionList(typeSelect.value, modal);
  });

  penaltiesState.showAddModal = true;
}

/**
 * Update infraction list in modal based on type
 */
function updateInfractionList(type, modal) {
  const list = modal.querySelector('#infractionList');
  list.innerHTML = '';

  if (!type) {
    list.innerHTML = '<div style="padding: var(--spacing-md); text-align: center; color: var(--text-secondary);">Select a penalty type</div>';
    return;
  }

  const penaltyDefs = penaltiesManager.penaltyDefinitions[type] || [];

  penaltyDefs.forEach(penaltyDef => {
    const item = document.createElement('div');
    item.className = 'penalty-infraction-item';
    item.dataset.id = penaltyDef.id;
    item.innerHTML = `<div class="penalty-infraction-text">${penaltyDef.infraction}</div>`;

    item.addEventListener('click', () => {
      // Deselect previous
      modal.querySelectorAll('.penalty-infraction-item').forEach(i => i.classList.remove('selected'));
      // Select this one
      item.classList.add('selected');
      modal.querySelector('#selectedInfractionId').value = penaltyDef.id;
    });

    list.appendChild(item);
  });
}

/**
 * Submit add penalty form
 */
function submitAddPenalty() {
  const modal = document.querySelector('.penalty-add-modal');
  if (!modal) return;

  const car = penaltiesState.selectedCar;
  const infractionId = modal.querySelector('#selectedInfractionId').value;
  const notes = modal.querySelector('#penaltyNotes').value;

  if (!infractionId) {
    alert('Please select an infraction');
    return;
  }

  try {
    penaltiesManager.addPenalty(car, infractionId, notes);
    modal.remove();
    updatePenaltiesDisplay();
  } catch (error) {
    alert(`Failed to add penalty: ${error.message}`);
  }
}

/**
 * Export penalties to JSON
 */
function exportPenalties() {
  const json = penaltiesManager.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `penalties-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Clear all penalties with confirmation
 */
function clearAllPenalties() {
  if (!confirm('Clear all penalties? This cannot be undone.')) {
    return;
  }

  penaltiesManager.clearAllPenalties();
  updatePenaltiesCarsSelect();
  updatePenaltiesDisplay();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
