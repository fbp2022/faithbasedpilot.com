/**
 * Plain-text snapshot builders.
 *
 * These produce deterministic, human-readable strings that can be
 *  - injected into the in-app Coach as system context, OR
 *  - handed off to the *external* ChatGPT / Claude / Grok app via the
 *    iOS Share Sheet so those apps can answer questions about the data.
 *
 * Everything here is rule-based — no model in the loop. The output is
 * intentionally compact so the user's chosen AI gets the maximum signal
 * within a small prompt budget.
 */
import { unify, type CombinedSnapshot } from './assistant';
import { formatHM, type SleepSnapshot } from './sleep';
import type { Workout } from './workouts';

function bullet(k: string, v: string | null): string | null {
  return v == null ? null : `- ${k}: ${v}`;
}

function dashOrNumber(n: number | null | undefined, digits = 0, suffix = ''): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${n.toFixed(digits)}${suffix}`;
}

export function buildDashboardSnapshotText(snap: CombinedSnapshot): string {
  const u = unify(snap);
  const lines: string[] = ['Pulse Nexus — current snapshot:', ''];
  const push = (k: string, v: string | null) => {
    const b = bullet(k, v);
    if (b) lines.push(b);
  };

  push('Recovery', u.recovery ? `${u.recovery.value}% (${u.recovery.source})` : null);
  push(
    'Resting HR',
    u.restingHR ? `${Math.round(u.restingHR.value)} bpm (${u.restingHR.source})` : null,
  );
  push('HRV', u.hrvMs ? `${Math.round(u.hrvMs.value)} ms (${u.hrvMs.source})` : null);
  push(
    'Sleep last night',
    u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h (${u.sleepHours.source})` : null,
  );
  push(
    'Sleep score',
    u.sleepScore ? `${Math.round(u.sleepScore.value)} (${u.sleepScore.source})` : null,
  );
  push(
    'Strain (WHOOP)',
    u.strainOrLoad ? `${u.strainOrLoad.value.toFixed(1)} / 21` : null,
  );
  push('Body Battery (Garmin)', u.bodyBattery != null ? String(u.bodyBattery) : null);
  push('Stress avg (Garmin)', u.stressAvg != null ? String(u.stressAvg) : null);
  push(
    'Steps today',
    u.steps ? `${Math.round(u.steps.value).toLocaleString()} (${u.steps.source})` : null,
  );
  push(
    'Active kcal today',
    u.activeKcal
      ? `${Math.round(u.activeKcal.value).toLocaleString()} (${u.activeKcal.source})`
      : null,
  );
  push('SpO₂', u.spo2 ? `${u.spo2.value.toFixed(0)}% (${u.spo2.source})` : null);

  if (lines.length === 2) {
    lines.push('- (no live metrics available)');
  }

  return lines.join('\n');
}

export function buildSleepSnapshotText(primary: SleepSnapshot | null, perSource: SleepSnapshot[]): string {
  const lines: string[] = ['Pulse Nexus — last night sleep:', ''];
  if (!primary) {
    lines.push('- No sleep recorded yet.');
    return lines.join('\n');
  }

  lines.push(`Primary source: ${primary.source}`);
  lines.push(`- Asleep: ${formatHM(primary.asleepMs)}`);
  lines.push(`- In bed: ${formatHM(primary.inBedMs)}`);
  const efficiency = dashOrNumber(primary.efficiencyPct, 0, '%');
  if (efficiency) lines.push(`- Efficiency: ${efficiency}`);
  const score = dashOrNumber(primary.scorePct, 0);
  if (score) lines.push(`- Sleep score: ${score}`);
  lines.push(
    `- Stages: Deep ${formatHM(primary.stages.deep)}, REM ${formatHM(primary.stages.rem)}, Light ${formatHM(primary.stages.light)}, Awake ${formatHM(primary.stages.awake)}`,
  );
  if (primary.needMs != null) {
    const debt = Math.max(0, primary.needMs - primary.asleepMs);
    lines.push(`- Need: ${formatHM(primary.needMs)} (debt ${formatHM(debt)})`);
  }
  const resp = dashOrNumber(primary.avgRespRate, 1, ' br/min');
  if (resp) lines.push(`- Respiration: ${resp}`);

  if (perSource.length > 1) {
    lines.push('', 'Per device:');
    for (const s of perSource) {
      lines.push(
        `- ${s.source}: ${formatHM(s.asleepMs)} asleep, eff ${s.efficiencyPct ?? '—'}%, score ${s.scorePct ?? '—'}`,
      );
    }
  }

  return lines.join('\n');
}

export function buildWorkoutsSnapshotText(workouts: Workout[], windowDays: number): string {
  const lines: string[] = [`Pulse Nexus — workouts (last ${windowDays} days):`, ''];
  if (workouts.length === 0) {
    lines.push('- No workouts in this window.');
    return lines.join('\n');
  }

  for (const w of workouts.slice(0, 30)) {
    const date = new Date(w.start).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const parts: string[] = [
      `${date} · ${w.type} (${w.source})`,
      `${Math.round(w.durationMin)} min`,
    ];
    if (w.distanceKm != null) parts.push(`${w.distanceKm.toFixed(2)} km`);
    if (w.calories != null) parts.push(`${Math.round(w.calories)} kcal`);
    if (w.avgHR != null) parts.push(`avg HR ${Math.round(w.avgHR)}`);
    if (w.maxHR != null) parts.push(`max HR ${Math.round(w.maxHR)}`);
    if (w.strainOrLoad != null) parts.push(`strain ${w.strainOrLoad.toFixed(1)}`);
    lines.push(`- ${parts.join(' · ')}`);
  }

  const totals = workouts.reduce(
    (acc, w) => {
      acc.duration += w.durationMin;
      acc.distance += w.distanceKm ?? 0;
      acc.calories += w.calories ?? 0;
      return acc;
    },
    { duration: 0, distance: 0, calories: 0 },
  );
  lines.push(
    '',
    `Totals: ${workouts.length} workouts · ${Math.round(totals.duration)} min · ${totals.distance.toFixed(1)} km · ${Math.round(totals.calories).toLocaleString()} kcal`,
  );

  return lines.join('\n');
}

const PROMPT_HEADER = (context: string) =>
  `Below is a snapshot of my recent health and training data from the Pulse Nexus app (which combines Apple Health, WHOOP, Fitbit, and Garmin). Please read it and help me understand what it means, what to do today, and what to watch.\n\nAvoid medical claims; suggest consulting a clinician for anything concerning.\n\n--- BEGIN PULSE NEXUS DATA ---\n${context}\n--- END PULSE NEXUS DATA ---\n\nMy question:`;

export function wrapForExternalAI(snapshotText: string): string {
  return PROMPT_HEADER(snapshotText);
}
