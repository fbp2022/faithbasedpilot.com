import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  forgetWhoopStrap,
  getWhoopBle,
  type LiveHR,
  type OffloadStatus,
  type StrapAdvertisement,
  type StrapConnectionState,
} from '@/lib/whoop-ble';
import { pickAndImportWhoopExport, type ImportResult } from '@/lib/whoop-import-file';
import { importAppleHealthHistory } from '@/lib/apple-health-history';
import { getHistoryCounts } from '@/lib/whoop-store';

const colors = {
  bg: '#0b0f14',
  bgElevated: '#0f1522',
  bgCard: '#141b2a',
  bgCardMuted: '#1a2333',
  border: '#1f2a3d',
  borderStrong: '#2a3752',
  text: '#f2f5fa',
  textMuted: '#8fa3bd',
  textDim: '#5f7590',
  accent: '#4ac6ff',
  accentGlow: 'rgba(74, 198, 255, 0.18)',
  positive: '#3ddc97',
  warn: '#ffb454',
  danger: '#ff6b6b',
} as const;

const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 28 } as const;

const FAMILY_LABEL = {
  whoop4: 'WHOOP 4.0',
  whoop5: 'WHOOP 5.0 / MG',
  unknown: 'WHOOP-compatible strap',
} as const;

const STATE_COPY: Record<StrapConnectionState, { label: string; color: string; hint: string }> = {
  disconnected: {
    label: 'Not connected',
    color: colors.textMuted,
    hint: 'Tap Scan to find your WHOOP strap over Bluetooth.',
  },
  scanning: {
    label: 'Scanning…',
    color: colors.accent,
    hint: 'Looking for nearby WHOOP straps advertising over Bluetooth.',
  },
  connecting: {
    label: 'Pairing…',
    color: colors.accent,
    hint: 'Negotiating a Bluetooth connection with the strap.',
  },
  connected: {
    label: 'Connected',
    color: colors.positive,
    hint: 'Live heart rate is streaming from the strap.',
  },
  reconnecting: {
    label: 'Reconnecting…',
    color: colors.warn,
    hint: 'Lost the strap briefly — trying to bring the link back.',
  },
  error: {
    label: 'Error',
    color: colors.danger,
    hint: 'Something went wrong. See the message below and try again.',
  },
};

