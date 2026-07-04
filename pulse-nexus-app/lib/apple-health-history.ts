/**
 * Apple Health → local store backfill.
 *
 * The official WHOOP app writes your biometrics into Apple Health (heart
 * rate, HRV/SDNN, resting heart rate, respiratory rate, sleep, workouts).
 * Because that sync already happens on the user's phone, Pulse Nexus can
 * read that history straight out of HealthKit — no WHOOP account, no cloud,
 * no export file. This module pulls a range of that history and writes it
 * into the same unified store the WHOOP export import uses, tagged with
 * source "Apple Health".
 *
 * Notes:
 *  - Apple Health does NOT hold WHOOP's proprietary recovery score or day
 *    strain (those are computed in WHOOP's cloud), so daily rows here carry
 *    HRV / resting HR / respiratory rate but leave recovery and strain null.
 *    The dashboard's recovery ring keeps preferring a real WHOOP-export row
 *    when one exists (see getLatestCycleWithRecovery in whoop-store).
 *  - HealthKit HRV (SDNN) is reported in seconds by react-native-health, so
 *    we convert to milliseconds.
 *  - iOS only. On other platforms this is a no-op that reports zero rows.
 */
import { Platform } from 'react-native';
import AppleHealthKit, { type HealthInputOptions, type HealthValue } from 'react-native-health';

import { requestHealthPermissions } from './healthkit';
import {
  recordImport,
  upsertWhoopHistory,
  type WhoopCycleRow,
  type WhoopSleepRow,
  type WhoopWorkoutRow,
} from './whoop-store';

const SOURCE = 'Apple Health';

type Sample = { value: number; startDate: string; endDate: string };
type SleepSample = { value: string; startDate: string; endDate: string };
type WorkoutSample = {
  activityName?: string;
  activityId?: number;
  calories?: number;
  distance?: number;
  start: string;
  end: string;
};

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function readSamples(
  fn: (opts: HealthInputOptions, cb: (e: string, r: HealthValue[]) => void) => void,
  opts: HealthInputOptions,
): Promise<Sample[]> {
  return new Promise((resolve) => {
    fn(opts, (err, results) => {
      if (err || !Array.isArray(results)) return resolve([]);
      resolve(
        results
          .map((r) => ({
            value: typeof r.value === 'number' ? r.value : NaN,
            startDate: String(r.startDate),
            endDate: String(r.endDate),
          }))
          .filter((r) => Number.isFinite(r.value)),
      );
    });
  });
}

