import { Platform } from 'react-native';
import AppleHealthKit, {
  HealthInputOptions,
  HealthKitPermissions,
  HealthValue,
} from 'react-native-health';

import { deleteSecret, getSecret, setSecret } from './storage';

const { Permissions } = AppleHealthKit.Constants;

const PERMS: HealthKitPermissions = {
  permissions: {
    read: [
      Permissions.Steps,
      Permissions.StepCount,
      Permissions.HeartRate,
      Permissions.RestingHeartRate,
      Permissions.HeartRateVariability,
      Permissions.SleepAnalysis,
      Permissions.ActiveEnergyBurned,
      Permissions.AppleExerciseTime,
      Permissions.Workout,
      Permissions.RespiratoryRate,
      Permissions.OxygenSaturation,
      Permissions.BodyMass,
    ],
    write: [],
  },
};

const CONNECTED_KEY = 'health.connected';

export type DailyHealthSnapshot = {
  date: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  exerciseMinutes: number | null;
  restingHR: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
  spo2: number | null;
};

export function isHealthPlatformSupported(): boolean {
  return Platform.OS === 'ios';
}

export async function requestHealthPermissions(): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Health is only available on iOS.');
  }
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(PERMS, (err) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });
}

/**
 * Ask iOS for HealthKit read permission and remember locally that the user
 * has connected. HealthKit doesn't expose "granted" status to the app, so we
 * treat "user tapped Connect and iOS didn't throw" as connected. If the user
 * revokes access in the Settings app, subsequent reads simply return null
 * values and the UI degrades gracefully.
 */
export async function connectHealth(): Promise<void> {
  await requestHealthPermissions();
  await setSecret(CONNECTED_KEY, '1');
}

export async function disconnectHealth(): Promise<void> {
  await deleteSecret(CONNECTED_KEY);
}

export async function isHealthConnected(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return (await getSecret(CONNECTED_KEY)) !== null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getSampleValue(
  fn: (opts: HealthInputOptions, cb: (e: string, r: HealthValue) => void) => void,
  opts: HealthInputOptions,
): Promise<number | null> {
  return new Promise((resolve) => {
    fn(opts, (err, result) => {
      if (err || !result) return resolve(null);
      resolve(typeof result.value === 'number' ? result.value : null);
    });
  });
}

function getSamplesAverage(
  fn: (opts: HealthInputOptions, cb: (e: string, r: HealthValue[]) => void) => void,
  opts: HealthInputOptions,
): Promise<number | null> {
  return new Promise((resolve) => {
    fn(opts, (err, results) => {
      if (err || !results || results.length === 0) return resolve(null);
      const nums = results
        .map((r) => (typeof r.value === 'number' ? r.value : NaN))
        .filter((n) => Number.isFinite(n));
      if (nums.length === 0) return resolve(null);
      resolve(nums.reduce((a, b) => a + b, 0) / nums.length);
    });
  });
}

export async function getTodaySnapshot(): Promise<DailyHealthSnapshot> {
  const now = new Date();
  const start = startOfDay(now);
  const opts: HealthInputOptions = {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };

  const [steps, activeEnergy, exerciseMinutes, restingHR, hrv, spo2] = await Promise.all([
    getSampleValue(AppleHealthKit.getStepCount, opts),
    getSampleValue(AppleHealthKit.getActiveEnergyBurned as never, opts),
    getSampleValue(AppleHealthKit.getAppleExerciseTime as never, opts),
    getSamplesAverage(AppleHealthKit.getRestingHeartRateSamples as never, opts),
    getSamplesAverage(AppleHealthKit.getHeartRateVariabilitySamples as never, opts),
    getSamplesAverage(AppleHealthKit.getOxygenSaturationSamples as never, opts),
  ]);

  const sleepHours = await new Promise<number | null>((resolve) => {
    AppleHealthKit.getSleepSamples(
      {
        startDate: new Date(now.getTime() - 36 * 3600_000).toISOString(),
        endDate: now.toISOString(),
      },
      (err, results) => {
        if (err || !results) return resolve(null);
        const asleepMs = results
          .filter((s) => typeof s.value === 'string' && s.value.toLowerCase().includes('asleep'))
          .reduce((sum, s) => {
            const a = new Date(s.startDate).getTime();
            const b = new Date(s.endDate).getTime();
            return sum + Math.max(0, b - a);
          }, 0);
        resolve(asleepMs > 0 ? asleepMs / 3600_000 : null);
      },
    );
  });

  return {
    date: start.toISOString().slice(0, 10),
    steps,
    activeEnergyKcal: activeEnergy,
    exerciseMinutes,
    restingHR,
    hrvMs: hrv,
    sleepHours,
    spo2,
  };
}
