/**
 * File picking + reading for the WHOOP export import.
 *
 * Kept separate from `lib/whoop-import.ts` (the pure parser) so the parsing
 * logic can be unit-tested without pulling in Expo native modules.
 *
 * Supports:
 *  - a WHOOP export .zip (unzipped in-app with fflate), or
 *  - one or more individual .csv files a user already extracted.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { unzipSync, strFromU8 } from 'fflate';

import {
  mergeParsed,
  parseWhoopCsv,
  type ParsedWhoopExport,
} from './whoop-import';
import {
  getHistoryCounts,
  recordImport,
  upsertWhoopHistory,
  type ImportSummary,
} from './whoop-store';

function base64ToU8(b64: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let outIdx = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | table.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (acc >> bits) & 0xff;
    }
  }
  return out.slice(0, outIdx);
}

async function readParts(uri: string, name: string): Promise<Partial<ParsedWhoopExport>[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToU8(b64);
    const entries = unzipSync(bytes, {
      filter: (f) => f.name.toLowerCase().endsWith('.csv'),
    });
    return Object.entries(entries).map(([entryName, data]) =>
      parseWhoopCsv(entryName, strFromU8(data)),
    );
  }
  // Plain CSV
  const text = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return [parseWhoopCsv(name, text)];
}

export type ImportResult = ImportSummary & {
  earliestTs: number | null;
  totalCycles: number;
  totalSleeps: number;
  totalWorkouts: number;
};

/**
 * Present the OS document picker, read the chosen WHOOP export (zip or one
 * or more CSVs), parse it, and upsert into the local store. Returns a
 * summary, or null if the user cancelled.
 */
export async function pickAndImportWhoopExport(): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: ['text/csv', 'text/comma-separated-values', 'application/zip', 'application/octet-stream', '*/*'],
  });
  if (result.canceled || result.assets.length === 0) return null;

  const parts: Partial<ParsedWhoopExport>[] = [];
  for (const asset of result.assets) {
    const got = await readParts(asset.uri, asset.name ?? 'export.csv');
    parts.push(...got);
  }

  const parsed = mergeParsed(parts);
  const total =
    parsed.cycles.length + parsed.sleeps.length + parsed.workouts.length;
  if (total === 0) {
    throw new Error(
      "Couldn't find WHOOP data in that file. Pick your WHOOP export .zip, or the physiological_cycles.csv / sleeps.csv / workouts.csv files inside it.",
    );
  }

  await upsertWhoopHistory(parsed);
  await recordImport({
    source: 'WHOOP export',
    cycles: parsed.cycles.length,
    sleeps: parsed.sleeps.length,
    workouts: parsed.workouts.length,
  });

  const counts = await getHistoryCounts();
  return {
    source: 'WHOOP export',
    importedAt: Date.now(),
    cycles: parsed.cycles.length,
    sleeps: parsed.sleeps.length,
    workouts: parsed.workouts.length,
    earliestTs: counts.earliestTs,
    totalCycles: counts.cycles,
    totalSleeps: counts.sleeps,
    totalWorkouts: counts.workouts,
  };
}
