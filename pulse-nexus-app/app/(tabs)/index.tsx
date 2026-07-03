import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MetricCard } from '@/components/MetricCard';
import { InsightCard } from '@/components/InsightCard';
import { LiveHRCard } from '@/components/LiveHRCard';
import { AskExternalAIButton } from '@/components/AskExternalAI';
import { buildDashboardSnapshotText } from '@/lib/snapshot-text';
import { getWhoopBle } from '@/lib/whoop-ble';
import {
  getTodaySnapshot,
  requestHealthPermissions,
  type DailyHealthSnapshot,
} from '@/lib/healthkit';
import {
  getLatestWhoopCycle,
  getLatestWhoopRecovery,
  getLatestWhoopSleep,
  getWhoopHrvOverWindow,
  getWhoopRestingHr,
  hasWhoopData,
  isWhoopConnected,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from '@/lib/whoop';
import { getFitbitSnapshot, isFitbitConnected, type FitbitSnapshot } from '@/lib/fitbit';
import { getGarminSnapshot, isGarminConnected, type GarminSnapshot } from '@/lib/garmin';
import {
  generateInsights,
  unify,
  type CombinedSnapshot,
  type WhoopBleSnapshot,
} from '@/lib/assistant';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  type DashboardCardKey,
  type Preferences,
} from '@/lib/preferences';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  const [health, setHealth] = useState<DailyHealthSnapshot | null>(null);
  const [whoop, setWhoop] = useState<{
    recovery: WhoopRecovery | null;
    sleep: WhoopSleep | null;
    cycle: WhoopCycle | null;
  }>({ recovery: null, sleep: null, cycle: null });
  const [fitbit, setFitbit] = useState<FitbitSnapshot | null>(null);
  const [garmin, setGarmin] = useState<GarminSnapshot | null>(null);
  const [whoopBle, setWhoopBle] = useState<WhoopBleSnapshot | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loadedPrefs] = await Promise.all([
        loadPreferences(),
        requestHealthPermissions().catch(() => {}),
      ]);
      setPrefs(loadedPrefs);

      const [whoopConnected, whoopHasData, fitbitConnected, garminConnected] = await Promise.all([
        isWhoopConnected(),
        hasWhoopData(),
        isFitbitConnected(),
        isGarminConnected(),
      ]);

      const [h, whoopData, fitbitData, garminData, whoopBleData] = await Promise.all([
        getTodaySnapshot().catch(() => null),
        whoopHasData
          ? Promise.all([
              getLatestWhoopRecovery().catch(() => null),
              getLatestWhoopSleep().catch(() => null),
              getLatestWhoopCycle().catch(() => null),
            ]).then(([recovery, sleep, cycle]) => ({ recovery, sleep, cycle }))
          : Promise.resolve({ recovery: null, sleep: null, cycle: null }),
        fitbitConnected ? getFitbitSnapshot().catch(() => null) : Promise.resolve(null),
        garminConnected ? getGarminSnapshot().catch(() => null) : Promise.resolve(null),
        whoopConnected
          ? Promise.all([
              getWhoopHrvOverWindow(24).catch(() => null),
              getWhoopRestingHr(24).catch(() => null),
            ]).then<WhoopBleSnapshot>(([hrv, resting]) => ({
              hrvRmssdMs: hrv?.rmssdMs ?? null,
              restingHR: resting,
              meanHR: hrv?.meanHr ?? null,
            }))
          : Promise.resolve<WhoopBleSnapshot | null>(null),
      ]);

      setHealth(h);
      setWhoop(whoopData);
      setFitbit(fitbitData);
      setGarmin(garminData);
      setWhoopBle(whoopBleData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    getWhoopBle()
      .reconnect()
      .catch(() => {});
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const combined: CombinedSnapshot = { health, whoop, whoopBle, fitbit, garmin };
  const u = unify(combined);
  const insights = generateInsights(combined);

  const enabled = (k: DashboardCardKey) => prefs.dashboardCards[k];

  const cards: Array<{ key: DashboardCardKey; label: string; value: string; sub?: string }> = [];
  if (enabled('steps'))
    cards.push({
      key: 'steps',
      label: 'Steps',
      value: u.steps ? Math.round(u.steps.value).toLocaleString() : '—',
      sub: u.steps?.source,
    });
  if (enabled('activeKcal'))
    cards.push({
      key: 'activeKcal',
      label: 'Active kcal',
      value: u.activeKcal ? Math.round(u.activeKcal.value).toLocaleString() : '—',
      sub: u.activeKcal?.source,
    });
  if (enabled('restingHR'))
    cards.push({
      key: 'restingHR',
      label: 'Resting HR',
      value: u.restingHR ? `${Math.round(u.restingHR.value)} bpm` : '—',
      sub: u.restingHR?.source,
    });
  if (enabled('hrvMs'))
    cards.push({
      key: 'hrvMs',
      label: 'HRV',
      value: u.hrvMs ? `${Math.round(u.hrvMs.value)} ms` : '—',
      sub: u.hrvMs?.source,
    });
  if (enabled('recovery'))
    cards.push({
      key: 'recovery',
      label: 'Recovery',
      value: u.recovery ? `${u.recovery.value}%` : '—',
      sub: u.recovery?.source ?? 'Connect WHOOP',
    });
  if (enabled('sleep'))
    cards.push({
      key: 'sleep',
      label: 'Sleep',
      value: u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h` : '—',
      sub: u.sleepHours?.source,
    });
  if (enabled('strain'))
    cards.push({
      key: 'strain',
      label: 'Strain',
      value: u.strainOrLoad ? u.strainOrLoad.value.toFixed(1) : '—',
      sub: u.strainOrLoad?.source,
    });
  if (enabled('bodyBattery'))
    cards.push({
      key: 'bodyBattery',
      label: 'Body Battery',
      value: u.bodyBattery != null ? String(u.bodyBattery) : '—',
      sub: u.bodyBattery != null ? 'Garmin' : 'Connect Garmin',
    });
  if (enabled('spo2'))
    cards.push({
      key: 'spo2',
      label: 'SpO₂',
      value: u.spo2 ? `${u.spo2.value.toFixed(0)}%` : '—',
      sub: u.spo2?.source,
    });
  if (enabled('stress'))
    cards.push({
      key: 'stress',
      label: 'Stress',
      value: u.stressAvg != null ? String(u.stressAvg) : '—',
      sub: u.stressAvg != null ? 'Garmin' : 'Connect Garmin',
    });

  const rows: Array<typeof cards> = [];
  for (let i = 0; i < cards.length; i += 2) rows.push(cards.slice(i, i + 2));

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.pageTitle}>Today</Text>
              <AskExternalAIButton
                subject="Pulse Nexus — today's snapshot"
                getSnapshotText={() => buildDashboardSnapshotText(combined)}
              />
            </View>

            <LiveHRCard />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {rows.length === 0 ? (
              <Link href="/preferences" asChild>
                <Pressable style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No metric cards enabled. Tap to choose what to show.
                  </Text>
                </Pressable>
              </Link>
            ) : (
              rows.map((row, ri) => (
                <View key={ri} style={styles.row}>
                  {row.map((c) => (
                    <MetricCard key={c.key} label={c.label} value={c.value} sub={c.sub} />
                  ))}
                </View>
              ))
            )}

            <Text style={[styles.section, { marginTop: 18 }]}>Insights</Text>
            {insights.map((i, idx) => (
              <InsightCard key={idx} insight={i} />
            ))}

            <Text style={styles.note}>
              Insights are generated by deterministic rules — not AI. The Coach tab uses your
              chosen AI provider (Gemini, ChatGPT, Claude, or Grok) and is clearly labeled.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 8, paddingBottom: 40 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageTitle: { color: '#f5f7fa', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  section: {
    color: '#f5f7fa',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 4,
    marginLeft: 8,
  },
  row: { flexDirection: 'row' },
  error: { color: '#ff8a65', margin: 12 },
  emptyCard: {
    backgroundColor: '#141a22',
    padding: 18,
    borderRadius: 12,
    marginHorizontal: 6,
    marginTop: 8,
  },
  emptyText: { color: '#8aa0b4', textAlign: 'center' },
  note: { color: '#6c8094', fontSize: 12, margin: 14, lineHeight: 18 },
});
