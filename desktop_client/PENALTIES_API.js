/**
 * PenaltiesManager - Complete API Reference
 * 
 * All methods available for managing Baja competition penalties
 */

// ============================================================================
// CONSTRUCTOR & INITIALIZATION
// ============================================================================

/**
 * Create a new penalties manager instance
 * 
 * @returns {PenaltiesManager} A new manager instance
 * 
 * @example
 * const manager = new PenaltiesManager();
 */
const manager = new PenaltiesManager();

// ============================================================================
// ADDING & REMOVING PENALTIES
// ============================================================================

/**
 * Add a penalty to a car
 * 
 * @param {string} carNumber - Car number (e.g., '101', '42', 'CAR-5')
 * @param {string} penaltyId - Penalty definition ID (see PENALTY IDS below)
 * @param {string} notes - Optional additional notes
 * @returns {Object} The penalty object that was added
 * @throws {Error} If car number or penalty ID is invalid
 * 
 * @example
 * const penalty = manager.addPenalty('101', 'fuel-possession', 'Fuel found outside pit area');
 * console.log(penalty.penalty); // "10 minutes" (1st offense)
 * 
 * manager.addPenalty('101', 'fuel-possession');
 * manager.addPenalty('101', 'fuel-possession');
 * // 3rd penalty will automatically return "DQ"
 */

/**
 * Remove a specific penalty from a car
 * 
 * @param {string} carNumber - Car number
 * @param {string} type - Penalty type ('Fuel' or 'Driving')
 * @param {number} index - Position in the penalties array (0-based)
 * @returns {boolean} True if removed, false if not found
 * 
 * @example
 * // Remove the first fuel penalty from car 101
 * manager.removePenalty('101', 'Fuel', 0);
 * 
 * // Remove the second driving penalty
 * manager.removePenalty('101', 'Driving', 1);
 */

/**
 * Clear all penalties for a specific car
 * 
 * @param {string} carNumber - Car number to clear
 * @returns {void}
 * 
 * @example
 * manager.clearPenaltiesForCar('101');
 */

/**
 * Clear all penalties from all cars
 * 
 * @returns {void}
 * 
 * @example
 * manager.clearAllPenalties();
 */

// ============================================================================
// QUERYING PENALTIES
// ============================================================================

/**
 * Get all penalties for a specific car
 * 
 * @param {string} carNumber - Car number
 * @returns {Object} Penalties organized by type
 *   Structure: { "Fuel": [...], "Driving": [...] }
 * 
 * @example
 * const penalties = manager.getPenaltiesForCar('101');
 * // {
 * //   "Fuel": [
 * //     {
 * //       id: 'fuel-possession',
 * //       infraction: 'Possession of fuel...',
 * //       offense: 1,
 * //       penalty: '10 minutes',
 * //       timestamp: '2025-11-14T12:34:56Z',
 * //       notes: 'Fuel found outside pit area'
 * //     }
 * //   ],
 * //   "Driving": [...]
 * // }
 */

/**
 * Get count of penalties by type for a car
 * 
 * @param {string} carNumber - Car number
 * @returns {Object} Count of penalties per type
 * 
 * @example
 * const counts = manager.getPenaltyCount('101');
 * // { "Fuel": 2, "Driving": 1 }
 * console.log(counts.Fuel); // 2
 */

/**
 * Calculate total time penalty for a car
 * 
 * @param {string} carNumber - Car number
 * @returns {Object} With properties:
 *   - totalMinutes {number} - Sum of all numeric penalties
 *   - hasDQ {boolean} - True if any penalty is DQ
 * 
 * @example
 * const timing = manager.getTotalTimePenalty('101');
 * // { totalMinutes: 35, hasDQ: false }
 * 
 * if (timing.hasDQ) {
 *   console.log('Car disqualified');
 * } else {
 *   console.log(`${timing.totalMinutes} minute penalty`);
 * }
 */

