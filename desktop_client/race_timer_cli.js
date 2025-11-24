#!/usr/bin/env node

const {
  adjustRaceTimerState,
  readRaceTimerState,
  resolveBaseDir
} = require('./race_timer_store');

const args = process.argv.slice(2);

function printUsage() {
  console.log(`\nUsage: npm run adjust-race-timer -- [options]\n\nOptions:\n  --minutes, -m <value>       Minutes to add (negative to subtract)\n  --seconds, -s <value>       Seconds to add (negative to subtract)\n  --hours,   -H <value>       Hours to add (negative to subtract)\n  --milliseconds, --ms <value> Raw millisecond offset\n  --data-dir <path>           Override the Electron userData directory\n  --status                    Print the current race clock state after applying changes\n  --help                      Show this help message\n\nExamples:\n  npm run adjust-race-timer -- --minutes -2\n  npm run adjust-race-timer -- --seconds 30 --status\n`);
}

function requireValue(label, value) {
  if (value === undefined) {
    console.error(`Missing value for ${label}`);
    printUsage();
    process.exit(1);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    console.error(`Invalid numeric value for ${label}: ${value}`);
    process.exit(1);
  }
  return numeric;
}

let offsetMs = 0;
let baseDirOverride = null;
let shouldPrintStatus = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  switch (arg) {
    case '--minutes':
    case '-m': {
      const minutes = requireValue(arg, args[++i]);
      offsetMs += minutes * 60_000;
      break;
    }
    case '--seconds':
    case '-s': {
      const seconds = requireValue(arg, args[++i]);
      offsetMs += seconds * 1000;
      break;
    }
    case '--hours':
    case '-H': {
      const hours = requireValue(arg, args[++i]);
      offsetMs += hours * 3_600_000;
      break;
    }
    case '--milliseconds':
    case '--ms': {
      const raw = requireValue(arg, args[++i]);
      offsetMs += raw;
      break;
    }
    case '--data-dir': {
      const dir = args[++i];
      if (!dir) {
        console.error('Missing value for --data-dir');
        process.exit(1);
      }
      baseDirOverride = dir;
      break;
    }
    case '--status':
      shouldPrintStatus = true;
      break;
    case '--help':
    case '-h':
      printUsage();
      process.exit(0);
      break;
    default:
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
  }
}

const baseDir = baseDirOverride || resolveBaseDir();

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function computeRemaining(state) {
  if (!state.startTimeMs) {
    return state.durationMs;
  }
  const elapsed = Date.now() - state.startTimeMs;
  const adjusted = state.durationMs - elapsed + (state.adjustmentMs || 0);
  return Math.max(0, Math.floor(adjusted));
}

function formatAdjustment(ms) {
  const sign = ms >= 0 ? '+' : '-';
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const parts = [];
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return `${sign}${parts.join(' ')}`;
}

function printStatus(state) {
  const remaining = computeRemaining(state);
  console.log(`Race clock: ${formatDuration(remaining)}`);
  if (state.startTimeMs) {
    console.log(`Started at: ${new Date(state.startTimeMs).toLocaleTimeString()}`);
  } else {
    console.log('Race clock has not been started yet.');
  }
  if (state.adjustmentMs) {
    console.log(`Cumulative adjustment: ${formatAdjustment(state.adjustmentMs)}`);
  }
}

if (offsetMs === 0 && !shouldPrintStatus) {
  console.error('No adjustment supplied. Provide --minutes/--seconds/--hours or use --status.');
  printUsage();
  process.exit(1);
}

let updatedState = readRaceTimerState({ baseDir });

if (offsetMs !== 0) {
  try {
    updatedState = adjustRaceTimerState(offsetMs, { baseDir });
    const remaining = computeRemaining(updatedState);
    console.log(`Applied ${formatAdjustment(offsetMs)}. New remaining time: ${formatDuration(remaining)}.`);
  } catch (error) {
    console.error(`Failed to adjust race timer: ${error?.message || error}`);
    process.exit(1);
  }
}

if (shouldPrintStatus) {
  printStatus(updatedState);
}
