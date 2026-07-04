/**
 * Rule-based insights generator. NO machine learning, NO model calls.
 *
 * Takes a combined snapshot from up to four sources (Apple Health, WHOOP,
 * Fitbit, Garmin) and produces plain-English insights using deterministic
 * rules. Anything this function says can be traced directly to a comparison
 * in the code below.
 *
 * Design principles:
 *  - Each metric has a clear priority order across sources (e.g. dedicated
 *    chest/wrist straps generally outrank phone-derived data).
 *  - When two sources disagree by more than a threshold, that disagreement
 *    itself becomes an insight, so the user can see what each device thinks.
 *  - Missing data is handled silently — no fabricated values.
 */
import type { DailyHealthSnapshot } from './healthkit';
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from './whoop';
import type { FitbitSnapshot } from './fitbit';
import type { GarminSnapshot } from './garmin';

export type Insight = {
  level: 'good' | 'neutral' | 'warn';
  title: string;
  detail: string;
};

export type WhoopBleSnapshot = {
  hrvRmssdMs: number | null;
  restingHR: number | null;
  meanHR: number | null;
};

export type CombinedSnapshot = {
  health: DailyHealthSnapshot | null;
  whoop: {
    recovery: WhoopRecovery | null;
    sleep: WhoopSleep | null;
    cycle: WhoopCycle | null;
  };
  whoopBle?: WhoopBleSnapshot | null;
  fitbit: FitbitSnapshot | null;
  garmin: GarminSnapshot | null;
};

type Reading = { source: string; value: number };

