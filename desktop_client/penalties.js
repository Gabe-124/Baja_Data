/**
 * Penalties Manager
 * 
 * Manages penalty tracking for Baja vehicles during competition.
 * Stores penalties by car number and provides utilities for counting/displaying penalties.
 */

class PenaltiesManager {
  constructor() {
    // Store penalties: { carNumber: { category: [{ type, offense, penalty }] } }
    this.penalties = {};
    this.penaltyDefinitions = this.getDefaultPenalties();
  }

  /**
   * Get default penalty definitions from competition rules
   */
  getDefaultPenalties() {
    return {
      Fuel: [
        {
          id: 'fuel-possession',
          type: 'Fuel',
          infraction: 'Possession of fuel or fuel is removed from the fuel area after endurance gridding',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: '20 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-unchecked',
          type: 'Fuel',
          infraction: 'Unchecked fuel removed from fuel area during endurance',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: '20 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-track',
          type: 'Fuel',
          infraction: 'Fueling on the track',
          offenses: [
            { order: 1, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-tools',
          type: 'Fuel',
          infraction: 'Use of tools on the car in the fuel area',
          offenses: [
            { order: 1, penalty: 'Warning' },
            { order: 2, penalty: '10 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-people',
          type: 'Fuel',
          infraction: 'More than 3 people in the fuel area',
          offenses: [
            { order: 1, penalty: 'Warning' },
            { order: 2, penalty: '10 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-driver-car',
          type: 'Fuel',
          infraction: 'Fueling with the driver in the car',
          offenses: [
            { order: 1, penalty: '30 minutes' },
            { order: 2, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-extinguisher',
          type: 'Fuel',
          infraction: 'Fire extinguisher not ready during fueling',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: '20 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'fuel-ran-out',
          type: 'Fuel',
          infraction: 'Run out of fuel on the track',
          offenses: [
            { order: 1, penalty: '5 minutes' },
            { order: 2, penalty: '5 minutes' },
            { order: 3, penalty: '5 minutes' }
          ]
        },
        {
          id: 'fuel-container',
          type: 'Fuel',
          infraction: 'Use of oversized or modified fuel container',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: '20 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        }
      ],
      Driving: [
        {
          id: 'driving-rollover',
          type: 'Driving',
          infraction: 'Vehicle Roll Over',
          offenses: [
            { order: 1, penalty: '--' },
            { order: 2, penalty: 'Warning' },
            { order: 3, penalty: 'DQ' }
          ]
        },
        {
          id: 'driving-yellow-flag',
          type: 'Driving',
          infraction: 'Passing during a yellow flag',
          offenses: [
            { order: 1, penalty: 'Warning' },
            { order: 2, penalty: 'Discretionary' },
            { order: 3, penalty: 'Discretionary' }
          ]
        },
        {
          id: 'driving-black-flag',
          type: 'Driving',
          infraction: 'Failure to stop for black flag when signaled',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: 'Discretionary' },
            { order: 3, penalty: 'Discretionary' }
          ]
        },
        {
          id: 'driving-course',
          type: 'Driving',
          infraction: 'Leaving the course and advancing',
          offenses: [
            { order: 1, penalty: '5 minutes' },
            { order: 2, penalty: 'Discretionary' },
            { order: 3, penalty: 'Discretionary' }
          ]
        },
        {
          id: 'driving-aggressive',
          type: 'Driving',
          infraction: 'Aggressive driving',
          offenses: [
            { order: 1, penalty: '10 minutes' },
            { order: 2, penalty: 'DQ' }
          ]
        },
        {
          id: 'driving-speeding',
          type: 'Driving',
          infraction: 'Speeding in the pit or paddocks',
          offenses: [
            { order: 1, penalty: '5 minutes' },
            { order: 2, penalty: '20 minutes' },
            { order: 3, penalty: 'DQ' }
          ]
        }
      ]
    };
  }

  /**
   * Add a penalty to a car
   * @param {string} carNumber - Car number
   * @param {string} penaltyId - Penalty definition ID
   * @param {string} notes - Additional notes about the penalty
   */
  addPenalty(carNumber, penaltyId, notes = '') {
    if (!carNumber) throw new Error('Car number is required');
    if (!penaltyId) throw new Error('Penalty ID is required');

    // Find penalty definition
    let penaltyDef = null;
    for (const category of Object.values(this.penaltyDefinitions)) {
      penaltyDef = category.find(p => p.id === penaltyId);
      if (penaltyDef) break;
    }

    if (!penaltyDef) throw new Error(`Penalty ID '${penaltyId}' not found`);

    // Initialize car penalties if needed
    if (!this.penalties[carNumber]) {
      this.penalties[carNumber] = {};
    }

    // Initialize category if needed
    if (!this.penalties[carNumber][penaltyDef.type]) {
      this.penalties[carNumber][penaltyDef.type] = [];
    }

    // Add penalty
    const penalty = {
      id: penaltyId,
      infraction: penaltyDef.infraction,
      offense: this.penalties[carNumber][penaltyDef.type].filter(p => p.id === penaltyId).length + 1,
      penalty: this.getPenaltyForOffense(penaltyId, 
        this.penalties[carNumber][penaltyDef.type].filter(p => p.id === penaltyId).length + 1),
      timestamp: new Date().toISOString(),
      notes
    };

    this.penalties[carNumber][penaltyDef.type].push(penalty);

    return penalty;
  }

  /**
   * Remove a penalty from a car
   * @param {string} carNumber - Car number
   * @param {string} type - Penalty type (Fuel, Driving)
   * @param {number} index - Index in the penalties array
   */
  removePenalty(carNumber, type, index) {
    if (!this.penalties[carNumber] || !this.penalties[carNumber][type]) {
      return false;
    }

    if (index < 0 || index >= this.penalties[carNumber][type].length) {
      return false;
    }

    this.penalties[carNumber][type].splice(index, 1);
    return true;
  }

  /**
   * Get all penalties for a car
   * @param {string} carNumber - Car number
   */
  getPenaltiesForCar(carNumber) {
    return this.penalties[carNumber] || {};
  }

  /**
   * Get total penalties for a car (aggregated by type)
   * @param {string} carNumber - Car number
   */
  getPenaltyCount(carNumber) {
    const carPenalties = this.penalties[carNumber] || {};
    const counts = {};

    for (const [type, penalties] of Object.entries(carPenalties)) {
      counts[type] = penalties.length;
    }

    return counts;
  }

  /**
   * Get time penalties for a car (sum of numeric penalties)
   * @param {string} carNumber - Car number
   */
  getTotalTimePenalty(carNumber) {
    const carPenalties = this.penalties[carNumber] || {};
    let totalMinutes = 0;
    let hasDQ = false;

    for (const penalties of Object.values(carPenalties)) {
      penalties.forEach(p => {
        if (p.penalty === 'DQ') {
          hasDQ = true;
        } else if (p.penalty && p.penalty.endsWith('minutes')) {
          const minutes = parseInt(p.penalty);
          if (!isNaN(minutes)) {
            totalMinutes += minutes;
          }
        }
      });
    }

    return { totalMinutes, hasDQ };
  }

  /**
   * Get the penalty string for a specific offense
   * @param {string} penaltyId - Penalty definition ID
   * @param {number} offenseNumber - Offense count (1, 2, 3)
   */
  getPenaltyForOffense(penaltyId, offenseNumber) {
    for (const category of Object.values(this.penaltyDefinitions)) {
      const penaltyDef = category.find(p => p.id === penaltyId);
      if (penaltyDef) {
        const offense = penaltyDef.offenses.find(o => o.order === offenseNumber);
        return offense ? offense.penalty : penaltyDef.offenses[penaltyDef.offenses.length - 1].penalty;
      }
    }
    return null;
  }

  /**
   * Get penalty definition by ID
   * @param {string} penaltyId - Penalty definition ID
   */
  getPenaltyDefinition(penaltyId) {
    for (const category of Object.values(this.penaltyDefinitions)) {
      const penaltyDef = category.find(p => p.id === penaltyId);
      if (penaltyDef) return penaltyDef;
    }
    return null;
  }

  /**
   * Get all car numbers that have penalties
   */
  getAllCarsWithPenalties() {
    return Object.keys(this.penalties);
  }

  /**
   * Clear all penalties for a car
   * @param {string} carNumber - Car number
   */
  clearPenaltiesForCar(carNumber) {
    delete this.penalties[carNumber];
  }

  /**
   * Clear all penalties
   */
  clearAllPenalties() {
    this.penalties = {};
  }

  /**
   * Export penalties as JSON
   */
  exportJSON() {
    return JSON.stringify(this.penalties, null, 2);
  }

  /**
   * Import penalties from JSON
   */
  importJSON(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.penalties = imported;
      return true;
    } catch (error) {
      console.error('Failed to import penalties:', error);
      return false;
    }
  }
}

module.exports = PenaltiesManager;
