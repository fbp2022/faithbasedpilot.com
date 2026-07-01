import { Platform } from 'react-native';
import AppleHealthKit, {
  HealthInputOptions,
  HealthKitPermissions,
  HealthValue,
} from 'react-native-health';

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

export async function requestHealthPermissions(): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('HealthKit is only available on iOS.');
  }
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(PERMS, (err) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });
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
        type SleepRow = { value?: string; startDate: string; endDate: string };
        const rows = results as unknown as SleepRow[];
        const asleepMs = rows
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