/**
 * Get list of all cars that have any penalties
 * 
 * @returns {Array<string>} Array of car numbers
 * 
 * @example
 * const cars = manager.getAllCarsWithPenalties();
 * // ['101', '102', '105', '107']
 * 
 * cars.forEach(car => {
 *   const timing = manager.getTotalTimePenalty(car);
 *   console.log(`Car ${car}: ${timing.totalMinutes}m`);
 * });
 */

// ============================================================================
// PENALTY DEFINITIONS
// ============================================================================

/**
 * Get penalty definition by ID
 * 
 * @param {string} penaltyId - Penalty definition ID
 * @returns {Object|null} Penalty definition or null if not found
 * 
 * @example
 * const def = manager.getPenaltyDefinition('fuel-possession');
 * // {
 * //   id: 'fuel-possession',
 * //   type: 'Fuel',
 * //   infraction: 'Possession of fuel or fuel is removed...',
 * //   offenses: [
 * //     { order: 1, penalty: '10 minutes' },
 * //     { order: 2, penalty: '20 minutes' },
 * //     { order: 3, penalty: 'DQ' }
 * //   ]
 * // }
 */

/**
 * Get the penalty string for a specific offense number
 * 
 * @param {string} penaltyId - Penalty definition ID
 * @param {number} offenseNumber - Offense count (1, 2, 3, etc.)
 * @returns {string|null} Penalty string (e.g., "10 minutes", "DQ")
 * 
 * @example
 * const p1 = manager.getPenaltyForOffense('fuel-possession', 1);
 * // "10 minutes"
 * 
 * const p2 = manager.getPenaltyForOffense('fuel-possession', 2);
 * // "20 minutes"
 * 
 * const p3 = manager.getPenaltyForOffense('fuel-possession', 3);
 * // "DQ"
 */

/**
 * Access all penalty definitions
 * 
 * @returns {Object} All penalty definitions by category
 * 
 * @example
 * const defs = manager.penaltyDefinitions;
 * // {
 * //   "Fuel": [
 * //     { id: 'fuel-possession', ... },
 * //     { id: 'fuel-unchecked', ... },
 * //     ...
 * //   ],
 * //   "Driving": [
 * //     { id: 'driving-rollover', ... },
 * //     ...
 * //   ]
 * // }
 * 
 * // List all fuel infractions
 * manager.penaltyDefinitions.Fuel.forEach(def => {
 *   console.log(def.infraction);
 * });
 */

// ============================================================================
// IMPORT / EXPORT
// ============================================================================

/**
 * Export all penalties as JSON string
 * 
 * @returns {string} JSON string of penalties object
 * 
 * @example
 * const json = manager.exportJSON();
 * // Save to file
 * const blob = new Blob([json], { type: 'application/json' });
 * 
 * // Or send to server
 * fetch('/api/penalties', { method: 'POST', body: json });
 */

/**
 * Import penalties from JSON string
 * 
 * @param {string} jsonString - JSON string of penalties
 * @returns {boolean} True if successful, false if parse error
 * 
 * @example
 * const json = loadPenaltiesFromFile();
 * const success = manager.importJSON(json);
 * if (!success) {
 *   console.error('Failed to import penalties');
 * }
 */

// ============================================================================
// PENALTY IDS (Use these for addPenalty() method)
// ============================================================================

/**
 * FUEL PENALTIES
 */
const FUEL_PENALTIES = [
  'fuel-possession',      // Fuel outside fuel area
  'fuel-unchecked',       // Unchecked fuel removal
  'fuel-track',           // Fueling on track (DQ)
  'fuel-tools',           // Tools used in fuel area
  'fuel-people',          // Too many in fuel area
  'fuel-driver-car',      // Driver in car while fueling
  'fuel-extinguisher',    // Fire extinguisher not ready
  'fuel-ran-out',         // Ran out of fuel on track
  'fuel-container'        // Oversized/modified container
];

/**
 * DRIVING PENALTIES
 */
const DRIVING_PENALTIES = [
  'driving-rollover',     // Vehicle roll over
  'driving-yellow-flag',  // Passing during yellow
  'driving-black-flag',   // Failure to stop for black flag
  'driving-course',       // Leaving course and advancing
  'driving-aggressive',   // Aggressive driving (DQ)
  'driving-speeding'      // Speeding in pit/paddocks
];

