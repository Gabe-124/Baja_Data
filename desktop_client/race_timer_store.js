const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_FRIENDLY_NAME = 'baja-telemetry-client';
const FILE_NAME = 'race-timer.json';
const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_STATE = {
  durationMs: DEFAULT_DURATION_MS,
  startTimeMs: null,
  adjustmentMs: 0,
  lastUpdated: null
};

function resolveBaseDir(explicitBaseDir) {
  if (explicitBaseDir) {
    return explicitBaseDir;
  }

  if (process.env.BAJA_RACE_TIMER_DIR) {
    return process.env.BAJA_RACE_TIMER_DIR;
  }

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_FRIENDLY_NAME);
  }
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(roaming, APP_FRIENDLY_NAME);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(configHome, APP_FRIENDLY_NAME);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRaceTimerFilePath(options = {}) {
  const baseDir = resolveBaseDir(options.baseDir);
  ensureDir(baseDir);
  return path.join(baseDir, FILE_NAME);
}

function readRaceTimerState(options = {}) {
  const filePath = getRaceTimerFilePath(options);
  if (!fs.existsSync(filePath)) {
    const seeded = { ...DEFAULT_STATE };
    fs.writeFileSync(filePath, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...DEFAULT_STATE,
      ...raw,
      durationMs: raw?.durationMs || DEFAULT_DURATION_MS,
      adjustmentMs: Number.isFinite(raw?.adjustmentMs) ? raw.adjustmentMs : 0
    };
  } catch (error) {
    console.warn('Failed to parse race timer state, resetting to defaults:', error);
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
    return { ...DEFAULT_STATE };
  }
}

function writeRaceTimerState(patch = {}, options = {}) {
  const current = readRaceTimerState(options);
  const next = {
    ...current,
    ...patch,
    durationMs: patch?.durationMs || current.durationMs || DEFAULT_DURATION_MS,
    adjustmentMs: Number.isFinite(patch?.adjustmentMs) ? patch.adjustmentMs : current.adjustmentMs,
    lastUpdated: Date.now()
  };

  const filePath = getRaceTimerFilePath(options);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function adjustRaceTimerState(deltaMs = 0, options = {}) {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    throw new Error('Adjustment must be a non-zero finite number of milliseconds');
  }
  const current = readRaceTimerState(options);
  const next = writeRaceTimerState({
    adjustmentMs: (current.adjustmentMs || 0) + deltaMs
  }, options);
  return next;
}

module.exports = {
  APP_FRIENDLY_NAME,
  FILE_NAME,
  DEFAULT_DURATION_MS,
  DEFAULT_STATE,
  resolveBaseDir,
  getRaceTimerFilePath,
  readRaceTimerState,
  writeRaceTimerState,
  adjustRaceTimerState
};
