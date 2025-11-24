/**
 * Lap Manager Module
 * 
 * Handles lap detection, timing, and delta calculation.
 * Detects when the car crosses a start/finish line and records lap times.
 */

class LapManager {
  constructor() {
    // Configuration for start/finish line (geofence)
    this.startFinishLine = {
      lat: null,
      lon: null,
      radius: 10 // meters - distance threshold for crossing detection
    };

    // Lap tracking state
    this.laps = [];
    this.currentLap = null;
    this.lastPosition = null;
    this.crossedStartLine = false;

    // Best lap tracking
    this.bestLapTime = null;
    this.bestLapIndex = null;

    // Callbacks for UI updates
    this.onLapComplete = null;
    this.onCurrentTimeUpdate = null;
  }

  /**
   * Set the start/finish line location
   * @param {number} lat - Latitude of start/finish line
   * @param {number} lon - Longitude of start/finish line
   * @param {number} radius - Detection radius in meters (default: 10)
   */
  setStartFinishLine(lat, lon, radius = 10) {
    this.startFinishLine = { lat, lon, radius };
    console.log(`Start/finish line set at: ${lat}, ${lon} (${radius}m radius)`);
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * @param {number} lat1 - First point latitude
   * @param {number} lon1 - First point longitude
   * @param {number} lat2 - Second point latitude
   * @param {number} lon2 - Second point longitude
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Check if a position is within the start/finish line geofence
   * @param {number} lat - Position latitude
   * @param {number} lon - Position longitude
   * @returns {boolean} True if within geofence
   */
  isAtStartFinish(lat, lon) {
    if (!this.startFinishLine.lat || !this.startFinishLine.lon) {
      return false;
    }

    const distance = this.calculateDistance(
      lat, lon,
      this.startFinishLine.lat,
      this.startFinishLine.lon
    );

    return distance <= this.startFinishLine.radius;
  }

  /**
   * Process a new GPS position and update lap timing
   * @param {Object} telemetry - Telemetry object with lat, lon, timestamp
   */
  processPosition(telemetry) {
    const { latitude, longitude, timestamp } = telemetry;
    const now = new Date(timestamp).getTime();

    // Calculate incremental distance from last fix
    let segmentDistance = 0;
    if (this.lastPosition && this.lastPosition.latitude !== undefined && this.lastPosition.longitude !== undefined) {
      segmentDistance = this.calculateDistance(
        this.lastPosition.latitude,
        this.lastPosition.longitude,
        latitude,
        longitude
      );
    }

    // Check if we're at the start/finish line
    const atStartFinish = this.isAtStartFinish(latitude, longitude);

    // Detect crossing of start/finish line (entering the geofence)
    if (atStartFinish && !this.crossedStartLine) {
      this.crossedStartLine = true;

      // If there's a current lap, complete it
      if (this.currentLap) {
        this.completeLap(now);
      }

      // Start a new lap
      this.startLap(now);

    } else if (!atStartFinish && this.crossedStartLine) {
      // Mark that we've left the start/finish area
      this.crossedStartLine = false;
    }

    // Update current lap time if a lap is in progress
    if (this.currentLap) {
      const elapsed = now - this.currentLap.startTime;
      this.currentLap.currentTime = elapsed;
      this.currentLap.distanceTraveled += segmentDistance;

      // Record lap samples for delta computation
      if (this.currentLap.samples && this.currentLap.samples.length === 0) {
        this.currentLap.samples.push({ elapsed: 0, distance: 0 });
      }
      if (segmentDistance > 0 || !this.currentLap.samples.length) {
        this.currentLap.samples.push({ elapsed, distance: this.currentLap.distanceTraveled });
      }

      // Trigger UI update callback
      if (this.onCurrentTimeUpdate) {
        this.onCurrentTimeUpdate(elapsed, this.getCurrentDelta());
      }
    }

    this.lastPosition = { latitude, longitude, timestamp };
  }

  /**
   * Start a new lap
   * @param {number} startTime - Timestamp in milliseconds
   */
  startLap(startTime) {
    this.currentLap = {
      lapNumber: this.laps.length + 1,
      startTime: startTime,
      currentTime: 0,
      endTime: null,
      finalTime: null,
      distanceTraveled: 0,
      samples: [{ elapsed: 0, distance: 0 }]
    };

    console.log(`Started lap ${this.currentLap.lapNumber}`);
  }

  /**
   * Complete the current lap
   * @param {number} endTime - Timestamp in milliseconds
   */
  completeLap(endTime) {
    if (!this.currentLap) return;

    const lapTime = endTime - this.currentLap.startTime;
    this.currentLap.endTime = endTime;
    this.currentLap.finalTime = lapTime;
    if (!this.currentLap.samples || this.currentLap.samples.length === 0) {
      this.currentLap.samples = [{ elapsed: lapTime, distance: this.currentLap.distanceTraveled }];
    } else {
      const lastSample = this.currentLap.samples[this.currentLap.samples.length - 1];
      if (!lastSample || lastSample.distance !== this.currentLap.distanceTraveled) {
        this.currentLap.samples.push({ elapsed: lapTime, distance: this.currentLap.distanceTraveled });
      }
    }

    // Add to laps array
    this.laps.push({ ...this.currentLap });

    // Update best lap if this is faster
    if (this.bestLapTime === null || lapTime < this.bestLapTime) {
      this.bestLapTime = lapTime;
      this.bestLapIndex = this.laps.length - 1;
    }

    console.log(`Completed lap ${this.currentLap.lapNumber}: ${this.formatTime(lapTime)}`);

    // Trigger callback for UI update
    if (this.onLapComplete) {
      this.onLapComplete(this.currentLap, this.bestLapTime, this.bestLapIndex);
    }
  }

  /**
   * Calculate delta to best lap
   * @returns {number|null} Delta in milliseconds (positive = slower, negative = faster)
   */
  getCurrentDelta() {
    if (!this.currentLap || this.bestLapTime === null) {
      return null;
    }

    const bestLap = this.getBestLap();
    if (!bestLap || !Array.isArray(bestLap.samples) || bestLap.samples.length < 2) {
      return this.currentLap.currentTime - this.bestLapTime;
    }

    const currentDistance = this.currentLap.distanceTraveled || 0;
    const totalDistance = bestLap.distanceTraveled || bestLap.samples[bestLap.samples.length - 1].distance || 0;
    if (totalDistance <= 0) {
      return this.currentLap.currentTime - this.bestLapTime;
    }

    const targetTime = this._estimateLapTimeAtDistance(bestLap.samples, currentDistance, totalDistance);
    if (targetTime === null) {
      return this.currentLap.currentTime - this.bestLapTime;
    }
    return this.currentLap.currentTime - targetTime;
  }

  _estimateLapTimeAtDistance(samples, distance, totalDistance) {
    if (!Array.isArray(samples) || samples.length === 0) {
      return null;
    }

    if (distance >= totalDistance) {
      const last = samples[samples.length - 1];
      return last?.elapsed ?? null;
    }

    let prev = samples[0];
    for (let i = 1; i < samples.length; i++) {
      const curr = samples[i];
      if (curr.distance >= distance) {
        const span = curr.distance - prev.distance;
        const ratio = span > 0 ? (distance - prev.distance) / span : 0;
        return prev.elapsed + (curr.elapsed - prev.elapsed) * ratio;
      }
      prev = curr;
    }

    const last = samples[samples.length - 1];
    return last?.elapsed ?? null;
  }

  /**
   * Format time in milliseconds to MM:SS.mmm
   * @param {number} ms - Time in milliseconds
   * @returns {string} Formatted time string
   */
  formatTime(ms) {
    if (ms === null || ms === undefined) return '--';

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Format delta time with +/- sign
   * @param {number} delta - Delta in milliseconds
   * @returns {string} Formatted delta string
   */
  formatDelta(delta) {
    if (delta === null || delta === undefined) return '--';

    const sign = delta >= 0 ? '+' : '';
    const seconds = (delta / 1000).toFixed(3);
    return `${sign}${seconds}s`;
  }

  /**
   * Get all recorded laps
   * @returns {Array} Array of lap objects
   */
  getLaps() {
    return this.laps;
  }

  /**
   * Get the best lap
   * @returns {Object|null} Best lap object or null
   */
  getBestLap() {
    if (this.bestLapIndex === null) return null;
    return this.laps[this.bestLapIndex];
  }

  /**
   * Clear all lap data
   */
  clearLaps() {
    this.laps = [];
    this.currentLap = null;
    this.bestLapTime = null;
    this.bestLapIndex = null;
    this.crossedStartLine = false;
    console.log('All laps cleared');
  }

  /**
   * Export lap data as JSON
   * @returns {string} JSON string of lap data
   */
  exportLaps() {
    return JSON.stringify({
      laps: this.laps,
      bestLap: this.getBestLap(),
      exportTime: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Import lap data from JSON
   * @param {string} jsonString - JSON string to import
   */
  importLaps(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.laps = data.laps || [];

      // Recalculate best lap
      this.bestLapTime = null;
      this.bestLapIndex = null;
      this.laps.forEach((lap, index) => {
        if (!lap.samples) {
          lap.samples = [];
        }
        lap.distanceTraveled = lap.distanceTraveled || (lap.samples.length ? lap.samples[lap.samples.length - 1].distance : 0);
        if (this.bestLapTime === null || lap.finalTime < this.bestLapTime) {
          this.bestLapTime = lap.finalTime;
          this.bestLapIndex = index;
        }
      });

      console.log(`Imported ${this.laps.length} laps`);
    } catch (error) {
      console.error('Failed to import laps:', error);
    }
  }
}