// ============================================================================
// PENALTY OFFENSE PROGRESSION
// ============================================================================

/**
 * Example: How penalties escalate with repeated offenses
 */

// First offense
manager.addPenalty('101', 'fuel-possession');
// Penalty: "10 minutes"

// Second offense (same violation)
manager.addPenalty('101', 'fuel-possession');
// Penalty: "20 minutes"

// Third offense (same violation)
manager.addPenalty('101', 'fuel-possession');
// Penalty: "DQ" (Disqualified)

/**
 * Total penalty for car 101:
 * 10 + 20 = 30 minutes (before 3rd offense DQ)
 * Once DQ applied: Status = DISQUALIFIED
 */

// ============================================================================
// SPECIAL CASES
// ============================================================================

/**
 * Immediate disqualifications (single offense = DQ)
 */
// - 'fuel-track' (Fueling on track)
// - 'driving-aggressive' (if first offense triggers DQ)

/**
 * Discretionary penalties (judge's call)
 */
// - 'driving-yellow-flag' (2nd offense: Discretionary)
// - 'driving-black-flag' (2nd/3rd: Discretionary)
// - 'driving-course' (2nd/3rd: Discretionary)

/**
 * Warnings (no time penalty)
 */
// - 'fuel-tools' (1st offense: Warning)
// - 'fuel-people' (1st offense: Warning)
// - 'driving-yellow-flag' (1st offense: Warning)
// - 'driving-rollover' (2nd offense: Warning)

/**
 * Example: Handling discretionary/warning penalties
 */
manager.addPenalty('102', 'driving-yellow-flag');
const timing102 = manager.getTotalTimePenalty('102');
console.log(timing102.totalMinutes); // 0 (warning = no time)

manager.addPenalty('102', 'driving-yellow-flag');
const timing102_2 = manager.getTotalTimePenalty('102');
console.log(timing102_2.totalMinutes); // 0 (discretionary = manual review)

// ============================================================================
// COMPLETE EXAMPLE WORKFLOW
// ============================================================================

/**
 * Complete race penalty tracking example
 */
function raceExample() {
  const mgr = new PenaltiesManager();
  
  // Car 101: Multiple infractions
  mgr.addPenalty('101', 'fuel-possession', 'Fuel canister in pits');
  mgr.addPenalty('101', 'driving-speeding', 'Excessive pit speed');
  mgr.addPenalty('101', 'driving-speeding', 'Repeated speeding');
  // Result: 5 + 20 = 25 minutes + 10 minutes fuel = 35 total
  
  // Car 102: Immediate DQ
  mgr.addPenalty('102', 'fuel-track', 'Fueling on track');
  // Result: DQ
  
  // Car 105: Multiple infractions including DQ
  mgr.addPenalty('105', 'driving-aggressive', 'Dangerous driving');
  mgr.addPenalty('105', 'fuel-possession');
  mgr.addPenalty('105', 'fuel-possession');
  mgr.addPenalty('105', 'fuel-possession'); // 3rd = DQ
  // Result: 10 + 10 + 20 + DQ = DQ (disqualified)
  
  // View summary
  const allCars = mgr.getAllCarsWithPenalties();
  allCars.forEach(car => {
    const timing = mgr.getTotalTimePenalty(car);
    const status = timing.hasDQ ? 'DISQUALIFIED' : `${timing.totalMinutes}m`;
    console.log(`Car ${car}: ${status}`);
  });
  
  // Export official record
  const json = mgr.exportJSON();
  saveToFile('penalties.json', json);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Examples of error cases
 */

// Invalid car number
try {
  manager.addPenalty('', 'fuel-possession');
  // Throws: Error: Car number is required
} catch (e) {
  console.error(e.message);
}

// Invalid penalty ID
try {
  manager.addPenalty('101', 'invalid-penalty-id');
  // Throws: Error: Penalty ID 'invalid-penalty-id' not found
} catch (e) {
  console.error(e.message);
}

// Invalid JSON import
const success = manager.importJSON('not valid json {');
// Returns: false (logged to console)

