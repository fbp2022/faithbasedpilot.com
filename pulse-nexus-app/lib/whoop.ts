/**
 * WHOOP integration.
 *
 * Pulse Nexus talks to the WHOOP strap **directly over Bluetooth** — no WHOOP
 * account, no WHOOP cloud, no subscription. See `lib/whoop-ble.ts` for the
 * BLE client that owns scanning, pairing, and the live-HR stream.
 *
 * This module used to sign in against WHOOP's Developer OAuth API. That
 * codepath has been removed because it defeated the purpose of local-first:
 * it required a WHOOP account and, in practice, a WHOOP subscription, since
 * the developer API only returns data WHOOP's cloud has already ingested.
 *
 * Stage 1 of the BLE work (this file's current state):
 *  - `isWhoopConnected()` reflects whether the strap is BLE-paired.
 *  - `connectWhoop()` is intentionally not the entry point any more —
 *    pairing happens on the dedicated /whoop-connect scan screen, which
 *    the Connect screen deep-links into.
 *  - Live heart rate is streaming (public Bluetooth Heart Rate profile).
 *  - Deeper metrics — recovery, HRV, strain, sleep — return `null` because
 *    they need WHOOP's proprietary encrypted frames decoded on top of a
 *    GATT bond. That's Stage 2 (see `lib/whoop-ble.ts` for the hooks).
 *
 * The type exports below (WhoopRecovery / WhoopSleep / WhoopCycle) keep
 * their existing shape so the rest of the app (dashboard, chat, sleep,
 * workouts) typechecks. Once Stage 2 lands, these will get filled in from
 * decoded strap frames instead of returning null.
 */
import { forgetWhoopStrap, getWhoopBle, isWhoopStrapPaired } from './whoop-ble';
import {
  computeHrvSummary,
  estimateRestingHr,
  meanHeartRate,
} from './whoop-analytics';
import {
  getHistoryCounts,
  getLatestCycleWithRecovery,
  getLatestCycleWithStrain,
  getLatestSleep,
  getRecentHrSamples,
  getRecentRrIntervals,
  getWorkoutsSince,
} from './whoop-store';

const NEEDS_BLE_PAIRING_MESSAGE =
  'Pair your WHOOP strap over Bluetooth from Connect \u2192 WHOOP. Pulse Nexus no longer signs in to WHOOP\u2019s cloud.';

export function isWhoopConfigured(): boolean {
  return true;
}

export async function connectWhoop(): Promise<never> {
  throw new Error(NEEDS_BLE_PAIRING_MESSAGE);
}

export async function disconnectWhoop(): Promise<void> {
  await forgetWhoopStrap();
}

export async function isWhoopConnected(): Promise<boolean> {
  return isWhoopStrapPaired();
}

/**
 * True if there is any WHOOP data to show — either a strap paired over
 * Bluetooth or history imported from a WHOOP account export. The dashboard
 * uses this to decide whether to read WHOOP recovery / sleep / strain.
 */
export async function hasWhoopData(): Promise<boolean> {
  if (await isWhoopStrapPaired()) return true;
  const counts = await getHistoryCounts();
  return counts.cycles > 0 || counts.sleeps > 0 || counts.workouts > 0;
}

export type WhoopRecovery = {
  cycle_id: number;
  score: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number };
  updated_at: string;
};

export type WhoopSleep = {
  id: number;
  start: string;
  end: string;
  score: {
    sleep_performance_percentage: number;
    sleep_efficiency_percentage: number;
    sleep_needed_milli: number;
    stage_summary: { total_in_bed_time_milli: number };
  };
};

export type WhoopCycle = {
  id: number;
  start: string;
  end: string | null;
  score: { strain: number; average_heart_rate: number };
};

/**
 * These now read the newest record from the local store, which is
 * populated by a WHOOP account-export import (and, in a later stage, by
 * the strap's own encrypted history offload). If nothing has been imported
 * yet they return null and the dashboard falls back to Apple Health /
 * Fitbit / Garmin.
 */
export async function getLatestWhoopRecovery(): Promise<WhoopRecovery | null> {
  const cycle = await getLatestCycleWithRecovery();
  if (!cycle || cycle.recoveryScore == null) return null;
  return {
    cycle_id: Number(cycle.startTs),
    score: {
      recovery_score: cycle.recoveryScore,
      resting_heart_rate: cycle.restingHr ?? 0,
      hrv_rmssd_milli: cycle.hrvRmssdMs ?? 0,
    },
    updated_at: new Date(cycle.startTs).toISOString(),
  };
}

