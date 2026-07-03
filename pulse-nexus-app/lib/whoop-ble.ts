/**
 * Direct WHOOP-strap-over-Bluetooth client.
 *
 * Speaks to the strap directly with no WHOOP account and no WHOOP cloud —
 * inspired by NoopApp/noop's local-first architecture. This file implements
 * the pieces that work without an encrypted GATT bond:
 *
 *  - Scanning for straps that advertise either
 *      * the standard Bluetooth Heart Rate service (0x180D), which every
 *        current WHOOP strap exposes, and/or
 *      * WHOOP's own service families (WHOOP 4.0: 61080001-…,
 *        WHOOP 5.0 / MG: fd4b0001-…).
 *  - Connecting to a chosen strap and subscribing to the standard Heart Rate
 *    Measurement characteristic (0x2A37), which streams live HR at ~1 Hz.
 *  - Persisting the paired strap's BLE identifier so we can auto-reconnect
 *    on next launch.
 *
 * Deeper metrics (recovery, HRV RMSSD/SDNN, strain, sleep) require decoding
 * WHOOP's own encrypted frames on top of a proper GATT bond, which is a
 * separate stage of work. This file exposes hooks for that stage but does
 * not implement the frame parser itself — it only owns the connection life
 * cycle and the live-HR stream.
 *
 * References (protocol facts only — no source code copied):
 *  - `johnmiddleton12/my-whoop` — documented WHOOP 4.0 BLE service tree
 *  - `b-nnett/goose` — documented WHOOP 5.0 / MG BLE service tree
 *  - Bluetooth SIG Heart Rate Service (0x180D) + HR Measurement (0x2A37)
 *
 * Not affiliated with WHOOP, Inc. This client only reads from a device the
 * user physically owns.
 */
import { Platform } from 'react-native';
import { BleManager, type Device, State, type Subscription } from 'react-native-ble-plx';

import { deleteSecret, getSecret, setSecret } from './storage';
import { RollingHrv } from './whoop-analytics';
import { pruneOldSamples, recordHrPacket } from './whoop-store';

// Public Bluetooth SIG UUIDs (128-bit form).
const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_CHAR_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_CHAR_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

// WHOOP proprietary service UUIDs (documented in the community projects
// referenced above). We use them for scan hints only — actually reading
// from them requires a GATT bond and frame decoding, which is a later
// stage. Kept here so the scanner recognises straps even when they aren't
// advertising the standard HR service at the moment.
export const WHOOP_4_SERVICE_UUID = '61080001-8d6d-82b8-614a-1c8cb0f8dcc6';
export const WHOOP_5_SERVICE_UUID = 'fd4b0001-b8e5-40b6-b6e5-fd4b0001b8e5';

const PAIRED_DEVICE_KEY = 'whoop.ble.deviceId';
const PAIRED_DEVICE_NAME_KEY = 'whoop.ble.deviceName';
const PAIRED_DEVICE_FAMILY_KEY = 'whoop.ble.deviceFamily';

export type WhoopFamily = 'whoop4' | 'whoop5' | 'unknown';

export type StrapAdvertisement = {
  id: string;
  name: string;
  rssi: number | null;
  family: WhoopFamily;
  hasHeartRateService: boolean;
};

export type StrapConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type LiveHR = {
  bpm: number;
  timestamp: number;
  energyExpendedKj?: number;
  rrIntervalsMs?: number[];
};

type Listener = (v: LiveHR) => void;
type StateListener = (s: StrapConnectionState, error?: string) => void;

class WhoopBleClient {
  private manager = new BleManager();
  private device: Device | null = null;
  private hrSubscription: Subscription | null = null;
  private stateSub: Subscription | null = null;
  private hrListeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private lastHR: LiveHR | null = null;
  private state: StrapConnectionState = 'disconnected';
  private lastError: string | null = null;
  private rollingHrv = new RollingHrv(60);
  private lastPruneAt = 0;

  destroy(): void {
    this.stopScan();
    this.disconnect().catch(() => {});
    this.stateSub?.remove();
    this.manager.destroy();
  }

  getState(): StrapConnectionState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLastHR(): LiveHR | null {
    return this.lastHR;
  }

  /**
   * Current rolling RMSSD (ms), computed from the most recent ~60 R-R
   * intervals the strap has emitted this session. Returns null until we
   * have at least a couple of clean beats. This is a *session* HRV — for
   * a longer-horizon value use the store-backed helper in `lib/whoop.ts`.
   */
  getRollingRmssdMs(): number | null {
    return this.rollingHrv.rmssdMs();
  }

