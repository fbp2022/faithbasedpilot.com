/**
 * Local SQLite store for WHOOP-strap-over-Bluetooth samples.
 *
 * Every reading the strap emits on the standard Bluetooth Heart Rate
 * characteristic (0x2A37) — the current bpm and, when present, the R-R
 * intervals since the last packet — is persisted here. This is what lets
 * Pulse Nexus compute HRV, resting HR, and rolling HR statistics locally,
 * with no WHOOP account and no WHOOP cloud.
 *
 * Schema (versioned; migrate in a single transaction on open):
 *  - hr_sample(ts INTEGER PK, bpm INTEGER NOT NULL)
 *  - rr_interval(ts INTEGER, rr_ms INTEGER NOT NULL, seq INTEGER,
 *                PRIMARY KEY(ts, seq))
 *
 * The `ts` column is Unix milliseconds — the same clock as `Date.now()`
 * on the phone the strap is paired to. Multiple R-R intervals sharing
 * the same `ts` (one HR notification can carry a handful of R-R values)
 * are disambiguated by a monotonically-increasing `seq` per notification.
 *
 * Data is bounded by pruning anything older than a configurable window
 * (default: 14 days, matches WHOOP's own on-strap buffer). All I/O is
 * async so it never blocks the render thread.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pulsenexus.db';
const SCHEMA_VERSION = 2;

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type HrSample = { ts: number; bpm: number };
export type RrSample = { ts: number; rrMs: number };

/**
 * Historical WHOOP records. These are populated from a WHOOP account export
 * (CSV / ZIP) and, in a later stage, from the strap's own encrypted history
 * offload. Timestamps are Unix ms. Rows are keyed by their natural day /
 * session id so re-importing the same export is idempotent (INSERT OR
 * REPLACE).
 */
export type WhoopCycleRow = {
  cycleId: string;
  startTs: number;
  endTs: number | null;
  recoveryScore: number | null;
  restingHr: number | null;
  hrvRmssdMs: number | null;
  strain: number | null;
  avgHr: number | null;
  source: string;
};

export type WhoopSleepRow = {
  sleepId: string;
  startTs: number;
  endTs: number;
  performancePct: number | null;
  efficiencyPct: number | null;
  neededMs: number | null;
  inBedMs: number | null;
  asleepMs: number | null;
  respiratoryRate: number | null;
  source: string;
};

export type WhoopWorkoutRow = {
  workoutId: string;
  startTs: number;
  endTs: number;
  type: string;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kilojoules: number | null;
  distanceMeters: number | null;
  source: string;
};