function fmt(n: number | null | undefined, digits = 0, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

function pickBest(readings: Reading[]): Reading | null {
  return readings.find((r) => Number.isFinite(r.value)) ?? null;
}

function disagreement(readings: Reading[], threshold: number): Reading[] | null {
  const finite = readings.filter((r) => Number.isFinite(r.value));
  if (finite.length < 2) return null;
  const max = Math.max(...finite.map((r) => r.value));
  const min = Math.min(...finite.map((r) => r.value));
  return max - min >= threshold ? finite : null;
}

export type UnifiedView = {
  recovery: { value: number; source: string } | null;
  restingHR: Reading | null;
  hrvMs: Reading | null;
  sleepHours: Reading | null;
  sleepScore: Reading | null;
  steps: Reading | null;
  activeKcal: Reading | null;
  spo2: Reading | null;
  strainOrLoad: { value: number; source: string; scale: 'whoop-21' } | null;
  bodyBattery: number | null;
  stressAvg: number | null;
};

export function unify(snap: CombinedSnapshot): UnifiedView {
  const { health, whoop, fitbit, garmin } = snap;

  const recovery: UnifiedView['recovery'] = whoop.recovery
    ? { value: whoop.recovery.score.recovery_score, source: 'WHOOP' }
    : null;

  const whoopBle = snap.whoopBle ?? null;

  const restingHR = pickBest([
    whoop.recovery
      ? { source: 'WHOOP', value: whoop.recovery.score.resting_heart_rate }
      : { source: '', value: NaN },
    whoopBle?.restingHR != null
      ? { source: 'WHOOP strap', value: whoopBle.restingHR }
      : { source: '', value: NaN },
    garmin?.restingHR != null
      ? { source: 'Garmin', value: garmin.restingHR }
      : { source: '', value: NaN },
    fitbit?.heart.restingHR != null
      ? { source: 'Fitbit', value: fitbit.heart.restingHR }
      : { source: '', value: NaN },
    health?.restingHR != null
      ? { source: 'Apple Health', value: health.restingHR }
      : { source: '', value: NaN },
  ]);

  const hrvMs = pickBest([
    whoop.recovery?.score.hrv_rmssd_milli
      ? { source: 'WHOOP', value: whoop.recovery.score.hrv_rmssd_milli }
      : { source: '', value: NaN },
    whoopBle?.hrvRmssdMs != null
      ? { source: 'WHOOP strap', value: whoopBle.hrvRmssdMs }
      : { source: '', value: NaN },
    garmin?.hrvLastNightMs != null
      ? { source: 'Garmin', value: garmin.hrvLastNightMs }
      : { source: '', value: NaN },
    fitbit?.hrv.dailyRmssdMs != null
      ? { source: 'Fitbit', value: fitbit.hrv.dailyRmssdMs }
      : { source: '', value: NaN },
    health?.hrvMs != null ? { source: 'Apple Health', value: health.hrvMs } : { source: '', value: NaN },
  ]);

  const sleepHours = pickBest([
    whoop.sleep
      ? {
          source: 'WHOOP',
          value: whoop.sleep.score.stage_summary.total_in_bed_time_milli / 3_600_000,
        }
      : { source: '', value: NaN },
    garmin?.sleepHours != null
      ? { source: 'Garmin', value: garmin.sleepHours }
      : { source: '', value: NaN },
    fitbit?.sleep.asleepHours != null
      ? { source: 'Fitbit', value: fitbit.sleep.asleepHours }
      : { source: '', value: NaN },
    health?.sleepHours != null
      ? { source: 'Apple Health', value: health.sleepHours }
      : { source: '', value: NaN },
  ]);

  const sleepScore = pickBest([
    garmin?.sleepScore != null
      ? { source: 'Garmin', value: garmin.sleepScore }
      : { source: '', value: NaN },
    whoop.sleep
      ? { source: 'WHOOP', value: whoop.sleep.score.sleep_performance_percentage }
      : { source: '', value: NaN },
    fitbit?.sleep.scoreMaybe != null
      ? { source: 'Fitbit', value: fitbit.sleep.scoreMaybe }
      : { source: '', value: NaN },
  ]);

  const steps = pickBest([
    garmin?.steps != null ? { source: 'Garmin', value: garmin.steps } : { source: '', value: NaN },
    fitbit?.activity.steps != null
      ? { source: 'Fitbit', value: fitbit.activity.steps }
      : { source: '', value: NaN },
    health?.steps != null ? { source: 'Apple Health', value: health.steps } : { source: '', value: NaN },
  ]);

  const activeKcal = pickBest([
    garmin?.activeKcal != null
      ? { source: 'Garmin', value: garmin.activeKcal }
      : { source: '', value: NaN },
    fitbit?.activity.caloriesOut != null
      ? { source: 'Fitbit', value: fitbit.activity.caloriesOut }
      : { source: '', value: NaN },
    health?.activeEnergyKcal != null
      ? { source: 'Apple Health', value: health.activeEnergyKcal }
      : { source: '', value: NaN },
  ]);

  const spo2 = pickBest([
    fitbit?.spo2.averagePct != null
      ? { source: 'Fitbit', value: fitbit.spo2.averagePct }
      : { source: '', value: NaN },
    health?.spo2 != null ? { source: 'Apple Health', value: health.spo2 } : { source: '', value: NaN },
  ]);

  const strainOrLoad: UnifiedView['strainOrLoad'] = whoop.cycle?.score.strain != null
    ? { value: whoop.cycle.score.strain, source: 'WHOOP', scale: 'whoop-21' }
    : null;

  return {
    recovery,
    restingHR,
    hrvMs,
    sleepHours,
    sleepScore,
    steps,
    activeKcal,
    spo2,
    strainOrLoad,
    bodyBattery: garmin?.bodyBattery ?? null,
    stressAvg: garmin?.stressAvg ?? null,
  };
}

export function generateInsights(snap: CombinedSnapshot): Insight[] {
  const out: Insight[] = [];
  const u = unify(snap);

  if (u.recovery) {
    const r = u.recovery.value;
    if (r >= 67) {
      out.push({
        level: 'good',
        title: `Recovery ${r}% — green zone`,
        detail: `${u.recovery.source} says the body is ready for higher strain today.`,
      });
    } else if (r >= 34) {
      out.push({
        level: 'neutral',
        title: `Recovery ${r}% — yellow zone`,
        detail: `${u.recovery.source}: moderate readiness. Keep effort steady rather than maxing out.`,
      });
    } else {
      out.push({
        level: 'warn',
        title: `Recovery ${r}% — red zone`,
        detail: `${u.recovery.source}: low recovery. Prioritize easy movement, hydration, and sleep.`,
      });
    }
  } else if (snap.garmin?.bodyBattery != null) {
    const bb = snap.garmin.bodyBattery;
    const level = bb >= 70 ? 'good' : bb >= 40 ? 'neutral' : 'warn';
    out.push({
      level,
      title: `Body Battery ${bb} — Garmin readiness`,
      detail:
        bb >= 70
          ? 'Plenty of energy reserve. Good day for a hard session.'
          : bb >= 40
          ? 'Moderate reserves. Keep training intensity reasonable.'
          : 'Low reserves. Prioritize rest, food, and sleep.',
    });
  }

  const rhrReadings: Reading[] = [];
  if (snap.whoop.recovery)
    rhrReadings.push({ source: 'WHOOP', value: snap.whoop.recovery.score.resting_heart_rate });
  if (snap.garmin?.restingHR != null)
    rhrReadings.push({ source: 'Garmin', value: snap.garmin.restingHR });
  if (snap.fitbit?.heart.restingHR != null)
    rhrReadings.push({ source: 'Fitbit', value: snap.fitbit.heart.restingHR });
  if (snap.health?.restingHR != null)
    rhrReadings.push({ source: 'Apple Health', value: snap.health.restingHR });

  const rhrDisagree = disagreement(rhrReadings, 4);
  if (rhrDisagree) {
    out.push({
      level: 'neutral',
      title: 'Resting HR varies between devices',
      detail: rhrDisagree.map((r) => `${r.source}: ${Math.round(r.value)} bpm`).join('  •  '),
    });
  }

  const hrvReadings: Reading[] = [];
  if (snap.whoop.recovery?.score.hrv_rmssd_milli)
    hrvReadings.push({ source: 'WHOOP', value: snap.whoop.recovery.score.hrv_rmssd_milli });
  if (snap.garmin?.hrvLastNightMs != null)
    hrvReadings.push({ source: 'Garmin', value: snap.garmin.hrvLastNightMs });
  if (snap.fitbit?.hrv.dailyRmssdMs != null)
    hrvReadings.push({ source: 'Fitbit', value: snap.fitbit.hrv.dailyRmssdMs });
  if (snap.health?.hrvMs != null)
    hrvReadings.push({ source: 'Apple Health', value: snap.health.hrvMs });

  if (hrvReadings.length >= 2) {
    out.push({
      level: 'neutral',
      title: 'HRV across devices',
      detail: hrvReadings.map((r) => `${r.source}: ${Math.round(r.value)} ms`).join('  •  '),
    });
  }

  if (snap.whoop.sleep) {
    const inBedHrs = snap.whoop.sleep.score.stage_summary.total_in_bed_time_milli / 3_600_000;
    const neededHrs = snap.whoop.sleep.score.sleep_needed_milli / 3_600_000;
    const debt = neededHrs - inBedHrs;
    if (debt > 0.5) {
      out.push({
        level: 'warn',
        title: `Sleep debt ${fmt(debt, 1, ' h')}`,
        detail: `WHOOP says you needed ${fmt(neededHrs, 1, ' h')} but got ${fmt(inBedHrs, 1, ' h')}.`,
      });
    } else {
      out.push({
        level: 'good',
        title: `Sleep met need (${fmt(inBedHrs, 1, ' h')})`,
        detail: `WHOOP needed ${fmt(neededHrs, 1, ' h')}; you got ${fmt(inBedHrs, 1, ' h')}.`,
      });
    }
  } else if (u.sleepHours) {
    const hrs = u.sleepHours.value;
    if (hrs < 6) {
      out.push({
        level: 'warn',
        title: `Short sleep: ${fmt(hrs, 1, ' h')}`,
        detail: `${u.sleepHours.source}. Under 6 h typically degrades next-day strain tolerance and decision quality.`,
      });
    } else if (hrs > 9) {
      out.push({
        level: 'neutral',
        title: `Long sleep: ${fmt(hrs, 1, ' h')}`,
        detail: `${u.sleepHours.source}. Common with illness recovery or heavy training loads.`,
      });
    } else {
      out.push({
        level: 'good',
        title: `Sleep: ${fmt(hrs, 1, ' h')}`,
        detail: `${u.sleepHours.source}. In the typical adult target range.`,
      });
    }
  }

  if (u.strainOrLoad) {
    const s = u.strainOrLoad.value;
    if (s >= 18) {
      out.push({
        level: 'warn',
        title: `Strain ${fmt(s, 1)} — all-out day (WHOOP)`,
        detail: 'Heavy load. Recovery and fueling matter more than usual tonight.',
      });
    } else if (s >= 14) {
      out.push({
        level: 'neutral',
        title: `Strain ${fmt(s, 1)} — strenuous (WHOOP)`,
        detail: 'Solid workload — keep an eye on sleep and HRV tomorrow.',
      });
    } else if (s >= 10) {
      out.push({
        level: 'good',
        title: `Strain ${fmt(s, 1)} — moderate (WHOOP)`,
        detail: 'Productive day without overreaching.',
      });
    }
  }

  if (snap.garmin?.intenseMinutes != null) {
    const mi = snap.garmin.intenseMinutes;
    if (mi >= 30) {
      out.push({
        level: 'good',
        title: `${mi} intensity minutes (Garmin)`,
        detail: 'Above the 22 min/day floor that corresponds to WHO 150 min/week.',
      });
    }
  }

  if (snap.garmin?.stressAvg != null && snap.garmin.stressAvg >= 60) {
    out.push({
      level: 'warn',
      title: `Average stress ${snap.garmin.stressAvg} (Garmin)`,
      detail: 'Garmin classes 50–75 as high. Consider a breathing or short-walk break.',
    });
  }

  if (u.steps) {
    const s = u.steps.value;
    if (s >= 10000) {
      out.push({
        level: 'good',
        title: `${Math.round(s).toLocaleString()} steps (${u.steps.source})`,
        detail: 'Hit a classic daily step benchmark.',
      });
    } else if (s < 4000) {
      out.push({
        level: 'warn',
        title: `${Math.round(s).toLocaleString()} steps so far (${u.steps.source})`,
        detail: 'Mostly sedentary day. A 10–15 min walk would lift this materially.',
      });
    }
  }

  if (u.spo2 && u.spo2.value < 92) {
    out.push({
      level: 'warn',
      title: `Low SpO₂: ${u.spo2.value.toFixed(0)}% (${u.spo2.source})`,
      detail: 'Consumer devices have meaningful error margins; if persistent, talk to a clinician.',
    });
  }

  if (out.length === 0) {
    out.push({
      level: 'neutral',
      title: 'No data yet',
      detail:
        'Grant Apple Health permission and connect at least one of WHOOP, Fitbit, or Garmin to start seeing insights.',
    });
  }

  return out;
}