export async function getLatestWhoopSleep(): Promise<WhoopSleep | null> {
  const sleep = await getLatestSleep();
  if (!sleep) return null;
  return {
    id: Number(sleep.startTs),
    start: new Date(sleep.startTs).toISOString(),
    end: new Date(sleep.endTs).toISOString(),
    score: {
      sleep_performance_percentage: sleep.performancePct ?? 0,
      sleep_efficiency_percentage: sleep.efficiencyPct ?? 0,
      sleep_needed_milli: sleep.neededMs ?? 0,
      stage_summary: {
        total_in_bed_time_milli: sleep.inBedMs ?? sleep.asleepMs ?? 0,
      },
    },
  };
}

export async function getLatestWhoopCycle(): Promise<WhoopCycle | null> {
  const cycle = await getLatestCycleWithStrain();
  if (!cycle || cycle.strain == null) return null;
  return {
    id: Number(cycle.startTs),
    start: new Date(cycle.startTs).toISOString(),
    end: cycle.endTs ? new Date(cycle.endTs).toISOString() : null,
    score: { strain: cycle.strain, average_heart_rate: cycle.avgHr ?? 0 },
  };
}

export type WhoopHistoryWorkout = {
  id: string;
  start: string;
  end: string;
  type: string;
  strainOrLoad: number | null;
  avgHR: number | null;
  maxHR: number | null;
  calories: number | null;
  distanceKm: number | null;
};

/**
 * Imported WHOOP workouts over the given window, newest-first. Feeds the
 * Workouts tab alongside Apple Health / Fitbit / Garmin sessions.
 */
export async function getWhoopHistoryWorkouts(days = 30): Promise<WhoopHistoryWorkout[]> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await getWorkoutsSince(since);
  return rows.map((w) => ({
    id: w.workoutId,
    start: new Date(w.startTs).toISOString(),
    end: new Date(w.endTs).toISOString(),
    type: w.type,
    strainOrLoad: w.strain,
    avgHR: w.avgHr,
    maxHR: w.maxHr,
    calories: w.kilojoules != null ? w.kilojoules / 4.184 : null,
    distanceKm: w.distanceMeters != null ? w.distanceMeters / 1000 : null,
  }));
}

/**
 * Live heart rate the strap is currently emitting, or null if nothing has
 * arrived yet. Uses the same BLE singleton the /whoop-connect screen owns.
 */
export function getLatestWhoopLiveHR(): { bpm: number; timestamp: number } | null {
  const last = getWhoopBle().getLastHR();
  return last ? { bpm: last.bpm, timestamp: last.timestamp } : null;
}

/** Rolling HRV RMSSD for the current session (ms). See lib/whoop-analytics. */
export function getLiveRmssdMs(): number | null {
  return getWhoopBle().getRollingRmssdMs();
}

export type WhoopHrvSummary = {
  rmssdMs: number | null;
  sdnnMs: number | null;
  meanHr: number | null;
  cleanedCount: number;
  droppedCount: number;
  windowHours: number;
};

/**
 * HRV computed from persisted R-R intervals over the given window. Runs
 * the Malik ectopic filter first (drops beats that deviate >20% from a
 * running local median), then RMSSD and SDNN per Task Force 1996.
 * See `lib/whoop-analytics.ts` for the math.
 */
export async function getWhoopHrvOverWindow(hours: number): Promise<WhoopHrvSummary | null> {
  const windowMs = hours * 60 * 60 * 1000;
  const rr = await getRecentRrIntervals(windowMs);
  if (rr.length === 0) return null;
  const summary = computeHrvSummary(rr.map((p) => p.rrMs));
  return { ...summary, windowHours: hours };
}

/**
 * Estimated resting heart rate from persisted HR samples over the given
 * window (default 24 h). Uses the 5th-percentile heuristic — a
 * conservative approximation of true resting HR that's stable enough for
 * a wearable display.
 */
export async function getWhoopRestingHr(hours = 24): Promise<number | null> {
  const samples = await getRecentHrSamples(hours * 60 * 60 * 1000);
  return estimateRestingHr(samples);
}

/**
 * Mean heart rate across the given window (default 24 h).
 */
export async function getWhoopMeanHr(hours = 24): Promise<number | null> {
  const samples = await getRecentHrSamples(hours * 60 * 60 * 1000);
  return meanHeartRate(samples);
}