export type ImportSummary = {
  source: string;
  importedAt: number;
  cycles: number;
  sleeps: number;
  workouts: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hr_sample (
        ts   INTEGER PRIMARY KEY,
        bpm  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rr_interval (
        ts    INTEGER NOT NULL,
        seq   INTEGER NOT NULL,
        rr_ms INTEGER NOT NULL,
        PRIMARY KEY (ts, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_rr_ts ON rr_interval(ts);

      CREATE TABLE IF NOT EXISTS whoop_cycle (
        cycle_id       TEXT PRIMARY KEY,
        start_ts       INTEGER NOT NULL,
        end_ts         INTEGER,
        recovery_score REAL,
        resting_hr     REAL,
        hrv_rmssd_ms   REAL,
        strain         REAL,
        avg_hr         REAL,
        source         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cycle_start ON whoop_cycle(start_ts);

      CREATE TABLE IF NOT EXISTS whoop_sleep (
        sleep_id        TEXT PRIMARY KEY,
        start_ts        INTEGER NOT NULL,
        end_ts          INTEGER NOT NULL,
        performance_pct REAL,
        efficiency_pct  REAL,
        needed_ms       INTEGER,
        in_bed_ms       INTEGER,
        asleep_ms       INTEGER,
        respiratory_rate REAL,
        source          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sleep_start ON whoop_sleep(start_ts);

      CREATE TABLE IF NOT EXISTS whoop_workout (
        workout_id      TEXT PRIMARY KEY,
        start_ts        INTEGER NOT NULL,
        end_ts          INTEGER NOT NULL,
        type            TEXT NOT NULL,
        strain          REAL,
        avg_hr          REAL,
        max_hr          REAL,
        kilojoules      REAL,
        distance_meters REAL,
        source          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workout_start ON whoop_workout(start_ts);

      CREATE TABLE IF NOT EXISTS whoop_import (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source      TEXT NOT NULL,
        imported_at INTEGER NOT NULL,
        cycles      INTEGER NOT NULL,
        sleeps      INTEGER NOT NULL,
        workouts    INTEGER NOT NULL
      );
    `);
    const versionRow = await db
      .getFirstAsync<{ version: number }>('SELECT version FROM schema_version LIMIT 1')
      .catch(() => null);
    if (!versionRow) {
      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', SCHEMA_VERSION);
    } else if (versionRow.version < SCHEMA_VERSION) {
      // Tables above are created with IF NOT EXISTS, so bumping the version
      // just records that this device has the v2 history tables.
      await db.runAsync('UPDATE schema_version SET version = ?', SCHEMA_VERSION);
    }
    return db;
  })();
  return dbPromise;
}

/**
 * Persist a single BLE Heart Rate notification: one HR reading and zero or
 * more R-R intervals. Called from the BLE client's HR subscription.
 */
export async function recordHrPacket(
  ts: number,
  bpm: number,
  rrIntervalsMs: number[] | undefined,
): Promise<void> {
  const db = await getDb();
  const rounded = Math.round(ts);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO hr_sample (ts, bpm) VALUES (?, ?)',
      rounded,
      Math.round(bpm),
    );
    if (rrIntervalsMs && rrIntervalsMs.length > 0) {
      for (let i = 0; i < rrIntervalsMs.length; i++) {
        const value = rrIntervalsMs[i];
        if (!Number.isFinite(value) || value <= 0) continue;
        await db.runAsync(
          'INSERT OR REPLACE INTO rr_interval (ts, seq, rr_ms) VALUES (?, ?, ?)',
          rounded,
          i,
          Math.round(value),
        );
      }
    }
  });
}

export async function pruneOldSamples(cutoffMs = Date.now() - RETENTION_MS): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM hr_sample WHERE ts < ?', cutoffMs);
    await db.runAsync('DELETE FROM rr_interval WHERE ts < ?', cutoffMs);
  });
}

export async function getRecentRrIntervals(windowMs: number): Promise<RrSample[]> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const rows = await db.getAllAsync<{ ts: number; rr_ms: number }>(
    'SELECT ts, rr_ms FROM rr_interval WHERE ts >= ? ORDER BY ts ASC',
    since,
  );
  return rows.map((r) => ({ ts: r.ts, rrMs: r.rr_ms }));
}

export async function getRecentHrSamples(windowMs: number): Promise<HrSample[]> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const rows = await db.getAllAsync<{ ts: number; bpm: number }>(
    'SELECT ts, bpm FROM hr_sample WHERE ts >= ? ORDER BY ts ASC',
    since,
  );
  return rows;
}

export async function getHrSampleCount(windowMs = RETENTION_MS): Promise<number> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM hr_sample WHERE ts >= ?',
    since,
  );
  return row?.n ?? 0;
}

export async function getRrSampleCount(windowMs = RETENTION_MS): Promise<number> {
  const db = await getDb();
  const since = Date.now() - windowMs;
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rr_interval WHERE ts >= ?',
    since,
  );
  return row?.n ?? 0;
}

export async function clearWhoopStore(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM hr_sample');
    await db.runAsync('DELETE FROM rr_interval');
  });
}

// ────────────────────────────────────────────────────────────────
// Historical records (WHOOP export import + future strap offload)
// ────────────────────────────────────────────────────────────────

/**
 * Bulk-write cycles / sleeps / workouts in one transaction. Idempotent:
 * re-importing the same export replaces existing rows by their id, so a
 * second import doesn't duplicate history.
 */
export async function upsertWhoopHistory(records: {
  cycles?: WhoopCycleRow[];
  sleeps?: WhoopSleepRow[];
  workouts?: WhoopWorkoutRow[];
}): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const c of records.cycles ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO whoop_cycle
           (cycle_id, start_ts, end_ts, recovery_score, resting_hr, hrv_rmssd_ms, strain, avg_hr, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.cycleId,
        c.startTs,
        c.endTs,
        c.recoveryScore,
        c.restingHr,
        c.hrvRmssdMs,
        c.strain,
        c.avgHr,
        c.source,
      );
    }
    for (const s of records.sleeps ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO whoop_sleep
           (sleep_id, start_ts, end_ts, performance_pct, efficiency_pct, needed_ms, in_bed_ms, asleep_ms, respiratory_rate, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.sleepId,
        s.startTs,
        s.endTs,
        s.performancePct,
        s.efficiencyPct,
        s.neededMs,
        s.inBedMs,
        s.asleepMs,
        s.respiratoryRate,
        s.source,
      );
    }
    for (const w of records.workouts ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO whoop_workout
           (workout_id, start_ts, end_ts, type, strain, avg_hr, max_hr, kilojoules, distance_meters, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        w.workoutId,
        w.startTs,
        w.endTs,
        w.type,
        w.strain,
        w.avgHr,
        w.maxHr,
        w.kilojoules,
        w.distanceMeters,
        w.source,
      );
    }
  });
}

export async function recordImport(summary: Omit<ImportSummary, 'importedAt'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO whoop_import (source, imported_at, cycles, sleeps, workouts) VALUES (?, ?, ?, ?, ?)',
    summary.source,
    Date.now(),
    summary.cycles,
    summary.sleeps,
    summary.workouts,
  );
}

export async function getLatestImport(): Promise<ImportSummary | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    source: string;
    imported_at: number;
    cycles: number;
    sleeps: number;
    workouts: number;
  }>('SELECT source, imported_at, cycles, sleeps, workouts FROM whoop_import ORDER BY imported_at DESC LIMIT 1');
  if (!row) return null;
  return {
    source: row.source,
    importedAt: row.imported_at,
    cycles: row.cycles,
    sleeps: row.sleeps,
    workouts: row.workouts,
  };
}

export async function getLatestCycle(): Promise<WhoopCycleRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, number | string | null>>(
    'SELECT * FROM whoop_cycle ORDER BY start_ts DESC LIMIT 1',
  );
  return row ? mapCycle(row) : null;
}

/** Newest cycle that actually carries a recovery score (skips e.g. Apple Health rows). */
export async function getLatestCycleWithRecovery(): Promise<WhoopCycleRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, number | string | null>>(
    'SELECT * FROM whoop_cycle WHERE recovery_score IS NOT NULL ORDER BY start_ts DESC LIMIT 1',
  );
  return row ? mapCycle(row) : null;
}

/** Newest cycle that actually carries a strain value. */
export async function getLatestCycleWithStrain(): Promise<WhoopCycleRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, number | string | null>>(
    'SELECT * FROM whoop_cycle WHERE strain IS NOT NULL ORDER BY start_ts DESC LIMIT 1',
  );
  return row ? mapCycle(row) : null;
}

export async function getLatestSleep(): Promise<WhoopSleepRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, number | string | null>>(
    'SELECT * FROM whoop_sleep ORDER BY start_ts DESC LIMIT 1',
  );
  return row ? mapSleep(row) : null;
}

export async function getWorkoutsSince(sinceTs: number): Promise<WhoopWorkoutRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, number | string | null>>(
    'SELECT * FROM whoop_workout WHERE start_ts >= ? ORDER BY start_ts DESC',
    sinceTs,
  );
  return rows.map(mapWorkout);
}

export async function getHistoryCounts(): Promise<{
  cycles: number;
  sleeps: number;
  workouts: number;
  earliestTs: number | null;
}> {
  const db = await getDb();
  const c = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM whoop_cycle');
  const s = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM whoop_sleep');
  const w = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM whoop_workout');
  const e = await db.getFirstAsync<{ ts: number | null }>(
    'SELECT MIN(start_ts) AS ts FROM whoop_cycle',
  );
  return {
    cycles: c?.n ?? 0,
    sleeps: s?.n ?? 0,
    workouts: w?.n ?? 0,
    earliestTs: e?.ts ?? null,
  };
}

export async function clearWhoopHistory(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM whoop_cycle');
    await db.runAsync('DELETE FROM whoop_sleep');
    await db.runAsync('DELETE FROM whoop_workout');
    await db.runAsync('DELETE FROM whoop_import');
  });
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapCycle(r: Record<string, number | string | null>): WhoopCycleRow {
  return {
    cycleId: String(r.cycle_id),
    startTs: Number(r.start_ts),
    endTs: num(r.end_ts),
    recoveryScore: num(r.recovery_score),
    restingHr: num(r.resting_hr),
    hrvRmssdMs: num(r.hrv_rmssd_ms),
    strain: num(r.strain),
    avgHr: num(r.avg_hr),
    source: String(r.source),
  };
}

function mapSleep(r: Record<string, number | string | null>): WhoopSleepRow {
  return {
    sleepId: String(r.sleep_id),
    startTs: Number(r.start_ts),
    endTs: Number(r.end_ts),
    performancePct: num(r.performance_pct),
    efficiencyPct: num(r.efficiency_pct),
    neededMs: num(r.needed_ms),
    inBedMs: num(r.in_bed_ms),
    asleepMs: num(r.asleep_ms),
    respiratoryRate: num(r.respiratory_rate),
    source: String(r.source),
  };
}

function mapWorkout(r: Record<string, number | string | null>): WhoopWorkoutRow {
  return {
    workoutId: String(r.workout_id),
    startTs: Number(r.start_ts),
    endTs: Number(r.end_ts),
    type: String(r.type),
    strain: num(r.strain),
    avgHr: num(r.avg_hr),
    maxHr: num(r.max_hr),
    kilojoules: num(r.kilojoules),
    distanceMeters: num(r.distance_meters),
    source: String(r.source),
  };
}