  onHR(fn: Listener): () => void {
    this.hrListeners.add(fn);
    return () => this.hrListeners.delete(fn);
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    fn(this.state, this.lastError ?? undefined);
    return () => this.stateListeners.delete(fn);
  }

  async ensurePoweredOn(timeoutMs = 8000): Promise<void> {
    if (Platform.OS === 'web') {
      throw new Error('Bluetooth is not available on web.');
    }
    const current = await this.manager.state();
    if (current === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.remove();
        reject(new Error('Bluetooth is not powered on. Turn Bluetooth on in Settings and try again.'));
      }, timeoutMs);
      const sub = this.manager.onStateChange((s) => {
        if (s === State.PoweredOn) {
          clearTimeout(timer);
          sub.remove();
          resolve();
        } else if (s === State.Unsupported) {
          clearTimeout(timer);
          sub.remove();
          reject(new Error('This device does not support Bluetooth Low Energy.'));
        }
      }, true);
    });
  }

  async scan(
    onDiscover: (ad: StrapAdvertisement) => void,
    timeoutMs = 12_000,
  ): Promise<void> {
    await this.ensurePoweredOn();
    this.stopScan();
    this.setState('scanning');

    const seen = new Set<string>();
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) {
        this.setState('error', err.message);
        this.stopScan();
        return;
      }
      if (!device || !device.id || seen.has(device.id)) return;

      const advertisedServices = new Set(
        (device.serviceUUIDs ?? []).map((s) => s.toLowerCase()),
      );
      const family = detectFamily(device.name ?? '', advertisedServices);
      const hasHr = advertisedServices.has(HR_SERVICE_UUID);
      const likelyStrap =
        family !== 'unknown' ||
        looksLikeWhoopName(device.name) ||
        (hasHr && looksLikeWhoopName(device.name));

      if (!likelyStrap) return;

      seen.add(device.id);
      onDiscover({
        id: device.id,
        name: device.name ?? 'Unknown strap',
        rssi: device.rssi ?? null,
        family,
        hasHeartRateService: hasHr,
      });
    });

    setTimeout(() => {
      if (this.state === 'scanning') {
        this.stopScan();
        this.setState('disconnected');
      }
    }, timeoutMs);
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
  }

  async pair(deviceId: string, deviceName?: string, family?: WhoopFamily): Promise<void> {
    await this.ensurePoweredOn();
    this.stopScan();
    this.setState('connecting');

    try {
      const device = await this.manager.connectToDevice(deviceId, {
        requestMTU: 185,
        timeout: 12_000,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.device = device;

      device.onDisconnected((err) => {
        this.hrSubscription?.remove();
        this.hrSubscription = null;
        this.device = null;
        this.setState(err ? 'reconnecting' : 'disconnected', err?.message);
        if (err) {
          this.reconnect().catch(() => {});
        }
      });

      await this.subscribeToHeartRate(device);

      await setSecret(PAIRED_DEVICE_KEY, deviceId);
      if (deviceName) await setSecret(PAIRED_DEVICE_NAME_KEY, deviceName);
      if (family) await setSecret(PAIRED_DEVICE_FAMILY_KEY, family);

      this.setState('connected');
    } catch (e) {
      this.device = null;
      const message = e instanceof Error ? e.message : String(e);
      this.setState('error', message);
      throw e;
    }
  }

  async reconnect(): Promise<boolean> {
    const savedId = await getSecret(PAIRED_DEVICE_KEY);
    if (!savedId) return false;

    const savedName = (await getSecret(PAIRED_DEVICE_NAME_KEY)) ?? undefined;
    const savedFamily = ((await getSecret(PAIRED_DEVICE_FAMILY_KEY)) as WhoopFamily | null) ?? 'unknown';

    try {
      await this.pair(savedId, savedName, savedFamily);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(forget = false): Promise<void> {
    this.hrSubscription?.remove();
    this.hrSubscription = null;
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id).catch(() => {});
      this.device = null;
    }
    if (forget) {
      await deleteSecret(PAIRED_DEVICE_KEY);
      await deleteSecret(PAIRED_DEVICE_NAME_KEY);
      await deleteSecret(PAIRED_DEVICE_FAMILY_KEY);
    }
    this.setState('disconnected');
  }

  async getPairedDevice(): Promise<{ id: string; name: string | null; family: WhoopFamily } | null> {
    const id = await getSecret(PAIRED_DEVICE_KEY);
    if (!id) return null;
    const name = await getSecret(PAIRED_DEVICE_NAME_KEY);
    const family = ((await getSecret(PAIRED_DEVICE_FAMILY_KEY)) as WhoopFamily | null) ?? 'unknown';
    return { id, name, family };
  }

  private async subscribeToHeartRate(device: Device): Promise<void> {
    this.hrSubscription = device.monitorCharacteristicForService(
      HR_SERVICE_UUID,
      HR_MEASUREMENT_CHAR_UUID,
      (err, characteristic) => {
        if (err) {
          this.setState('error', err.message);
          return;
        }
        const raw = characteristic?.value;
        if (!raw) return;
        const parsed = parseHrMeasurement(base64ToBytes(raw));
        if (!parsed) return;
        const ts = Date.now();
        this.lastHR = { ...parsed, timestamp: ts };
        for (const l of this.hrListeners) l(this.lastHR);

        if (parsed.rrIntervalsMs) {
          for (const rr of parsed.rrIntervalsMs) this.rollingHrv.push(rr);
        }

        // Fire-and-forget persistence — never blocks the BLE callback.
        recordHrPacket(ts, parsed.bpm, parsed.rrIntervalsMs).catch(() => {});
        if (ts - this.lastPruneAt > 15 * 60 * 1000) {
          this.lastPruneAt = ts;
          pruneOldSamples().catch(() => {});
        }
      },
    );
  }

  private setState(next: StrapConnectionState, error?: string): void {
    this.state = next;
    this.lastError = error ?? null;
    for (const l of this.stateListeners) l(next, this.lastError ?? undefined);
  }
}

/**
 * Parse a Bluetooth Heart Rate Measurement (0x2A37) payload.
 * Flag byte layout (Bluetooth SIG spec):
 *  bit 0: 0 = HR is uint8, 1 = HR is uint16
 *  bit 1: sensor contact bit meaningful
 *  bit 2: sensor contact detected
 *  bit 3: energy expended present
 *  bit 4: RR interval(s) present
 */
export function parseHrMeasurement(bytes: Uint8Array): Omit<LiveHR, 'timestamp'> | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const hrIs16 = (flags & 0x01) === 0x01;
  const hasEnergy = (flags & 0x08) === 0x08;
  const hasRR = (flags & 0x10) === 0x10;

  let idx = 1;
  let bpm = 0;
  if (hrIs16) {
    if (bytes.length < 3) return null;
    bpm = bytes[idx] | (bytes[idx + 1] << 8);
    idx += 2;
  } else {
    bpm = bytes[idx];
    idx += 1;
  }
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return null;

  let energyExpendedKj: number | undefined;
  if (hasEnergy && idx + 2 <= bytes.length) {
    energyExpendedKj = bytes[idx] | (bytes[idx + 1] << 8);
    idx += 2;
  }

  const rrIntervalsMs: number[] = [];
  if (hasRR) {
    while (idx + 2 <= bytes.length) {
      const raw = bytes[idx] | (bytes[idx + 1] << 8);
      rrIntervalsMs.push((raw / 1024) * 1000);
      idx += 2;
    }
  }

  return {
    bpm,
    energyExpendedKj,
    rrIntervalsMs: rrIntervalsMs.length ? rrIntervalsMs : undefined,
  };
}