export default function WhoopConnectScreen() {
  const router = useRouter();
  const ble = getWhoopBle();

  const [state, setState] = useState<StrapConnectionState>(ble.getState());
  const [error, setError] = useState<string | null>(ble.getLastError());
  const [devices, setDevices] = useState<StrapAdvertisement[]>([]);
  const [liveHR, setLiveHR] = useState<LiveHR | null>(ble.getLastHR());
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [offload, setOffloadStatus] = useState<OffloadStatus>(ble.getOffloadStatus());
  const [history, setHistory] = useState<{ cycles: number; sleeps: number; workouts: number; earliestTs: number | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [ahImporting, setAhImporting] = useState(false);
  const [ahResult, setAhResult] = useState<string | null>(null);
  const scanCancelledRef = useRef(false);

  const refreshPaired = useCallback(async () => {
    const paired = await ble.getPairedDevice();
    setPairedName(paired?.name ?? null);
  }, [ble]);

  const refreshHistory = useCallback(async () => {
    const counts = await getHistoryCounts().catch(() => null);
    if (counts) setHistory(counts);
  }, []);

  useEffect(() => {
    refreshPaired();
    refreshHistory();
    const offState = ble.onState((s, err) => {
      setState(s);
      setError(err ?? null);
      refreshPaired();
    });
    const offHR = ble.onHR((hr) => setLiveHR(hr));
    const offOffload = ble.onOffload((s) => setOffloadStatus(s));
    return () => {
      offState();
      offHR();
      offOffload();
    };
  }, [ble, refreshPaired, refreshHistory]);

  const importExport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await pickAndImportWhoopExport();
      if (result) {
        setImportResult(result);
        await refreshHistory();
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [refreshHistory]);

  const syncStrapHistory = useCallback(async () => {
    await ble.offloadHistory();
    await refreshHistory();
  }, [ble, refreshHistory]);

  const importFromAppleHealth = useCallback(async () => {
    setAhImporting(true);
    setAhResult(null);
    setImportError(null);
    try {
      const r = await importAppleHealthHistory(365);
      setAhResult(
        `Pulled ${r.cycles} days, ${r.sleeps} nights, and ${r.workouts} workouts from Apple Health.`,
      );
      await refreshHistory();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setAhImporting(false);
    }
  }, [refreshHistory]);

  const scan = useCallback(async () => {
    setDevices([]);
    setError(null);
    scanCancelledRef.current = false;
    try {
      await ble.scan((ad) => {
        if (scanCancelledRef.current) return;
        setDevices((prev) => (prev.some((p) => p.id === ad.id) ? prev : [...prev, ad]));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ble]);

  const stopScan = useCallback(() => {
    scanCancelledRef.current = true;
    ble.stopScan();
  }, [ble]);

  const pair = useCallback(
    async (ad: StrapAdvertisement) => {
      stopScan();
      try {
        await ble.pair(ad.id, ad.name, ad.family);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [ble, stopScan],
  );

  const forget = useCallback(() => {
    Alert.alert(
      'Forget this strap?',
      'Pulse Nexus will disconnect and stop trying to reach it. You can pair it again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await forgetWhoopStrap();
            setDevices([]);
            setLiveHR(null);
          },
        },
      ],
    );
  }, []);

  const isBusy = state === 'scanning' || state === 'connecting' || state === 'reconnecting';
  const isConnected = state === 'connected';

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.iconChip}>
            <Ionicons name="bluetooth" size={22} color={colors.accent} />
          </View>
          <Text style={styles.h1}>Pair your WHOOP strap</Text>
          <Text style={styles.p}>
            Pulse Nexus talks to your strap directly over Bluetooth — no WHOOP account, no
            subscription, no cloud. Live heart rate streams as soon as you pair. Deeper metrics
            (recovery, HRV, sleep) roll out in a follow-up build.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHead}>
            <View style={[styles.dot, { backgroundColor: STATE_COPY[state].color }]} />
            <Text style={[styles.statusLabel, { color: STATE_COPY[state].color }]}>
              {STATE_COPY[state].label}
            </Text>
            {isBusy ? (
              <ActivityIndicator color={STATE_COPY[state].color} style={{ marginLeft: 'auto' }} />
            ) : null}
          </View>
          <Text style={styles.statusHint}>{STATE_COPY[state].hint}</Text>

          {isConnected && liveHR ? (
            <View style={styles.liveHR}>
              <Text style={styles.liveHRLabel}>Live heart rate</Text>
              <View style={styles.liveHRRow}>
                <Ionicons name="heart" size={20} color={colors.danger} />
                <Text style={styles.liveHRValue}>{Math.round(liveHR.bpm)}</Text>
                <Text style={styles.liveHRUnit}>bpm</Text>
              </View>
              {liveHR.rrIntervalsMs && liveHR.rrIntervalsMs.length > 0 ? (
                <Text style={styles.liveHRRR}>
                  RR: {liveHR.rrIntervalsMs.map((v) => v.toFixed(0)).join(' ')} ms
                </Text>
              ) : null}
              {pairedName ? <Text style={styles.pairedName}>{pairedName}</Text> : null}
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        {isConnected ? (
          <View style={{ gap: spacing.sm }}>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => ble.disconnect()}>
              <Ionicons name="power" size={16} color={colors.text} />
              <Text style={styles.btnSecondaryText}>Disconnect</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={forget}>
              <Ionicons name="trash" size={16} color={colors.danger} />
              <Text style={styles.btnDangerText}>Forget strap</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {state === 'scanning' ? (
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={stopScan}>
                <Ionicons name="stop-circle" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Stop scanning</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={scan} disabled={isBusy}>
                <Ionicons name="bluetooth" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Scan for straps</Text>
              </Pressable>
            )}

            {pairedName ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => ble.reconnect()}
                disabled={isBusy}
              >
                <Ionicons name="refresh" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Reconnect to {pairedName}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {devices.length > 0 ? (
          <>
            <Text style={styles.section}>Nearby straps</Text>
            {devices.map((d) => (
              <Pressable key={d.id} style={styles.deviceRow} onPress={() => pair(d)} disabled={isBusy}>
                <View style={styles.deviceIconChip}>
                  <Ionicons name="bluetooth" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <Text style={styles.deviceMeta}>
                    {FAMILY_LABEL[d.family]}
                    {d.rssi != null ? `  ·  ${d.rssi} dBm` : ''}
                    {d.hasHeartRateService ? '  ·  HR ready' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>Bring in all your WHOOP history</Text>
        <View style={styles.historyCard}>
          <Text style={styles.historyBlurb}>
            Export your full WHOOP account history from the WHOOP app (Settings → Data Export)
            and import the .zip here. Everything moves onto this device — recovery, sleep, and
            workouts from day one — with no WHOOP account needed afterwards.
          </Text>

          {history && (history.cycles > 0 || history.sleeps > 0 || history.workouts > 0) ? (
            <View style={styles.historyStats}>
              <HistoryStat label="Days" value={history.cycles} />
              <HistoryStat label="Nights" value={history.sleeps} />
              <HistoryStat label="Workouts" value={history.workouts} />
            </View>
          ) : null}

          {history?.earliestTs ? (
            <Text style={styles.historySince}>
              History since {new Date(history.earliestTs).toLocaleDateString()}
            </Text>
          ) : null}

          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={importExport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Import WHOOP export</Text>
              </>
            )}
          </Pressable>

          {importResult ? (
            <Text style={styles.importOk}>
              Imported {importResult.cycles} days, {importResult.sleeps} nights, and{' '}
              {importResult.workouts} workouts.
            </Text>
          ) : null}

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <Text style={styles.historyBlurb}>
            Already sync WHOOP to Apple Health? Pull that data straight in — no export file
            needed. Reads HRV, resting heart rate, respiratory rate, sleep, and workouts.
          </Text>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={importFromAppleHealth}
            disabled={ahImporting}
          >
            {ahImporting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="heart-circle" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Import from Apple Health</Text>
              </>
            )}
          </Pressable>
          {ahResult ? <Text style={styles.importOk}>{ahResult}</Text> : null}

          {importError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{importError}</Text>
            </View>
          ) : null}
        </View>

        {isConnected ? (
          <>
            <Text style={styles.section}>Sync from the strap</Text>
            <View style={styles.historyCard}>
              <Text style={styles.historyBlurb}>
                Pull the last ~14 days the strap stores on-device, straight over Bluetooth.
              </Text>
              {offload.phase === 'unsupported' ? (
                <View style={styles.hintBox}>
                  <Ionicons name="information-circle" size={16} color={colors.warn} />
                  <Text style={styles.hintText}>{offload.reason}</Text>
                </View>
              ) : offload.phase === 'offloading' ? (
                <Text style={styles.historySince}>
                  Offloading… {offload.pagesDone}
                  {offload.pagesTotal ? ` / ${offload.pagesTotal}` : ''} pages
                </Text>
              ) : offload.phase === 'done' ? (
                <Text style={styles.importOk}>Synced {offload.framesDecoded} records from the strap.</Text>
              ) : offload.phase === 'error' ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{offload.message}</Text>
                </View>
              ) : null}
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={syncStrapHistory}>
                <Ionicons name="sync" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Sync strap history</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={styles.tips}>
          Only one device holds the strap&apos;s Bluetooth bond at a time. If pairing fails,
          fully quit the official WHOOP app on any phone that&apos;s currently connected, then
          scan again from here.
        </Text>

        <Pressable style={styles.close} onPress={() => router.back()}>
          <Text style={styles.closeText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.historyStat}>
      <Text style={styles.historyStatValue}>{value.toLocaleString()}</Text>
      <Text style={styles.historyStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },

  hero: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  p: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },

  statusCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  statusHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },

  liveHR: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveHRLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  liveHRRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 },
  liveHRValue: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '800',
    marginLeft: spacing.sm,
    letterSpacing: -1,
    lineHeight: 44,
  },
  liveHRUnit: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 6,
    marginBottom: 8,
    fontWeight: '600',
  },
  liveHRRR: { color: colors.textDim, fontSize: 11, marginTop: 4, fontVariant: ['tabular-nums'] },
  pairedName: { color: colors.textDim, fontSize: 12, marginTop: 4 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.danger}14`,
    borderRadius: radii.md,
    borderLeftColor: colors.danger,
    borderLeftWidth: 3,
    gap: spacing.sm as unknown as number,
  },
  errorText: { color: colors.text, fontSize: 12, lineHeight: 18, marginLeft: spacing.sm, flex: 1 },

  btn: {
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm as unknown as number,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  btnSecondary: {
    backgroundColor: colors.bgCardMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '600', marginLeft: 6 },
  btnDanger: {
    backgroundColor: `${colors.danger}14`,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
  },
  btnDangerText: { color: colors.danger, fontSize: 14, fontWeight: '600', marginLeft: 6 },

  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: -spacing.sm,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md as unknown as number,
  },
  deviceIconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deviceName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  deviceMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  tips: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  close: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  closeText: { color: colors.accent, fontWeight: '700' },

  historyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md as unknown as number,
  },
  historyBlurb: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  historyStats: { flexDirection: 'row', justifyContent: 'space-around' },
  historyStat: { alignItems: 'center' },
  historyStatValue: {
    color: colors.accent,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  historyStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginTop: 2,
  },
  historySince: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  importOk: { color: colors.positive, fontSize: 13, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm as unknown as number },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    marginHorizontal: spacing.sm,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: `${colors.warn}14`,
    borderRadius: radii.md,
    borderLeftColor: colors.warn,
    borderLeftWidth: 3,
    gap: spacing.sm as unknown as number,
  },
  hintText: { color: colors.text, fontSize: 12, lineHeight: 18, marginLeft: spacing.sm, flex: 1 },
});
