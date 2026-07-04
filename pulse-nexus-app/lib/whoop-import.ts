/**
 * WHOOP account-export importer.
 *
 * WHOOP lets you export your entire account history from the web app
 * (Settings → Data Export). You get a .zip containing:
 *   - physiological_cycles.csv  (per-day recovery, HRV, resting HR, strain)
 *   - sleeps.csv                (per-night performance, efficiency, durations)
 *   - workouts.csv              (per-activity strain, HR, energy, distance)
 *   - journal_entries.csv       (behaviours; not imported yet)
 *
 * This importer moves that full history into the local SQLite store so it
 * shows up on the dashboard, Sleep tab, and Workouts tab — with no WHOOP
 * account, cloud API, or subscription needed at run time. It is the
 * reliable "all data from all time" path.
 *
 * The CSV parsing and field mapping are pure functions (no Expo / RN
 * imports) so they can be unit-tested off-device. File picking and reading
 * live in the picker/reader functions at the bottom.
 *
 * WHOOP has renamed export columns over the years, so field lookup is
 * tolerant: each field matches the first header containing any of a set of
 * candidate substrings (case-insensitive).
 */
import type {
  WhoopCycleRow,
  WhoopSleepRow,
  WhoopWorkoutRow,
} from './whoop-store';

export type ParsedWhoopExport = {
  cycles: WhoopCycleRow[];
  sleeps: WhoopSleepRow[];
  workouts: WhoopWorkoutRow[];
};

const SOURCE = 'WHOOP export';

// ────────────────────────────────────────────────────────────────
// CSV parsing (pure)
// ────────────────────────────────────────────────────────────────

/** Parse CSV text into headers + rows, honouring double-quoted fields. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, ''); // strip BOM
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    if (record.length > 1 || record[0] !== '') records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers: headers.map((h) => h.trim()), rows };
}

function columnFinder(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase());
  return (candidates: string[]): number => {
    for (const cand of candidates) {
      const needle = cand.toLowerCase();
      const idx = lower.findIndex((h) => h.includes(needle));
      if (idx >= 0) return idx;
    }
    return -1;
  };
}

function numAt(row: string[], idx: number): number | null {
  if (idx < 0) return null;
  const raw = (row[idx] ?? '').replace(/[%,]/g, '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function strAt(row: string[], idx: number): string {
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

/** Parse a WHOOP timestamp; supports ISO and "YYYY-MM-DD HH:MM:SS" forms. */
export function parseWhoopTs(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  let ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    // "YYYY-MM-DD HH:MM:SS" without a T
    ms = Date.parse(raw.replace(' ', 'T'));
  }
  return Number.isNaN(ms) ? null : ms;
}

// ────────────────────────────────────────────────────────────────
// Field mapping (pure)
// ────────────────────────────────────────────────────────────────

export function parseCyclesCsv(text: string): WhoopCycleRow[] {
  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const find = columnFinder(headers);
  const startIdx = find(['cycle start time', 'cycle start', 'start time', 'start']);
  const endIdx = find(['cycle end time', 'cycle end', 'end time', 'end']);
  const recoveryIdx = find(['recovery score', 'recovery']);
  const rhrIdx = find(['resting heart rate', 'resting hr']);
  const hrvIdx = find(['heart rate variability', 'hrv']);
  const strainIdx = find(['day strain', 'strain']);
  const avgHrIdx = find(['average heart rate', 'avg hr', 'average hr']);

  const out: WhoopCycleRow[] = [];
  for (const row of rows) {
    const startTs = parseWhoopTs(strAt(row, startIdx));
    if (startTs == null) continue;
    out.push({
      cycleId: `cycle-${startTs}`,
      startTs,
      endTs: parseWhoopTs(strAt(row, endIdx)),
      recoveryScore: numAt(row, recoveryIdx),
      restingHr: numAt(row, rhrIdx),
      hrvRmssdMs: numAt(row, hrvIdx),
      strain: numAt(row, strainIdx),
      avgHr: numAt(row, avgHrIdx),
      source: SOURCE,
    });
  }
  return out;
}

