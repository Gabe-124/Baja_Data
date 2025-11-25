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

const SIMULATION_SPEED_MPH = 25;
const MPH_TO_MPS = 0.44704;
const SPEEDOMETER_MAX_MPH = 40;
const SPEEDOMETER_MIN_ANGLE = -130;
const SPEEDOMETER_MAX_ANGLE = 130;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const raceTimerState = {
  durationMs: FOUR_HOURS_MS,
  startTimeMs: null,
  adjustmentMs: 0,
  intervalId: null
};

const simulationState = {
  running: false,
  intervalId: null,
  sequence: 0,
  intervalMs: 500,
  speedMps: SIMULATION_SPEED_MPH * MPH_TO_MPS,
  pathSegments: [],
  segmentSpeedFactors: [],
  segmentIndex: 0,
  distanceIntoSegment: 0,
  totalLength: 0,
  originLat: null,
  originLon: null,
  lapSpeedFactor: 1,
  loopCounter: 0,
  currentSpeedMps: SIMULATION_SPEED_MPH * MPH_TO_MPS,
  gpsNoiseMeters: 0.5,
  baseLat: 40.391234,
  baseLon: -88.221234,
  radiusMeters: 70
};

const lapSortState = {
  mode: 'lapNumber'
};

const speedState = {
  lastPoint: null,
  currentMps: 0
};

const commandLogState = {
  entries: []
};

