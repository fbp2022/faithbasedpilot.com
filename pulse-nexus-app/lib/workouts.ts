/**
 * Unified workout history across Apple Health, WHOOP, Fitbit, and Garmin.
 *
 * Each provider exposes workouts under a different shape and naming
 * convention; this module normalizes them into a single `Workout` record
 * so the UI can render one chronological list. Source is preserved per
 * row so the user can see which device logged it.
 */
import { Platform } from 'react-native';
import AppleHealthKit, { HealthInputOptions, HealthValue } from 'react-native-health';

import { isFitbitConnected } from './fitbit';
import { isGarminConnected } from './garmin';
import { isWhoopConnected } from './whoop';
import { getSecret } from './storage';

export type WorkoutSource = 'Apple Health' | 'WHOOP' | 'Fitbit' | 'Garmin';

export type Workout = {
  id: string;
  source: WorkoutSource;
  type: string;
  start: string;
  end: string;
  durationMin: number;
  distanceKm?: number;
  calories?: number;
  avgHR?: number;
  maxHR?: number;
  strainOrLoad?: number;
};

const MS_PER_MIN = 60_000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function epochDaysAgo(days: number): number {
  return Math.floor((Date.now() - days * 86_400_000) / 1000);
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / MS_PER_MIN);
}

function cleanAppleType(raw: string | undefined): string {
  if (!raw) return 'Workout';
  return raw.replace(/^HKWorkoutActivityType/, '').replace(/([A-Z])/g, ' $1').trim();
}

function cleanGarminType(raw: string | undefined): string {
  if (!raw) return 'Workout';
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
    .trim();
}

// WHOOP returns a sport_id integer; this is a partial mapping that covers
// the common cases. Unknown ids fall back to "Workout".
const WHOOP_SPORT_BY_ID: Record<number, string> = {
  0: 'Running',
  1: 'Cycling',
  16: 'Baseball',
  17: 'Basketball',
  18: 'Rowing',
  19: 'Fencing',
  20: 'Field Hockey',
  21: 'Football',
  22: 'Golf',
  24: 'Ice Hockey',
  25: 'Lacrosse',
  27: 'Rugby',
  28: 'Sailing',
  29: 'Skiing',
  30: 'Soccer',
  31: 'Softball',
  32: 'Squash',
  33: 'Swimming',
  34: 'Tennis',
  35: 'Track & Field',
  36: 'Volleyball',
  37: 'Water Polo',
  38: 'Wrestling',
  39: 'Boxing',
  42: 'Dance',
  43: 'Pilates',
  44: 'Yoga',
  45: 'Weightlifting',
  47: 'Cross Country Skiing',
  48: 'Functional Fitness',
  49: 'Duathlon',
  51: 'Gymnastics',
  52: 'Hiking / Rucking',
  53: 'Horseback Riding',
  55: 'Kayaking',
  56: 'Martial Arts',
  57: 'Mountain Biking',
  59: 'Powerlifting',
  60: 'Rock Climbing',
  61: 'Paddleboarding',
  62: 'Triathlon',
  63: 'Walking',
  64: 'Surfing',
  65: 'Elliptical',
  66: 'Stairmaster',
  70: 'Meditation',
  71: 'Other',
  73: 'Diving',
  82: 'HIIT',
  83: 'Spin',
  84: 'Jiu Jitsu',
  85: 'Manual Labor',
  86: 'Cricket',
  87: 'Pickleball',
  88: 'Inline Skating',
  89: 'Box Fitness',
};

async function getAppleHealthWorkouts(days = 14): Promise<Workout[]> {
  if (Platform.OS !== 'ios') return [];
  const opts = {
    startDate: isoDaysAgo(days),
    endDate: new Date().toISOString(),
    limit: 50,
    ascending: false,
    type: 'Workout',
  } as unknown as HealthInputOptions;

  type AppleWorkoutRaw = HealthValue & {
    activityName?: string;
    activityId?: number;
    calories?: number;
    distance?: number;
    tracked?: boolean;
    sourceName?: string;
    start?: string;
    end?: string;
  };

  return new Promise((resolve) => {
    AppleHealthKit.getSamples(opts, (err, results: AppleWorkoutRaw[]) => {
      if (err || !results) return resolve([]);
      const out: Workout[] = results.map((r, idx) => {
        const start = r.start ?? r.startDate ?? new Date().toISOString();
        const end = r.end ?? r.endDate ?? start;
        return {
          id: `apple:${r.id ?? start}:${idx}`,
          source: 'Apple Health',
          type: cleanAppleType(r.activityName),
          start,
          end,
          durationMin: minutesBetween(start, end),
          distanceKm: typeof r.distance === 'number' && r.distance > 0 ? r.distance / 1000 : undefined,
          calories: typeof r.calories === 'number' ? r.calories : undefined,
        };
      });
      resolve(out);
    });
  });
}

