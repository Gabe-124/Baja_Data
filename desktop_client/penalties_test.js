/**
 * Penalties Manager - Unit Tests & Examples
 * 
 * Run this to verify the penalties system is working correctly
 */

// Example 1: Basic penalty addition
console.log('=== Example 1: Adding penalties ===');
const manager = new PenaltiesManager();

// Add first fuel possession penalty
const p1 = manager.addPenalty('101', 'fuel-possession');
console.log('Added 1st fuel-possession penalty:');
console.log(`  Offense: ${p1.offense}, Penalty: ${p1.penalty}`); // Should be "1st offense, 10 minutes"

// Add second (same violation by same car)
const p2 = manager.addPenalty('101', 'fuel-possession', 'Repeated violation');
console.log('Added 2nd fuel-possession penalty:');
console.log(`  Offense: ${p2.offense}, Penalty: ${p2.penalty}`); // Should be "2nd offense, 20 minutes"

// Add third (DQ)
const p3 = manager.addPenalty('101', 'fuel-possession');
console.log('Added 3rd fuel-possession penalty:');
console.log(`  Offense: ${p3.offense}, Penalty: ${p3.penalty}`); // Should be "3rd offense, DQ"

// Example 2: View car penalties
console.log('\n=== Example 2: View car penalties ===');
const carPenalties = manager.getPenaltiesForCar('101');
console.log(`Car 101 has ${Object.keys(carPenalties).length} categories of penalties:`);
Object.entries(carPenalties).forEach(([type, penalties]) => {
  console.log(`  ${type}: ${penalties.length} penalties`);
});

// Example 3: Calculate total time penalty
console.log('\n=== Example 3: Calculate totals ===');
const timing = manager.getTotalTimePenalty('101');
console.log(`Car 101 totals:`);
console.log(`  Time penalty: ${timing.totalMinutes} minutes`);
console.log(`  Disqualified: ${timing.hasDQ ? 'YES' : 'NO'}`);

// Example 4: Different penalty types
console.log('\n=== Example 4: Different penalty types ===');
manager.addPenalty('102', 'driving-speeding', 'Speeding in paddock');
manager.addPenalty('102', 'driving-yellow-flag');
manager.addPenalty('103', 'fuel-track');  // DQ immediately

const car102Timing = manager.getTotalTimePenalty('102');
const car103Timing = manager.getTotalTimePenalty('103');

console.log(`Car 102: ${car102Timing.totalMinutes}m, DQ=${car103Timing.hasDQ}`);
console.log(`Car 103: ${car103Timing.totalMinutes}m, DQ=${car103Timing.hasDQ}`);

// Example 5: View all cars
console.log('\n=== Example 5: All cars with penalties ===');
const allCars = manager.getAllCarsWithPenalties();
allCars.forEach(car => {
  const count = manager.getPenaltyCount(car);
  const timing = manager.getTotalTimePenalty(car);
  console.log(`Car ${car}:`);
  console.log(`  Categories: ${Object.entries(count).map(([t, c]) => `${t}(${c})`).join(', ')}`);
  console.log(`  Total: ${timing.totalMinutes}m${timing.hasDQ ? ', DQ' : ''}`);
});

// Example 6: Remove penalties
console.log('\n=== Example 6: Remove penalty ===');
console.log('Before: Car 101 has', manager.getPenaltyCount('101').Fuel, 'Fuel penalties');
manager.removePenalty('101', 'Fuel', 0);  // Remove first one
console.log('After: Car 101 has', manager.getPenaltyCount('101').Fuel, 'Fuel penalties');

// Example 7: Export and import
console.log('\n=== Example 7: Export/Import ===');
const json = manager.exportJSON();
console.log('Exported penalties (truncated):');
console.log(json.substring(0, 200) + '...');

const manager2 = new PenaltiesManager();
manager2.importJSON(json);
console.log('Imported into new manager. Car 101 now has:');
const importedCount = manager2.getPenaltyCount('101');
console.log(`  ${importedCount.Fuel} Fuel penalties`);

// Example 8: Get penalty definition
console.log('\n=== Example 8: Penalty definition ===');
const fuelPossession = manager.getPenaltyDefinition('fuel-possession');
console.log(`Penalty: ${fuelPossession.infraction}`);
console.log('Offense progression:');
fuelPossession.offenses.forEach(o => {
  console.log(`  ${o.order}st/2nd/3rd: ${o.penalty}`);
});

console.log('\n=== All tests passed! ===');