const consoleState = {
  collapsed: false
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

  // Initialize race timer UI/state
  await initializeRaceTimer();

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

  const testBtn = document.getElementById('testTxBtn');
  if (testBtn) {
    testBtn.addEventListener('click', toggleTestTransmitMode);
    updateTestTransmitButton();
  }

  const simulateBtn = document.getElementById('simulateGpsBtn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', toggleSimulationMode);
    updateSimulationButton();
  }

  // Map controls
  const centerTrackBtn = document.getElementById('centerTrackBtn');
  if (centerTrackBtn) {
    centerTrackBtn.addEventListener('click', () => {
      // Disable auto-centering so map stops following the car
      trackMap.setAutoCenter(false);
      // Ensure map size is correct before fitting bounds (important after resize)
      trackMap.map.invalidateSize();
      const success = trackMap.fitTrack();
      if (!success) {
        trackMap.centerOnCar();
      }
    });
  }

  const centerCarBtn = document.getElementById('centerCarBtn');
  if (centerCarBtn) {
    centerCarBtn.addEventListener('click', () => {
      trackMap.centerOnCar();
      trackMap.setAutoCenter(true);
    });
  }

  // Map type toggle (satellite vs tiles)
  document.getElementById('toggleMapTypeBtn').addEventListener('click', () => {
    const newType = trackMap.toggleMapType();
    // Update the button icon to reflect the selected layer
    const btn = document.getElementById('toggleMapTypeBtn');
    btn.textContent = newType === 'satellite' ? '🗺️' : '🛰️';
    btn.title = newType === 'satellite' ? 'Switch to street map' : 'Switch to satellite view';
  });

  // Draw/Edit/Save/Import track controls
  document.getElementById('editTrackBtn').addEventListener('click', () => {
    // Toggle drawing/editing: enabling drawing control also provides edit/remove UI
    if (trackMap._drawingEnabled) {
      trackMap.disableDrawing();
      alert('Drawing disabled. Use Save to persist track.');
    } else {
      trackMap.enableDrawing();
      alert('Drawing enabled: use the draw toolbar to trace the track. When finished, click the save button.');
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

  const startRaceTimerBtn = document.getElementById('startRaceTimerBtn');
  if (startRaceTimerBtn) {
    startRaceTimerBtn.addEventListener('click', handleRaceStartRequest);
    updateRaceStartButton();
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
    const lapSortToggleBtn = document.getElementById('lapSortToggleBtn');
    if (lapSortToggleBtn) {
      lapSortToggleBtn.addEventListener('click', toggleLapSortMode);
      updateLapSortButton();
    }

    const sendCommandBtn = document.getElementById('sendCommandBtn');
    const commandInput = document.getElementById('commandInput');
    const clearCommandLogBtn = document.getElementById('clearCommandLogBtn');

    if (sendCommandBtn && commandInput) {
      sendCommandBtn.addEventListener('click', () => sendLoRaCommandFromInput());
      commandInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendLoRaCommandFromInput();
        }
      });
    }

    if (clearCommandLogBtn) {
      clearCommandLogBtn.addEventListener('click', () => clearCommandLog());
    }

    const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
    if (toggleConsoleBtn) {
      toggleConsoleBtn.addEventListener('click', () => toggleConsoleVisibility());
      updateConsoleToggleState();
    }

    renderCommandLog();

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

  if (simulationState.running) {
    alert('Stop the simulation before connecting to a real LoRa receiver.');
    return;
  }

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

function toggleSimulationMode() {
  if (simulationState.running) {
    stopSimulationMode();
  } else {
    startSimulationMode();
  }
}

function startSimulationMode() {
  if (simulationState.running) return;
  if (isConnected) {
    alert('Disconnect from the LoRa receiver before starting simulation.');
    return;
  }

  const preparedTrack = prepareSimulationTrack();
  if (!preparedTrack) {
    alert('Draw or import a track first (or record a lap) so the simulator knows where to drive.');
    return;
  }

  simulationState.sequence = 0;
  simulationState.running = true;
  simulationState.pathSegments = preparedTrack.segments;
  simulationState.segmentSpeedFactors = preparedTrack.segmentSpeedFactors;
  simulationState.segmentIndex = preparedTrack.startSegmentIndex;
  simulationState.distanceIntoSegment = preparedTrack.startDistanceIntoSegment;
  simulationState.totalLength = preparedTrack.totalLength;
  simulationState.originLat = preparedTrack.originLat;
  simulationState.originLon = preparedTrack.originLon;
  simulationState.loopCounter = 0;
  simulationState.lapSpeedFactor = randomLapSpeedFactor();
  simulationState.currentSpeedMps = simulationState.speedMps;

  lapManager.clearLaps();
  trackMap.clearTrack();
  trackMap.setAutoCenter(true);

  const emitTelemetry = (point) => {
    const telemetry = buildSimulationTelemetry(point);
    handleTelemetryData(telemetry);
  };

  emitTelemetry(preparedTrack.startPoint);

  const tick = () => {
    const point = advanceSimulationAlongTrack();
    emitTelemetry(point);
  };

  simulationState.intervalId = setInterval(tick, simulationState.intervalMs);
  handleConnectionStatus({ connected: true, port: 'Simulation Mode', simulation: true });
  updateSimulationButton();
}

function stopSimulationMode() {
  if (!simulationState.running) return;

  if (simulationState.intervalId) {
    clearInterval(simulationState.intervalId);
    simulationState.intervalId = null;
  }

  simulationState.running = false;
  simulationState.pathSegments = [];
  simulationState.segmentSpeedFactors = [];
  simulationState.segmentIndex = 0;
  simulationState.distanceIntoSegment = 0;
  simulationState.totalLength = 0;
  simulationState.lapSpeedFactor = 1;
  simulationState.currentSpeedMps = simulationState.speedMps;

  handleConnectionStatus({ connected: false, port: null, simulation: true });
  updateSimulationButton();
}

function updateSimulationButton() {
  const btn = document.getElementById('simulateGpsBtn');
  if (!btn) return;

  btn.textContent = simulationState.running ? 'Stop Simulation' : 'Start Simulation';
  btn.classList.toggle('btn-primary', simulationState.running);
  btn.classList.toggle('btn-secondary', !simulationState.running);
  btn.title = simulationState.running
    ? 'Stop sending fake GPS packets to the dashboard'
    : 'Generate fake GPS data without a LoRa radio';

  // Keep the test transmit button disabled during simulation runs
  updateTestTransmitButton();
}

function estimateSpeedMps(telemetry) {
  if (!telemetry) {
    return 0;
  }

  const timestampMs = getTelemetryTimestampMs(telemetry);
  const hasCoords = typeof telemetry.latitude === 'number' && typeof telemetry.longitude === 'number';
  let computed = null;

  if (Number.isFinite(telemetry.speedMps)) {
    computed = Math.max(0, telemetry.speedMps);
  } else if (hasCoords && speedState.lastPoint) {
    const deltaTime = (timestampMs - speedState.lastPoint.timestamp) / 1000;
    if (deltaTime > 0.2 && deltaTime < 15) {
      const distance = haversineDistance(
        speedState.lastPoint.lat,
        speedState.lastPoint.lon,
        telemetry.latitude,
        telemetry.longitude
      );
      computed = Math.max(0, distance / deltaTime);
    }
  }

  if (hasCoords) {
    speedState.lastPoint = {
      lat: telemetry.latitude,
      lon: telemetry.longitude,
      timestamp: timestampMs
    };
  }

  speedState.currentMps = computed ?? speedState.currentMps ?? 0;
  return computed ?? speedState.currentMps ?? 0;
}

function updateSpeedometer(speedMps = 0) {
  const mph = Math.max(0, speedMps / MPH_TO_MPS);
  const clamped = Math.min(SPEEDOMETER_MAX_MPH, mph);
  const ratio = SPEEDOMETER_MAX_MPH > 0 ? clamped / SPEEDOMETER_MAX_MPH : 0;
  const angle = SPEEDOMETER_MIN_ANGLE + (SPEEDOMETER_MAX_ANGLE - SPEEDOMETER_MIN_ANGLE) * ratio;

  const needle = document.getElementById('speedNeedle');
  if (needle) {
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  }

  const valueElement = document.getElementById('speedValue');
  if (valueElement) {
    valueElement.textContent = Math.round(mph).toString().padStart(2, '0');
  }
}

function getTelemetryTimestampMs(telemetry) {
  if (!telemetry) {
    return Date.now();
  }
  const raw = telemetry.timestamp || telemetry.ts;
  if (raw) {
    const parsed = new Date(raw).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (typeof telemetry.time === 'number') {
    return telemetry.time;
  }
  return Date.now();
}

function prepareSimulationTrack() {
  let points = getSimulationTrackPoints();
  let startFinish = getExistingStartFinishPoint();

  if (!points.length) {
    if (!startFinish) {
      startFinish = { lat: simulationState.baseLat, lng: simulationState.baseLon };
      lapManager.setStartFinishLine(startFinish.lat, startFinish.lng, 12);
      trackMap.setStartFinishLine(startFinish.lat, startFinish.lng, 12);
    }
    points = buildCircularTrackPoints(startFinish, simulationState.radiusMeters);
  } else {
    if (!startFinish) {
      startFinish = points[0];
      const radius = lapManager.startFinishLine?.radius || 12;
      lapManager.setStartFinishLine(startFinish.lat, startFinish.lng, radius);
      trackMap.setStartFinishLine(startFinish.lat, startFinish.lng, radius);
    }
  }

  const closedPoints = ensureLoopClosure(points.slice());
  const path = buildPathSegments(closedPoints);
  if (!path) {
    return null;
  }

  const projection = projectPointOntoSegments(startFinish, path);
  if (!projection) {
    return null;
  }

  return {
    ...path,
    startSegmentIndex: projection.segmentIndex,
    startDistanceIntoSegment: projection.distanceIntoSegment,
    startPoint: projection.position
  };
}

function getSimulationTrackPoints() {
  try {
    const points = trackMap.getActiveTrackLatLngs();
    if (Array.isArray(points) && points.length >= 2) {
      return points.map((pt) => ({ lat: pt.lat, lng: pt.lng }));
    }
  } catch (error) {
    console.warn('Failed to read active track points for simulator:', error);
  }
  return [];
}

function getExistingStartFinishPoint() {
  if (lapManager.startFinishLine?.lat && lapManager.startFinishLine?.lon) {
    return { lat: lapManager.startFinishLine.lat, lng: lapManager.startFinishLine.lon };
  }
  return null;
}

function ensureLoopClosure(points) {
  if (!points || points.length < 2) return points || [];
  const first = points[0];
  const last = points[points.length - 1];
  const gap = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  if (gap > 2) {
    points.push({ ...first });
  }
  return points;
}

function buildPathSegments(points) {
  if (!points || points.length < 2) return null;
  const originLat = points[0].lat;
  const originLon = points[0].lng;
  const segments = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const startXY = latLonToXY(start.lat, start.lng, originLat, originLon);
    const endXY = latLonToXY(end.lat, end.lng, originLat, originLon);
    const dx = endXY.x - startXY.x;
    const dy = endXY.y - startXY.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.1) continue;
    segments.push({ start, end, startXY, endXY, length });
  }

  const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (!segments.length || totalLength <= 0) {
    return null;
  }

  const segmentSpeedFactors = computeSegmentSpeedFactors(segments);
  return { segments, segmentSpeedFactors, totalLength, originLat, originLon };
}

