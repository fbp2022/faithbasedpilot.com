/**
 * Unified sleep detail across Apple Health, WHOOP, Fitbit, and Garmin.
 *
 * Most modern wearables provide stage breakdowns (Deep / REM / Light / Awake),
 * sleep score, and efficiency. This module normalizes each provider's API into
 * a single `SleepSnapshot` so the Sleep screen can render one consistent view
 * regardless of which device produced the data.
 *
 * The provider with the most detailed last-night data wins per metric; the
 * Sleep screen also calls `getAllSleepSnapshots()` to render per-source rows
 * when the user wants to compare them side by side.
 */
import { Platform } from 'react-native';
import AppleHealthKit, { HealthInputOptions, HealthValue } from 'react-native-health';

import { getSecret } from './storage';
import { isFitbitConnected } from './fitbit';
import { isGarminConnected } from './garmin';
import { isWhoopConnected } from './whoop';

export type SleepStageMs = {
  deep: number;
  rem: number;
  light: number;
  awake: number;
};

export type SleepSnapshot = {
  source: 'Apple Health' | 'WHOOP' | 'Fitbit' | 'Garmin';
  start: string;
  end: string;
  inBedMs: number;
  asleepMs: number;
  efficiencyPct: number | null;
  scorePct: number | null;
  needMs: number | null;
  stages: SleepStageMs;
  avgHR: number | null;
  avgHRV: number | null;
  avgRespRate: number | null;
};

export type SleepCombined = {
  primary: SleepSnapshot | null;
  perSource: SleepSnapshot[];
};

const MS_PER_HOUR = 3_600_000;
const PRIORITY: SleepSnapshot['source'][] = ['WHOOP', 'Garmin', 'Fitbit', 'Apple Health'];

function emptyStages(): SleepStageMs {
  return { deep: 0, rem: 0, light: 0, awake: 0 };
}

function startOfYesterday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

async function fetchAppleHealthSleep(): Promise<SleepSnapshot | null> {
  if (Platform.OS !== 'ios') return null;
  const end = new Date();
  const start = new Date(end.getTime() - 36 * MS_PER_HOUR);

  const opts: HealthInputOptions = { startDate: start.toISOString(), endDate: end.toISOString() };
  type SleepSample = Omit<HealthValue, 'value'> & {
    value?: string;
    startDate?: string;
    endDate?: string;
  };

  const samples = await new Promise<SleepSample[]>((resolve) => {
    AppleHealthKit.getSleepSamples(opts, (err, r) =>
      resolve(err || !r ? [] : (r as unknown as SleepSample[])),
    );
  });
  if (samples.length === 0) return null;

  const stages = emptyStages();
  let inBedMs = 0;
  let firstStart: number | null = null;
  let lastEnd: number | null = null;

  for (const s of samples) {
    const startMs = new Date(s.startDate ?? '').getTime();
    const endMs = new Date(s.endDate ?? '').getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const dur = Math.max(0, endMs - startMs);
    if (firstStart === null || startMs < firstStart) firstStart = startMs;
    if (lastEnd === null || endMs > lastEnd) lastEnd = endMs;

    const v = (s.value ?? '').toLowerCase();
    if (v.includes('inbed')) inBedMs += dur;
    else if (v.includes('deep')) stages.deep += dur;
    else if (v.includes('rem')) stages.rem += dur;
    else if (v.includes('awake')) stages.awake += dur;
    else if (v.includes('core') || v.includes('asleep') || v.includes('light')) stages.light += dur;
  }

  const asleepMs = stages.deep + stages.rem + stages.light;
  if (asleepMs === 0 && inBedMs === 0) return null;

  return {
    source: 'Apple Health',
    start: new Date(firstStart ?? Date.now()).toISOString(),
    end: new Date(lastEnd ?? Date.now()).toISOString(),
    inBedMs: inBedMs || asleepMs + stages.awake,
    asleepMs,
    efficiencyPct:
      inBedMs > 0 ? Math.round((asleepMs / inBedMs) * 100) : null,
    scorePct: null,
    needMs: null,
    stages,
    avgHR: null,
    avgHRV: null,
    avgRespRate: null,
  };
}

async function fetchWhoopSleep(): Promise<SleepSnapshot | null> {
  if (!(await isWhoopConnected())) return null;
  const token = await getSecret('whoop.access_token');
  if (!token) return null;
  const res = await fetch('https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    records?: Array<{
      start: string;
      end: string;
      score?: {
        sleep_performance_percentage?: number;
        sleep_efficiency_percentage?: number;
        sleep_needed_milli?: number;
        stage_summary?: {
          total_in_bed_time_milli?: number;
          total_awake_time_milli?: number;
          total_light_sleep_time_milli?: number;
          total_slow_wave_sleep_time_milli?: number;
          total_rem_sleep_time_milli?: number;
          sleep_cycle_count?: number;
        };
        respiratory_rate?: number;
      };
    }>;
  } | null;
  const r = json?.records?.[0];
  if (!r) return null;
  const s = r.score?.stage_summary ?? {};
  const stages: SleepStageMs = {
    deep: s.total_slow_wave_sleep_time_milli ?? 0,
    rem: s.total_rem_sleep_time_milli ?? 0,
    light: s.total_light_sleep_time_milli ?? 0,
    awake: s.total_awake_time_milli ?? 0,
  };
  const inBed = s.total_in_bed_time_milli ?? stages.deep + stages.rem + stages.light + stages.awake;
  const asleep = stages.deep + stages.rem + stages.light;
  return {
    source: 'WHOOP',
    start: r.start,
    end: r.end,
    inBedMs: inBed,
    asleepMs: asleep,
    efficiencyPct: r.score?.sleep_efficiency_percentage ?? null,
    scorePct: r.score?.sleep_performance_percentage ?? null,
    needMs: r.score?.sleep_needed_milli ?? null,
    stages,
    avgHR: null,
    avgHRV: null,
    avgRespRate: r.score?.respiratory_rate ?? null,
  };
}

