/**
 * Local, transparent HRV and heart-rate analytics.
 *
 * Every function here is pure — it takes a series of samples and returns a
 * number. Nothing calls the WHOOP cloud, an AI model, or a proprietary
 * algorithm. Consumers pipe R-R intervals collected in `lib/whoop-store.ts`
 * (which in turn come from the strap's standard Bluetooth Heart Rate
 * characteristic) into these functions.
 *
 * References (all published, non-proprietary):
 *  - Task Force of the European Society of Cardiology and the North American
 *    Society of Pacing and Electrophysiology, "Heart rate variability:
 *    Standards of measurement, physiological interpretation, and clinical
 *    use," Circulation 93(5):1043–1065, 1996. Defines RMSSD and SDNN.
 *  - Malik, M., "Errors and Misconceptions in ECG Measurement Used for the
 *    Detection of Heart Rate Variability," J Electrocardiol 31(Suppl):
 *    111–120, 1998. Basis for the ectopic-filter used here (drop any beat
 *    whose R-R differs from the running median by more than a threshold).
 *
 * Pulse Nexus is not a medical device; treat every value here as an
 * approximation, not clinical data.
 */

export type RrPoint = { ts: number; rrMs: number };
export type HrPoint = { ts: number; bpm: number };

const PHYSIOLOGICAL_MIN_MS = 300;
const PHYSIOLOGICAL_MAX_MS = 2000;

const DEFAULT_ECTOPIC_TOLERANCE = 0.2;

/**
 * Drop R-R values that fall outside a physiologically plausible window,
 * then drop any interval that differs from a running local median by more
 * than `tolerance` (default 20%, per Malik 1998). Preserves order.
 */
export function filterEctopics(
  rr: readonly number[],
  tolerance = DEFAULT_ECTOPIC_TOLERANCE,
): number[] {
  const cleaned: number[] = [];
  const recent: number[] = [];
  const RECENT_WINDOW = 5;

  for (const value of rr) {
    if (!Number.isFinite(value)) continue;
    if (value < PHYSIOLOGICAL_MIN_MS || value > PHYSIOLOGICAL_MAX_MS) continue;

    if (recent.length === 0) {
      cleaned.push(value);
      recent.push(value);
      continue;
    }

    const local = median(recent);
    const deviation = Math.abs(value - local) / local;
    if (deviation <= tolerance) {
      cleaned.push(value);
      recent.push(value);
      if (recent.length > RECENT_WINDOW) recent.shift();
    }
  }

  return cleaned;
}

/**
 * RMSSD — Root Mean Square of Successive Differences.
 * Task Force 1996 §5.2.2. Reflects short-term (vagal / parasympathetic)
 * variability. Requires at least two adjacent R-R intervals; returns null
 * otherwise. Result is in milliseconds.
 */
export function computeRMSSD(cleanedRr: readonly number[]): number | null {
  if (cleanedRr.length < 2) return null;
  let sumSq = 0;
  let n = 0;
  for (let i = 1; i < cleanedRr.length; i++) {
    const diff = cleanedRr[i] - cleanedRr[i - 1];
    sumSq += diff * diff;
    n += 1;
  }
  if (n === 0) return null;
  return Math.sqrt(sumSq / n);
}

/**
 * SDNN — Standard Deviation of N-N intervals.
 * Task Force 1996 §5.2.1. Reflects overall variability across the window.
 */
export function computeSDNN(cleanedRr: readonly number[]): number | null {
  if (cleanedRr.length < 2) return null;
  const mean = cleanedRr.reduce((s, v) => s + v, 0) / cleanedRr.length;
  let sumSq = 0;
  for (const v of cleanedRr) {
    const d = v - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (cleanedRr.length - 1));
}

/**
 * Mean R-R interval in ms. Convert to bpm with `60_000 / meanRr`.
 */
export function meanRr(cleanedRr: readonly number[]): number | null {
  if (cleanedRr.length === 0) return null;
  return cleanedRr.reduce((s, v) => s + v, 0) / cleanedRr.length;
}

/**
 * Instantaneous HRV summary for the current session. Runs the ectopic
 * filter and returns RMSSD, SDNN, sample counts, and a mean-RR-derived
 * heart rate.
 */
export function computeHrvSummary(
  rr: readonly number[],
  opts: { tolerance?: number } = {},
): {
  rmssdMs: number | null;
  sdnnMs: number | null;
  meanHr: number | null;
  cleanedCount: number;
  droppedCount: number;
} {
  const cleaned = filterEctopics(rr, opts.tolerance);
  const rmssdMs = computeRMSSD(cleaned);
  const sdnnMs = computeSDNN(cleaned);
  const mean = meanRr(cleaned);
  const meanHr = mean ? 60_000 / mean : null;
  return {
    rmssdMs,
    sdnnMs,
    meanHr,
    cleanedCount: cleaned.length,
    droppedCount: rr.length - cleaned.length,
  };
}

/**
 * Rolling-window HRV. Feeds a stream of R-R intervals into a fixed-length
 * ring; every incoming R-R updates RMSSD from the last `windowSize` samples.
 * Cheap to update (O(windowSize) per step), so it's safe to call on every
 * BLE heart-rate notification.
 */
export class RollingHrv {
  private buffer: number[] = [];

  constructor(private windowSize = 60) {}

  push(rrMs: number): void {
    if (!Number.isFinite(rrMs) || rrMs < PHYSIOLOGICAL_MIN_MS || rrMs > PHYSIOLOGICAL_MAX_MS) {
      return;
    }
    this.buffer.push(rrMs);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
  }

  reset(): void {
    this.buffer = [];
  }

  rmssdMs(): number | null {
    return computeRMSSD(filterEctopics(this.buffer));
  }

  size(): number {
    return this.buffer.length;
  }
}

/**
 * Estimated resting heart rate.
 *
 * Uses the standard wearable heuristic: the 5th percentile of the recent
 * bpm distribution while awake, requiring a minimum sample count so a
 * handful of low readings can't skew it. This is a conservative estimate
 * of true resting HR (which is defined as measured shortly after waking).
 */
export function estimateRestingHr(
  samples: readonly HrPoint[],
  opts: { percentile?: number; minSamples?: number } = {},
): number | null {
  const percentile = opts.percentile ?? 5;
  const minSamples = opts.minSamples ?? 60;
  const values = samples
    .map((s) => s.bpm)
    .filter((v) => Number.isFinite(v) && v > 30 && v < 220)
    .sort((a, b) => a - b);
  if (values.length < minSamples) return null;
  const index = Math.floor((percentile / 100) * values.length);
  return values[Math.max(0, Math.min(values.length - 1, index))];
}

/**
 * Mean heart rate across the sample set (weighted equally per sample; the
 * HR characteristic notifies at roughly a fixed cadence, so this is a
 * reasonable proxy for time-weighted mean).
 */
export function meanHeartRate(samples: readonly HrPoint[]): number | null {
  const valid = samples.filter((s) => Number.isFinite(s.bpm) && s.bpm > 30 && s.bpm < 220);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v.bpm, 0) / valid.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