function computeSegmentSpeedFactors(segments) {
  const len = segments.length;
  if (!len) return [];
  return segments.map((segment, index) => {
    const prev = segments[(index - 1 + len) % len];
    const next = segments[(index + 1) % len];
    const currHeading = segmentHeading(segment);
    const nextHeading = segmentHeading(next);
    const angleDiff = Math.abs(normalizeAngle(nextHeading - currHeading));
    const turnRatio = Math.min(angleDiff / (Math.PI), 1); // 0 straight, 1 hairpin
    const base = 1.25 - 0.75 * turnRatio; // 1.25 straight → 0.5 tight turn
    const lengthBonus = Math.min(segment.length / 60, 0.25);
    return clamp(base + lengthBonus, 0.35, 1.35);
  });
}

function segmentHeading(segment) {
  if (!segment) return 0;
  return Math.atan2(segment.endXY.y - segment.startXY.y, segment.endXY.x - segment.startXY.x);
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function projectPointOntoSegments(point, path) {
  if (!path?.segments?.length) return null;
  const target = latLonToXY(point.lat, point.lng, path.originLat, path.originLon);
  let best = null;

  path.segments.forEach((segment, index) => {
    const vx = segment.endXY.x - segment.startXY.x;
    const vy = segment.endXY.y - segment.startXY.y;
    const segLenSq = vx * vx + vy * vy;
    let t = segLenSq === 0 ? 0 : ((target.x - segment.startXY.x) * vx + (target.y - segment.startXY.y) * vy) / segLenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = segment.startXY.x + vx * t;
    const projY = segment.startXY.y + vy * t;
    const distSq = (target.x - projX) ** 2 + (target.y - projY) ** 2;

    if (!best || distSq < best.distSq) {
      best = {
        segmentIndex: index,
        distanceIntoSegment: t * segment.length,
        distSq,
        position: {
          lat: segment.start.lat + (segment.end.lat - segment.start.lat) * t,
          lng: segment.start.lng + (segment.end.lng - segment.start.lng) * t
        }
      };
    }
  });

  if (!best) return null;
  return {
    segmentIndex: best.segmentIndex,
    distanceIntoSegment: best.distanceIntoSegment,
    position: best.position
  };
}

function advanceSimulationAlongTrack() {
  if (!simulationState.pathSegments.length) {
    const fallback = getExistingStartFinishPoint() || { lat: simulationState.baseLat, lng: simulationState.baseLon };
    simulationState.currentSpeedMps = simulationState.speedMps;
    return fallback;
  }

  let remainingSeconds = simulationState.intervalMs / 1000;
  const totalSegments = simulationState.pathSegments.length;

  while (remainingSeconds > 0) {
    const current = simulationState.pathSegments[simulationState.segmentIndex];
    if (!current || current.length <= 0) {
      stepToNextSimulationSegment(totalSegments);
      continue;
    }

    const segFactor = simulationState.segmentSpeedFactors?.[simulationState.segmentIndex] ?? 1;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    const speedMps = Math.max(simulationState.speedMps * simulationState.lapSpeedFactor * segFactor * jitter, 0.5);
    simulationState.currentSpeedMps = speedMps;

    const segRemaining = Math.max(current.length - simulationState.distanceIntoSegment, 0);
    const timeToFinishSeg = segRemaining / speedMps;

    if (timeToFinishSeg >= remainingSeconds || segRemaining === 0) {
      const distanceAdvance = speedMps * remainingSeconds;
      simulationState.distanceIntoSegment = Math.min(current.length, simulationState.distanceIntoSegment + distanceAdvance);
      remainingSeconds = 0;
    } else {
      simulationState.segmentIndex = (simulationState.segmentIndex + 1) % totalSegments;
      simulationState.distanceIntoSegment = 0;
      remainingSeconds -= timeToFinishSeg;
      if (simulationState.segmentIndex === 0) {
        simulationState.loopCounter += 1;
        simulationState.lapSpeedFactor = randomLapSpeedFactor();
      }
    }
  }

  const activeSegment = simulationState.pathSegments[simulationState.segmentIndex];
  const ratio = activeSegment.length ? simulationState.distanceIntoSegment / activeSegment.length : 0;
  return interpolateLatLon(activeSegment.start, activeSegment.end, ratio);
}

function stepToNextSimulationSegment(totalSegments) {
  simulationState.segmentIndex = (simulationState.segmentIndex + 1) % Math.max(totalSegments, 1);
  simulationState.distanceIntoSegment = 0;
  if (simulationState.segmentIndex === 0) {
    simulationState.loopCounter += 1;
    simulationState.lapSpeedFactor = randomLapSpeedFactor();
  }
}

function buildSimulationTelemetry(point) {
  const sequence = simulationState.sequence++;
  const jitteredPoint = addGpsNoise(point, simulationState.gpsNoiseMeters);
  const speedMps = simulationState.currentSpeedMps;
  return {
    timestamp: new Date().toISOString(),
    latitude: jitteredPoint.lat,
    longitude: jitteredPoint.lng,
    altitude: 10 + Math.random() * 2,
    fix: 3,
    satellites: 9 + Math.floor(Math.random() * 4),
    hdop: 0.6 + Math.random() * 0.3,
    speedMps,
    speedMph: speedMps / MPH_TO_MPS,
    source: 'simulator',
    sequence,
    raw: { sim: true, speedMph: speedMps / MPH_TO_MPS }
  };
}

function interpolateLatLon(start, end, ratio) {
  const t = Math.max(0, Math.min(1, ratio));
  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t
  };
}