function detectFamily(name: string, services: Set<string>): WhoopFamily {
  if (services.has(WHOOP_4_SERVICE_UUID)) return 'whoop4';
  if (services.has(WHOOP_5_SERVICE_UUID)) return 'whoop5';
  const n = name.toLowerCase();
  if (n.includes('whoop 5') || n.includes('whoop mg') || n.startsWith('whp5')) return 'whoop5';
  if (n.includes('whoop 4') || n.startsWith('whp4') || n.startsWith('whoop')) return 'whoop4';
  return 'unknown';
}

function looksLikeWhoopName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('whoop') || n.startsWith('whp');
}

function base64ToBytes(b64: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let outIdx = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    const v = c === 43 ? 62 : c === 47 ? 63 : table.indexOf(clean.charAt(i));
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (acc >> bits) & 0xff;
    }
  }
  return out.slice(0, outIdx);
}

// Singleton — the app only ever talks to one strap at a time, and the BLE
// stack is process-wide anyway.
let singleton: WhoopBleClient | null = null;

export function getWhoopBle(): WhoopBleClient {
  if (!singleton) singleton = new WhoopBleClient();
  return singleton;
}

export async function isWhoopStrapPaired(): Promise<boolean> {
  return (await getSecret(PAIRED_DEVICE_KEY)) !== null;
}

export async function forgetWhoopStrap(): Promise<void> {
  await getWhoopBle().disconnect(true);
}
