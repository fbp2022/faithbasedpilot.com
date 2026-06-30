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
import {
  getTodaySnapshot,
  requestHealthPermissions,
  type DailyHealthSnapshot,
} from '@/lib/healthkit';
import {
  getLatestWhoopCycle,
  getLatestWhoopRecovery,
  getLatestWhoopSleep,
  isWhoopConnected,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from '@/lib/whoop';
import { getFitbitSnapshot, isFitbitConnected, type FitbitSnapshot } from '@/lib/fitbit';
import { getGarminSnapshot, isGarminConnected, type GarminSnapshot } from '@/lib/garmin';
import { generateInsights, unify, type CombinedSnapshot } from '@/lib/assistant';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<DailyHealthSnapshot | null>(null);
  const [whoop, setWhoop] = useState<{
    recovery: WhoopRecovery | null;
    sleep: WhoopSleep | null;
    cycle: WhoopCycle | null;
  }>({ recovery: null, sleep: null, cycle: null });
  const [fitbit, setFitbit] = useState<FitbitSnapshot | null>(null);
  const [garmin, setGarmin] = useState<GarminSnapshot | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await requestHealthPermissions().catch(() => {});

      const [whoopConnected, fitbitConnected, garminConnected] = await Promise.all([
        isWhoopConnected(),
        isFitbitConnected(),
        isGarminConnected(),
      ]);

      const [h, whoopData, fitbitData, garminData] = await Promise.all([
        getTodaySnapshot().catch(() => null),
        whoopConnected
          ? Promise.all([
              getLatestWhoopRecovery().catch(() => null),
              getLatestWhoopSleep().catch(() => null),
              getLatestWhoopCycle().catch(() => null),
            ]).then(([recovery, sleep, cycle]) => ({ recovery, sleep, cycle }))
          : Promise.resolve({ recovery: null, sleep: null, cycle: null }),
        fitbitConnected ? getFitbitSnapshot().catch(() => null) : Promise.resolve(null),
        garminConnected ? getGarminSnapshot().catch(() => null) : Promise.resolve(null),
      ]);

      setHealth(h);
      setWhoop(whoopData);
      setFitbit(fitbitData);
      setGarmin(garminData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const combined: CombinedSnapshot = { health, whoop, fitbit, garmin };
  const u = unify(combined);
  const insights = generateInsights(combined);

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
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.section}>Today</Text>

            <View style={styles.row}>
              <MetricCard
                label="Steps"
                value={u.steps ? Math.round(u.steps.value).toLocaleString() : '—'}
                sub={u.steps?.source}
              />
              <MetricCard
                label="Active kcal"
                value={u.activeKcal ? Math.round(u.activeKcal.value).toLocaleString() : '—'}
                sub={u.activeKcal?.source}
              />
            </View>

            <View style={styles.row}>
              <MetricCard
                label="Resting HR"
                value={u.restingHR ? `${Math.round(u.restingHR.value)} bpm` : '—'}
                sub={u.restingHR?.source}
              />
              <MetricCard
                label="HRV"
                value={u.hrvMs ? `${Math.round(u.hrvMs.value)} ms` : '—'}
                sub={u.hrvMs?.source}
              />
            </View>

            <View style={styles.row}>
              <MetricCard
                label="Recovery"
                value={u.recovery ? `${u.recovery.value}%` : '—'}
                sub={u.recovery?.source ?? 'Connect WHOOP'}
              />
              <MetricCard
                label="Sleep"
                value={u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h` : '—'}
                sub={u.sleepHours?.source}
              />
            </View>

            <View style={styles.row}>
              <MetricCard
                label="Strain"
                value={u.strainOrLoad ? u.strainOrLoad.value.toFixed(1) : '—'}
                sub={u.strainOrLoad?.source}
              />
              <MetricCard
                label="Body Battery"
                value={u.bodyBattery != null ? String(u.bodyBattery) : '—'}
                sub={u.bodyBattery != null ? 'Garmin' : 'Connect Garmin'}
              />
            </View>

            <Text style={styles.section}>Insights</Text>
            {insights.map((i, idx) => (
              <InsightCard key={idx} insight={i} />
            ))}

            <View style={styles.nav}>
              <Link href="/ask" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Ask the web →</Text>
                </Pressable>
              </Link>
              <Link href="/connect" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Connect devices →</Text>
                </Pressable>
              </Link>
              <Link href="/settings" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Settings →</Text>
                </Pressable>
              </Link>
            </View>

            <Text style={styles.note}>
              Insights on this screen are generated by deterministic rules — not AI. Web answers (in
              the Ask tab) use Google Gemini and are clearly labeled as such.
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
  section: {
    color: '#f5f7fa',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 4,
    marginLeft: 8,
  },
  row: { flexDirection: 'row' },
  error: { color: '#ff8a65', margin: 12 },
  nav: { marginTop: 18 },
  navBtn: {
    backgroundColor: '#141a22',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 6,
    marginVertical: 4,
  },
  navBtnText: { color: '#f5f7fa', fontSize: 16, fontWeight: '600' },
  note: { color: '#6c8094', fontSize: 12, margin: 14, lineHeight: 18 },
});