function latLonToXY(lat, lon, originLat, originLon) {
  const x = (lon - originLon) * Math.cos((originLat * Math.PI) / 180) * 111320;
  const y = (lat - originLat) * 111320;
  return { x, y };
}

function offsetLatLon(lat, lon, northMeters, eastMeters) {
  const dLat = northMeters / 111320;
  const dLon = eastMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    lat: lat + dLat,
    lng: lon + (isFinite(dLon) ? dLon : 0)
  };
}

function addGpsNoise(point, meters = 0.5) {
  const north = randomGaussian() * (meters / 2);
  const east = randomGaussian() * (meters / 2);
  return offsetLatLon(point.lat, point.lng, north, east);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildCircularTrackPoints(start, radiusMeters = 70, steps = 72) {
  const center = offsetLatLon(start.lat, start.lng, 0, -radiusMeters);
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const north = radiusMeters * Math.sin(angle);
    const east = radiusMeters * Math.cos(angle);
    points.push(offsetLatLon(center.lat, center.lng, north, east));
  }
  return points;
}

function randomLapSpeedFactor() {
  return 0.9 + Math.random() * 0.2; // 0.9x – 1.1x per lap
}

function randomGaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Handle incoming telemetry data
 * @param {Object} telemetry - Telemetry data object
 */