function average(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Build one daily cycle row per calendar day from HRV / resting-HR /
 * respiratory samples. Recovery and strain are left null (Apple Health
 * doesn't carry WHOOP's proprietary scores).
 */
function buildDailyCycles(
  hrv: Sample[],
  rhr: Sample[],
  resp: Sample[],
): WhoopCycleRow[] {
  const byDay = new Map<
    string,
    { hrv: number[]; rhr: number[]; resp: number[]; startTs: number }
  >();

  const add = (s: Sample, bucket: 'hrv' | 'rhr' | 'resp', transform: (v: number) => number) => {
    const key = dayKey(s.startDate);
    const startTs = new Date(key + 'T00:00:00').getTime();
    const entry = byDay.get(key) ?? { hrv: [], rhr: [], resp: [], startTs };
    entry[bucket].push(transform(s.value));
    byDay.set(key, entry);
  };

  for (const s of hrv) add(s, 'hrv', (v) => v * 1000); // seconds → ms
  for (const s of rhr) add(s, 'rhr', (v) => v);
  for (const s of resp) add(s, 'resp', (v) => v);

  const out: WhoopCycleRow[] = [];
  for (const [key, e] of byDay) {
    out.push({
      cycleId: `ah-cycle-${key}`,
      startTs: e.startTs,
      endTs: e.startTs + 24 * 60 * 60 * 1000,
      recoveryScore: null,
      restingHr: average(e.rhr),
      hrvRmssdMs: average(e.hrv),
      strain: null,
      avgHr: null,
      source: SOURCE,
    });
  }
  return out;
}

/**
 * Group raw sleep-analysis samples into one row per night. A "night" is the
 * set of asleep segments whose end falls on the same calendar day; we take
 * the earliest start, latest end, and sum the asleep time.
 */
function buildSleepRows(samples: SleepSample[]): WhoopSleepRow[] {
  const asleep = samples.filter((s) => s.value.toLowerCase().includes('asleep'));
  const byNight = new Map<string, { start: number; end: number; asleepMs: number }>();

  for (const s of asleep) {
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = dayKey(s.endDate);
    const entry = byNight.get(key) ?? { start, end, asleepMs: 0 };
    entry.start = Math.min(entry.start, start);
    entry.end = Math.max(entry.end, end);
    entry.asleepMs += end - start;
    byNight.set(key, entry);
  }

  const out: WhoopSleepRow[] = [];
  for (const e of byNight.values()) {
    const inBedMs = e.end - e.start;
    out.push({
      sleepId: `ah-sleep-${e.start}`,
      startTs: e.start,
      endTs: e.end,
      performancePct: null,
      efficiencyPct: inBedMs > 0 ? Math.round((e.asleepMs / inBedMs) * 100) : null,
      neededMs: null,
      inBedMs,
      asleepMs: e.asleepMs,
      respiratoryRate: null,
      source: SOURCE,
    });
  }
  return out;
}

function readWorkouts(opts: HealthInputOptions): Promise<WorkoutSample[]> {
  return new Promise((resolve) => {
    const anchored = (AppleHealthKit as unknown as {
      getAnchoredWorkouts?: (
        o: HealthInputOptions,
        cb: (e: string, r: { data?: WorkoutSample[] }) => void,
      ) => void;
    }).getAnchoredWorkouts;
    if (!anchored) return resolve([]);
    anchored(opts, (err, results) => {
      if (err || !results?.data) return resolve([]);
      resolve(results.data);
    });
  });
}

function buildWorkoutRows(workouts: WorkoutSample[]): WhoopWorkoutRow[] {
  const out: WhoopWorkoutRow[] = [];
  for (const w of workouts) {
    const startTs = new Date(w.start).getTime();
    const endTs = new Date(w.end).getTime();
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) continue;
    out.push({
      workoutId: `ah-workout-${startTs}`,
      startTs,
      endTs,
      type: w.activityName ?? 'Workout',
      strain: null,
      avgHr: null,
      maxHr: null,
      kilojoules: w.calories != null ? w.calories * 4.184 : null,
      distanceMeters: w.distance ?? null,
      source: SOURCE,
    });
  }
  return out;
}

export type AppleHealthImportResult = {
  cycles: number;
  sleeps: number;
  workouts: number;
  days: number;
};

/**
 * Read the last `days` of WHOOP-synced biometrics from Apple Health and
 * upsert them into the local store. Idempotent (deterministic ids).
 */
export async function importAppleHealthHistory(days = 180): Promise<AppleHealthImportResult> {
  if (Platform.OS !== 'ios') {
    return { cycles: 0, sleeps: 0, workouts: 0, days };
  }
  await requestHealthPermissions();

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const opts: HealthInputOptions = {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
    ascending: true,
    limit: 100000,
  };

  const [hrv, rhr, resp] = await Promise.all([
    readSamples(AppleHealthKit.getHeartRateVariabilitySamples as never, opts),
    readSamples(AppleHealthKit.getRestingHeartRateSamples as never, opts),
    readSamples(AppleHealthKit.getRespiratoryRateSamples as never, opts),
  ]);

  const sleepSamples = await new Promise<SleepSample[]>((resolve) => {
    AppleHealthKit.getSleepSamples(opts, (err, results) => {
      if (err || !Array.isArray(results)) return resolve([]);
      resolve(
        results.map((r) => ({
          value: String((r as unknown as { value?: string }).value ?? ''),
          startDate: String(r.startDate),
          endDate: String(r.endDate),
        })),
      );
    });
  });

  const workouts = await readWorkouts(opts);

  const cycles = buildDailyCycles(hrv, rhr, resp);
  const sleeps = buildSleepRows(sleepSamples);
  const workoutRows = buildWorkoutRows(workouts);

  await upsertWhoopHistory({ cycles, sleeps, workouts: workoutRows });
  await recordImport({
    source: SOURCE,
    cycles: cycles.length,
    sleeps: sleeps.length,
    workouts: workoutRows.length,
  });

  return { cycles: cycles.length, sleeps: sleeps.length, workouts: workoutRows.length, days };
}