async function getWhoopWorkouts(days = 14): Promise<Workout[]> {
  if (!(await isWhoopConnected())) return [];
  const token = await getSecret('whoop.access_token');
  if (!token) return [];
  const url = new URL('https://api.prod.whoop.com/developer/v1/activity/workout');
  url.searchParams.set('limit', '25');
  url.searchParams.set('start', isoDaysAgo(days));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } }).catch(
    () => null,
  );
  if (!res || !res.ok) return [];
  const json = (await res.json().catch(() => null)) as {
    records?: Array<{
      id: number;
      start: string;
      end: string;
      sport_id?: number;
      score?: {
        strain?: number;
        average_heart_rate?: number;
        max_heart_rate?: number;
        kilojoule?: number;
        distance_meter?: number;
      };
    }>;
  } | null;
  if (!json?.records) return [];
  return json.records.map((r) => ({
    id: `whoop:${r.id}`,
    source: 'WHOOP',
    type: r.sport_id != null ? WHOOP_SPORT_BY_ID[r.sport_id] ?? 'Workout' : 'Workout',
    start: r.start,
    end: r.end,
    durationMin: minutesBetween(r.start, r.end),
    distanceKm:
      r.score?.distance_meter != null && r.score.distance_meter > 0
        ? r.score.distance_meter / 1000
        : undefined,
    calories: r.score?.kilojoule != null ? Math.round(r.score.kilojoule / 4.184) : undefined,
    avgHR: r.score?.average_heart_rate,
    maxHR: r.score?.max_heart_rate,
    strainOrLoad: r.score?.strain,
  }));
}

async function getFitbitWorkouts(days = 14): Promise<Workout[]> {
  if (!(await isFitbitConnected())) return [];
  const token = await getSecret('fitbit.access_token');
  if (!token) return [];
  const after = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url = new URL('https://api.fitbit.com/1/user/-/activities/list.json');
  url.searchParams.set('afterDate', after);
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('limit', '20');
  url.searchParams.set('offset', '0');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const json = (await res.json().catch(() => null)) as {
    activities?: Array<{
      logId?: number;
      activityName?: string;
      startTime?: string;
      duration?: number;
      calories?: number;
      distance?: number;
      averageHeartRate?: number;
      heartRateZones?: Array<{ max?: number }>;
    }>;
  } | null;
  if (!json?.activities) return [];
  return json.activities.map((a, idx) => {
    const start = a.startTime ?? new Date().toISOString();
    const durationMin = a.duration != null ? a.duration / 60_000 : 0;
    const end = new Date(new Date(start).getTime() + durationMin * MS_PER_MIN).toISOString();
    const maxHR =
      a.heartRateZones?.reduce<number | undefined>(
        (acc, z) => (z.max != null ? Math.max(acc ?? 0, z.max) : acc),
        undefined,
      ) ?? undefined;
    return {
      id: `fitbit:${a.logId ?? idx}`,
      source: 'Fitbit',
      type: a.activityName ?? 'Workout',
      start,
      end,
      durationMin,
      distanceKm: a.distance != null && a.distance > 0 ? a.distance : undefined,
      calories: a.calories,
      avgHR: a.averageHeartRate,
      maxHR,
    };
  });
}

async function getGarminWorkouts(days = 14): Promise<Workout[]> {
  if (!(await isGarminConnected())) return [];
  const token = await getSecret('garmin.access_token');
  if (!token) return [];
  const url = new URL('https://apis.garmin.com/wellness-api/rest/activities');
  url.searchParams.set('uploadStartTimeInSeconds', String(epochDaysAgo(days)));
  url.searchParams.set('uploadEndTimeInSeconds', String(nowEpoch()));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const json = (await res.json().catch(() => null)) as Array<{
    summaryId?: string;
    activityType?: string;
    startTimeInSeconds?: number;
    durationInSeconds?: number;
    distanceInMeters?: number;
    activeKilocalories?: number;
    averageHeartRateInBeatsPerMinute?: number;
    maxHeartRateInBeatsPerMinute?: number;
  }> | null;
  if (!Array.isArray(json)) return [];
  return json.map((a, idx) => {
    const startMs = (a.startTimeInSeconds ?? Math.floor(Date.now() / 1000)) * 1000;
    const durSec = a.durationInSeconds ?? 0;
    return {
      id: `garmin:${a.summaryId ?? idx}`,
      source: 'Garmin',
      type: cleanGarminType(a.activityType),
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + durSec * 1000).toISOString(),
      durationMin: durSec / 60,
      distanceKm:
        a.distanceInMeters != null && a.distanceInMeters > 0
          ? a.distanceInMeters / 1000
          : undefined,
      calories: a.activeKilocalories,
      avgHR: a.averageHeartRateInBeatsPerMinute,
      maxHR: a.maxHeartRateInBeatsPerMinute,
    };
  });
}

/**
 * Fetch workouts from every connected source in parallel and merge them
 * into one chronological list (newest first). Failures from one source
 * never block the others.
 */
export async function getAllWorkouts(days = 14): Promise<Workout[]> {
  const [apple, whoop, fitbit, garmin] = await Promise.all([
    getAppleHealthWorkouts(days).catch(() => []),
    getWhoopWorkouts(days).catch(() => []),
    getFitbitWorkouts(days).catch(() => []),
    getGarminWorkouts(days).catch(() => []),
  ]);
  return [...apple, ...whoop, ...fitbit, ...garmin].sort(
    (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
  );
}