function handleTelemetryData(telemetry) {
  currentTelemetry = telemetry;
  const speedMps = estimateSpeedMps(telemetry);
  updateSpeedometer(speedMps);

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

function toggleLapSortMode() {
  lapSortState.mode = lapSortState.mode === 'lapNumber' ? 'bestTime' : 'lapNumber';
  updateLapSortButton();
  updateLapTimesTable();
}

function updateLapSortButton() {
  const btn = document.getElementById('lapSortToggleBtn');
  if (!btn) return;
  btn.textContent = lapSortState.mode === 'lapNumber' ? 'Sort: Lap #' : 'Sort: Fastest';
}

/**
 * Update the lap times table
 */
function updateLapTimesTable() {
  const tbody = document.getElementById('lapTimesBody');
  const laps = lapManager.getLaps().slice();

  if (laps.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="3">No laps recorded yet</td></tr>';
    return;
  }

  if (lapSortState.mode === 'bestTime') {
    laps.sort((a, b) => {
      if (a.finalTime === null) return 1;
      if (b.finalTime === null) return -1;
      return a.finalTime - b.finalTime;
    });
  } else {
    laps.sort((a, b) => a.lapNumber - b.lapNumber);
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

async function sendLoRaCommandFromInput() {
  const input = document.getElementById('commandInput');
  if (!input) return;
  const command = input.value.trim();
  if (!command) return;

  const entry = createCommandLogEntry(command);
  appendCommandLogEntry(entry, { skipRender: true });
  renderCommandLog();

  if (!isConnected) {
    entry.status = 'error';
    entry.detail = 'Connect to the LoRa receiver first';
    renderCommandLog();
    return;
  }

  try {
    if (!window.electronAPI?.sendLoRaCommand) {
      throw new Error('Command bridge unavailable');
    }
    await window.electronAPI.sendLoRaCommand({ command });
    entry.status = 'success';
    entry.detail = 'Sent';
    input.value = '';
  } catch (error) {
    entry.status = 'error';
    entry.detail = error?.message || 'Failed to send';
  }

  renderCommandLog();
}

function createCommandLogEntry(text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    text,
    status: 'pending',
    detail: ''
  };
}

function appendCommandLogEntry(entry, { skipRender = false } = {}) {
  commandLogState.entries.push(entry);
  if (commandLogState.entries.length > 50) {
    commandLogState.entries.shift();
  }
  if (!skipRender) {
    renderCommandLog();
  }
}

function clearCommandLog() {
  commandLogState.entries = [];
  renderCommandLog();
}

function renderCommandLog() {
  const container = document.getElementById('commandLog');
  if (!container) return;

  if (!commandLogState.entries.length) {
    container.innerHTML = '<div class="empty-state">No commands sent yet</div>';
    return;
  }

  container.innerHTML = '';
  commandLogState.entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry ${entry.status}`;

    const text = document.createElement('div');
    text.className = 'log-text';
    text.textContent = `[${formatCommandTimestamp(entry.timestamp)}] > ${entry.text}`;

    const status = document.createElement('div');
    status.className = 'log-status';
    status.textContent = entry.status === 'success'
      ? 'SENT'
      : entry.status === 'error'
        ? 'ERROR'
        : 'SENDING';
    if (entry.detail) {
      status.title = entry.detail;
    }

    row.appendChild(text);
    row.appendChild(status);
    container.appendChild(row);
  });
  container.scrollTop = container.scrollHeight;
}

function toggleConsoleVisibility(forceCollapsed) {
  const terminal = document.getElementById('mapTerminal');
  if (!terminal) return;

  const nextState = typeof forceCollapsed === 'boolean'
    ? forceCollapsed
    : !consoleState.collapsed;

  consoleState.collapsed = nextState;
  terminal.classList.toggle('collapsed', nextState);
  updateConsoleToggleState();
}

function updateConsoleToggleState() {
  const toggleBtn = document.getElementById('toggleConsoleBtn');
  if (toggleBtn) {
    toggleBtn.textContent = consoleState.collapsed ? 'Show Console' : 'Hide Console';
    toggleBtn.title = consoleState.collapsed ? 'Expand the LoRa console' : 'Hide the LoRa console';
    toggleBtn.setAttribute('aria-expanded', (!consoleState.collapsed).toString());
  }
}

function formatCommandTimestamp(date) {
  if (!(date instanceof Date)) {
    return new Date(date || Date.now()).toLocaleTimeString();
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

async function initializeRaceTimer() {
  updateRaceCountdownUI();

  if (!window?.electronAPI?.getRaceTimerState) {
    return;
  }

  try {
    const state = await window.electronAPI.getRaceTimerState();
    applyRaceTimerState(state);
  } catch (error) {
    console.error('Failed to load race timer state:', error);
    applyRaceTimerState(null);
  }

  if (window?.electronAPI?.onRaceTimerUpdate) {
    window.electronAPI.onRaceTimerUpdate((state) => {
      applyRaceTimerState(state);
    });
  }
}

function applyRaceTimerState(state) {
  if (raceTimerState.intervalId) {
    clearInterval(raceTimerState.intervalId);
    raceTimerState.intervalId = null;
  }

  raceTimerState.durationMs = state?.durationMs || FOUR_HOURS_MS;
  raceTimerState.startTimeMs = state?.startTimeMs || null;
  raceTimerState.adjustmentMs = Number.isFinite(state?.adjustmentMs) ? state.adjustmentMs : 0;

  if (raceTimerState.startTimeMs) {
    raceTimerState.intervalId = setInterval(() => {
      updateRaceCountdownUI();
    }, 1000);
  }

  updateRaceCountdownUI();
  updateRaceStartButton();
}

async function handleRaceStartRequest() {
  const remaining = getRaceTimerRemainingMs();
  if (raceTimerState.startTimeMs && remaining > 0) {
    const confirmRestart = confirm('Race clock is already running. Do you want to restart the 4-hour countdown?');
    if (!confirmRestart) {
      return;
    }
  }

  const payload = {
    startTimeMs: Date.now(),
    adjustmentMs: 0,
    durationMs: FOUR_HOURS_MS
  };

  if (!window?.electronAPI?.saveRaceTimerState) {
    applyRaceTimerState(payload);
    return;
  }

  try {
    const saved = await window.electronAPI.saveRaceTimerState(payload);
    applyRaceTimerState(saved || payload);
  } catch (error) {
    console.error('Failed to start race timer:', error);
    alert(`Failed to start race timer: ${error?.message || error}`);
  }
}

function getRaceTimerRemainingMs() {
  if (!raceTimerState.startTimeMs) {
    return raceTimerState.durationMs;
  }
  const elapsed = Date.now() - raceTimerState.startTimeMs;
  const adjusted = raceTimerState.durationMs - elapsed + (raceTimerState.adjustmentMs || 0);
  return Math.max(0, Math.floor(adjusted));
}

function updateRaceCountdownUI() {
  const valueEl = document.getElementById('raceCountdownValue');
  const statusEl = document.getElementById('raceTimerStatusText');
  if (!valueEl || !statusEl) {
    return;
  }

  const remaining = raceTimerState.startTimeMs ? getRaceTimerRemainingMs() : raceTimerState.durationMs;
  valueEl.textContent = formatRaceDuration(remaining);

  if (!raceTimerState.startTimeMs) {
    statusEl.textContent = 'Waiting to start';
  } else if (remaining > 0) {
    const adjustmentLabel = raceTimerState.adjustmentMs
      ? ` • Adj ${formatTimerAdjustment(raceTimerState.adjustmentMs)}`
      : '';
    statusEl.textContent = `Running${adjustmentLabel}`;
  } else {
    statusEl.textContent = 'Race complete';
    if (raceTimerState.intervalId) {
      clearInterval(raceTimerState.intervalId);
      raceTimerState.intervalId = null;
    }
  }
}

function updateRaceStartButton() {
  const btn = document.getElementById('startRaceTimerBtn');
  if (!btn) return;
  const running = !!raceTimerState.startTimeMs && getRaceTimerRemainingMs() > 0;
  btn.textContent = running ? 'Restart 4h Race Clock' : 'Start 4h Race';
  btn.title = running
    ? 'Restart the race clock from 4 hours'
    : 'Begin the 4-hour endurance countdown';
}

function formatRaceDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatTimerAdjustment(ms) {
  const sign = ms >= 0 ? '+' : '-';
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const parts = [];
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return `${sign}${parts.join(' ')}`;
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
  testBtn.disabled = !isConnected || testTransmitState.busy || simulationState.running;
  testBtn.title = testTransmitState.running
    ? 'Transmitting continuous test packets at 915 MHz. Click to stop.'
    : 'Send repeating 915 MHz test packets once connected.';
}

async function toggleTestTransmitMode() {
  if (!isConnected || simulationState.running) {
    alert(simulationState.running
      ? 'Stop the simulation before sending hardware test packets.'
      : 'Connect to a LoRa port before sending test packets.');
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
}

if (window?.electronAPI?.onConfigUpdated) {
  window.electronAPI.onConfigUpdated(handleConfigUpdated);
}

function handleConfigUpdated(config) {
  if (!config || typeof config !== 'object') {
    return;
  }

  if (config.uiTheme && config.uiTheme !== themeState.mode) {
    applyTheme(config.uiTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, config.uiTheme);
    } catch (error) {
      console.warn('Unable to cache theme preference:', error);
    }
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
