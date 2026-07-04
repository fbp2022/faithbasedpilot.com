/**
 * Off-device sanity checks for the pure WHOOP logic. Run with:
 *   node --experimental-strip-types scripts/verify-whoop.ts
 * Not part of the app bundle.
 */
import { crc8, crc16Modbus, crc32 } from '../lib/whoop-protocol.ts';
import {
  parseCsv,
  parseCyclesCsv,
  parseSleepsCsv,
  parseWorkoutsCsv,
  parseWhoopTs,
} from '../lib/whoop-import.ts';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const CHECK = new TextEncoder().encode('123456789');

console.log('CRC vectors (input "123456789"):');
check('CRC-8/0x07 == 0xF4', crc8(CHECK) === 0xf4, crc8(CHECK).toString(16));
check('CRC-16/MODBUS == 0x4B37', crc16Modbus(CHECK) === 0x4b37, crc16Modbus(CHECK).toString(16));
check('CRC-32 == 0xCBF43926', crc32(CHECK) === 0xcbf43926, crc32(CHECK).toString(16));

console.log('\nCSV parser:');
const quoted = 'a,b,c\n1,"hello, world",3\n4,5,6\n';
const parsed = parseCsv(quoted);
check('headers parsed', parsed.headers.join('|') === 'a|b|c', parsed.headers);
check('quoted comma preserved', parsed.rows[0][1] === 'hello, world', parsed.rows[0]);
check('row count', parsed.rows.length === 2, parsed.rows.length);

console.log('\nTimestamp parsing:');
check('ISO parses', parseWhoopTs('2024-01-15T06:30:00Z') != null);
check('space-form parses', parseWhoopTs('2024-01-15 06:30:00') != null);
check('empty is null', parseWhoopTs('') === null);

console.log('\nWHOOP cycles CSV:');
const cyclesCsv =
  'Cycle start time,Cycle end time,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Day Strain,Average heart rate (bpm)\n' +
  '2024-01-15 00:00:00,2024-01-16 00:00:00,66,54,78,12.4,62\n';
const cycles = parseCyclesCsv(cyclesCsv);
check('one cycle', cycles.length === 1, cycles.length);
check('recovery 66', cycles[0]?.recoveryScore === 66, cycles[0]);
check('rhr 54', cycles[0]?.restingHr === 54);
check('hrv 78', cycles[0]?.hrvRmssdMs === 78);
check('strain 12.4', cycles[0]?.strain === 12.4);
check('deterministic id', cycles[0]?.cycleId.startsWith('cycle-'));

console.log('\nWHOOP sleeps CSV:');
const sleepsCsv =
  'Sleep onset,Wake onset,Sleep performance %,Sleep efficiency %,Asleep duration (min)\n' +
  '2024-01-15 23:00:00,2024-01-16 07:00:00,88,91,444\n';
const sleeps = parseSleepsCsv(sleepsCsv);
check('one sleep', sleeps.length === 1, sleeps.length);
check('performance 88', sleeps[0]?.performancePct === 88);
check('asleep 444min -> ms', sleeps[0]?.asleepMs === 444 * 60_000, sleeps[0]?.asleepMs);

console.log('\nWHOOP workouts CSV:');
const workoutsCsv =
  'Workout start time,Workout end time,Activity name,Activity Strain,Average HR (bpm),Max HR (bpm),Energy burned (cal),Distance (meters)\n' +
  '2024-01-15 17:00:00,2024-01-15 17:45:00,Running,11.2,148,176,520,6400\n';
const workouts = parseWorkoutsCsv(workoutsCsv);
check('one workout', workouts.length === 1, workouts.length);
check('type Running', workouts[0]?.type === 'Running');
check('avg hr 148', workouts[0]?.avgHr === 148);
check('distance 6400m', workouts[0]?.distanceMeters === 6400);
check('cal -> kJ', Math.round(workouts[0]?.kilojoules ?? 0) === Math.round(520 * 4.184));

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