async function fetchFitbitSleep(): Promise<SleepSnapshot | null> {
  if (!(await isFitbitConnected())) return null;
  const token = await getSecret('fitbit.access_token');
  if (!token) return null;
  const date = startOfYesterday().toISOString().slice(0, 10);
  const res = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    sleep?: Array<{
      startTime?: string;
      endTime?: string;
      duration?: number;
      efficiency?: number;
      minutesAsleep?: number;
      timeInBed?: number;
      levels?: { summary?: Record<string, { minutes?: number }> };
    }>;
  } | null;
  const main = json?.sleep?.find((s) => s.levels?.summary) ?? json?.sleep?.[0];
  if (!main) return null;
  const summary = main.levels?.summary ?? {};
  const minutesToMs = (m: number | undefined) => (m ? m * 60_000 : 0);
  const stages: SleepStageMs = {
    deep: minutesToMs(summary.deep?.minutes),
    rem: minutesToMs(summary.rem?.minutes),
    light: minutesToMs(summary.light?.minutes),
    awake: minutesToMs(summary.wake?.minutes ?? summary.awake?.minutes),
  };
  return {
    source: 'Fitbit',
    start: main.startTime ?? new Date().toISOString(),
    end: main.endTime ?? new Date().toISOString(),
    inBedMs: (main.timeInBed ?? 0) * 60_000,
    asleepMs: (main.minutesAsleep ?? 0) * 60_000,
    efficiencyPct: main.efficiency ?? null,
    scorePct: null,
    needMs: null,
    stages,
    avgHR: null,
    avgHRV: null,
    avgRespRate: null,
  };
}

async function fetchGarminSleep(): Promise<SleepSnapshot | null> {
  if (!(await isGarminConnected())) return null;
  const token = await getSecret('garmin.access_token');
  if (!token) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - 2 * 24 * 3600;
  const url = new URL('https://apis.garmin.com/wellness-api/rest/sleeps');
  url.searchParams.set('uploadStartTimeInSeconds', String(startSec));
  url.searchParams.set('uploadEndTimeInSeconds', String(nowSec));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as Array<{
    startTimeInSeconds?: number;
    durationInSeconds?: number;
    deepSleepDurationInSeconds?: number;
    lightSleepDurationInSeconds?: number;
    remSleepInSeconds?: number;
    awakeDurationInSeconds?: number;
    overallSleepScore?: { value?: number };
    averageRespirationValue?: number;
  }> | null;
  const r = json?.[0];
  if (!r || r.startTimeInSeconds == null || r.durationInSeconds == null) return null;
  const startMs = r.startTimeInSeconds * 1000;
  const endMs = startMs + r.durationInSeconds * 1000;
  const stages: SleepStageMs = {
    deep: (r.deepSleepDurationInSeconds ?? 0) * 1000,
    rem: (r.remSleepInSeconds ?? 0) * 1000,
    light: (r.lightSleepDurationInSeconds ?? 0) * 1000,
    awake: (r.awakeDurationInSeconds ?? 0) * 1000,
  };
  const asleep = stages.deep + stages.rem + stages.light;
  const inBed = asleep + stages.awake;
  return {
    source: 'Garmin',
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    inBedMs: inBed,
    asleepMs: asleep,
    efficiencyPct: inBed > 0 ? Math.round((asleep / inBed) * 100) : null,
    scorePct: r.overallSleepScore?.value ?? null,
    needMs: null,
    stages,
    avgHR: null,
    avgHRV: null,
    avgRespRate: r.averageRespirationValue ?? null,
  };
}

export async function getAllSleepSnapshots(): Promise<SleepSnapshot[]> {
  const [apple, whoop, fitbit, garmin] = await Promise.all([
    fetchAppleHealthSleep().catch(() => null),
    fetchWhoopSleep().catch(() => null),
    fetchFitbitSleep().catch(() => null),
    fetchGarminSleep().catch(() => null),
  ]);
  return [apple, whoop, fitbit, garmin].filter((s): s is SleepSnapshot => s !== null);
}

export async function getSleepCombined(): Promise<SleepCombined> {
  const all = await getAllSleepSnapshots();
  let primary: SleepSnapshot | null = null;
  for (const src of PRIORITY) {
    const found = all.find((s) => s.source === src);
    if (found) {
      primary = found;
      break;
    }
  }
  return { primary, perSource: all };
}

export function totalAsleepMinutes(s: SleepSnapshot): number {
  return s.asleepMs / 60_000;
}

export function formatHM(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