export function parseSleepsCsv(text: string): WhoopSleepRow[] {
  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const find = columnFinder(headers);
  const startIdx = find(['sleep onset', 'start time', 'cycle start time', 'start']);
  const endIdx = find(['wake onset', 'end time', 'cycle end time', 'end']);
  const perfIdx = find(['sleep performance']);
  const effIdx = find(['sleep efficiency']);
  const neededIdx = find(['sleep needed', 'sleep need']);
  const inBedIdx = find(['in bed duration', 'time in bed']);
  const asleepIdx = find(['asleep duration', 'total sleep', 'time asleep']);
  const respIdx = find(['respiratory rate']);

  const out: WhoopSleepRow[] = [];
  for (const row of rows) {
    const startTs = parseWhoopTs(strAt(row, startIdx));
    const endTs = parseWhoopTs(strAt(row, endIdx));
    if (startTs == null || endTs == null) continue;
    out.push({
      sleepId: `sleep-${startTs}`,
      startTs,
      endTs,
      performancePct: numAt(row, perfIdx),
      efficiencyPct: numAt(row, effIdx),
      neededMs: minutesToMs(numAt(row, neededIdx)),
      inBedMs: minutesToMs(numAt(row, inBedIdx)),
      asleepMs: minutesToMs(numAt(row, asleepIdx)),
      respiratoryRate: numAt(row, respIdx),
      source: SOURCE,
    });
  }
  return out;
}

export function parseWorkoutsCsv(text: string): WhoopWorkoutRow[] {
  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const find = columnFinder(headers);
  const startIdx = find(['workout start time', 'start time', 'start']);
  const endIdx = find(['workout end time', 'end time', 'end']);
  const typeIdx = find(['activity name', 'activity', 'sport', 'type']);
  const strainIdx = find(['activity strain', 'strain']);
  const avgHrIdx = find(['average hr', 'average heart rate', 'avg hr']);
  const maxHrIdx = find(['max hr', 'max heart rate']);
  const energyIdx = find(['energy burned', 'calories', 'kilojoule']);
  const distanceIdx = find(['distance']);

  const out: WhoopWorkoutRow[] = [];
  for (const row of rows) {
    const startTs = parseWhoopTs(strAt(row, startIdx));
    const endTs = parseWhoopTs(strAt(row, endIdx));
    if (startTs == null || endTs == null) continue;
    const energy = numAt(row, energyIdx);
    const energyIsCal =
      energyIdx >= 0 && !headers[energyIdx].toLowerCase().includes('kilojoule');
    out.push({
      workoutId: `workout-${startTs}`,
      startTs,
      endTs,
      type: strAt(row, typeIdx) || 'Workout',
      strain: numAt(row, strainIdx),
      avgHr: numAt(row, avgHrIdx),
      maxHr: numAt(row, maxHrIdx),
      // Store kilojoules; if the column is calories, convert (1 cal ≈ 4.184 kJ).
      kilojoules: energy == null ? null : energyIsCal ? energy * 4.184 : energy,
      distanceMeters: numAt(row, distanceIdx),
      source: SOURCE,
    });
  }
  return out;
}

function minutesToMs(min: number | null): number | null {
  return min == null ? null : Math.round(min * 60_000);
}

/** Classify a CSV by its header row and parse into the right record type. */
export function parseWhoopCsv(filename: string, text: string): Partial<ParsedWhoopExport> {
  const name = filename.toLowerCase();
  const header = text.slice(0, 2000).toLowerCase();

  if (name.includes('workout') || header.includes('activity strain')) {
    return { workouts: parseWorkoutsCsv(text) };
  }
  if (name.includes('sleep') || header.includes('sleep performance')) {
    return { sleeps: parseSleepsCsv(text) };
  }
  if (
    name.includes('physiological') ||
    name.includes('cycle') ||
    header.includes('recovery score') ||
    header.includes('day strain')
  ) {
    return { cycles: parseCyclesCsv(text) };
  }
  return {};
}

export function mergeParsed(parts: Partial<ParsedWhoopExport>[]): ParsedWhoopExport {
  const merged: ParsedWhoopExport = { cycles: [], sleeps: [], workouts: [] };
  for (const p of parts) {
    if (p.cycles) merged.cycles.push(...p.cycles);
    if (p.sleeps) merged.sleeps.push(...p.sleeps);
    if (p.workouts) merged.workouts.push(...p.workouts);
  }
  return merged;
}
