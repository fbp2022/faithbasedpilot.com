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
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AskExternalAIButton } from '@/components/AskExternalAI';
import { InsightCard } from '@/components/InsightCard';
import { MetricCard } from '@/components/MetricCard';
import { RecoveryRing } from '@/components/RecoveryRing';
import { buildDashboardSnapshotText } from '@/lib/snapshot-text';
import { generateInsights, unify, type CombinedSnapshot } from '@/lib/assistant';
import {
  getFitbitSnapshot,
  isFitbitConnected,
  type FitbitSnapshot,
} from '@/lib/fitbit';
import {
  getGarminSnapshot,
  isGarminConnected,
  type GarminSnapshot,
} from '@/lib/garmin';
import {
  getTodaySnapshot,
  isHealthConnected,
  type DailyHealthSnapshot,
} from '@/lib/healthkit';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  type DashboardCardKey,
  type Preferences,
} from '@/lib/preferences';
import { colors, radii, spacing } from '@/lib/theme';
import {
  getLatestWhoopCycle,
  getLatestWhoopRecovery,
  getLatestWhoopSleep,
  isWhoopConnected,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from '@/lib/whoop';

type CardMeta = {
  key: DashboardCardKey;
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function dateLine(): string {
  return new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  const [anyConnected, setAnyConnected] = useState(false);
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
      const loadedPrefs = await loadPreferences();
      setPrefs(loadedPrefs);

      const [healthConnected, whoopConnected, fitbitConnected, garminConnected] = await Promise.all(
        [
          isHealthConnected(),
          isWhoopConnected(),
          isFitbitConnected(),
          isGarminConnected(),
        ],
      );

      setAnyConnected(
        healthConnected || whoopConnected || fitbitConnected || garminConnected,
      );

      const [h, whoopData, fitbitData, garminData] = await Promise.all([
        healthConnected ? getTodaySnapshot().catch(() => null) : Promise.resolve(null),
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

  const enabled = (k: DashboardCardKey) => prefs.dashboardCards[k];

  const cards: CardMeta[] = [];
  if (enabled('steps'))
    cards.push({
      key: 'steps',
      label: 'Steps',
      value: u.steps ? Math.round(u.steps.value).toLocaleString() : '—',
      sub: u.steps?.source ?? 'No source',
      icon: 'walk',
      accent: colors.accent,
    });
  if (enabled('activeKcal'))
    cards.push({
      key: 'activeKcal',
      label: 'Active kcal',
      value: u.activeKcal ? Math.round(u.activeKcal.value).toLocaleString() : '—',
      sub: u.activeKcal?.source ?? 'No source',
      icon: 'flame',
      accent: colors.warn,
    });
  if (enabled('restingHR'))
    cards.push({
      key: 'restingHR',
      label: 'Resting HR',
      value: u.restingHR ? `${Math.round(u.restingHR.value)} bpm` : '—',
      sub: u.restingHR?.source ?? 'No source',
      icon: 'heart',
      accent: colors.apple,
    });
  if (enabled('hrvMs'))
    cards.push({
      key: 'hrvMs',
      label: 'HRV',
      value: u.hrvMs ? `${Math.round(u.hrvMs.value)} ms` : '—',
      sub: u.hrvMs?.source ?? 'No source',
      icon: 'pulse',
      accent: colors.accent,
    });
  if (enabled('sleep'))
    cards.push({
      key: 'sleep',
      label: 'Sleep',
      value: u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h` : '—',
      sub: u.sleepHours?.source ?? 'No source',
      icon: 'moon',
      accent: '#8b6cf6',
    });
  if (enabled('strain'))
    cards.push({
      key: 'strain',
      label: 'Strain',
      value: u.strainOrLoad ? u.strainOrLoad.value.toFixed(1) : '—',
      sub: u.strainOrLoad?.source ?? 'Connect WHOOP',
      icon: 'barbell',
      accent: colors.whoop,
    });
  if (enabled('bodyBattery'))
    cards.push({
      key: 'bodyBattery',
      label: 'Body Battery',
      value: u.bodyBattery != null ? String(u.bodyBattery) : '—',
      sub: u.bodyBattery != null ? 'Garmin' : 'Connect Garmin',
      icon: 'battery-charging',
      accent: colors.garmin,
    });
  if (enabled('spo2'))
    cards.push({
      key: 'spo2',
      label: 'SpO₂',
      value: u.spo2 ? `${u.spo2.value.toFixed(0)}%` : '—',
      sub: u.spo2?.source ?? 'No source',
      icon: 'water',
      accent: colors.fitbit,
    });
  if (enabled('stress'))
    cards.push({
      key: 'stress',
      label: 'Stress',
      value: u.stressAvg != null ? String(u.stressAvg) : '—',
      sub: u.stressAvg != null ? 'Garmin' : 'Connect Garmin',
      icon: 'alert',
      accent: colors.warn,
    });

  const rows: CardMeta[][] = [];
  for (let i = 0; i < cards.length; i += 2) rows.push(cards.slice(i, i + 2));

  const recoveryValue = u.recovery?.value ?? null;
  const recoverySource = u.recovery?.source ?? 'Connect WHOOP for recovery';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.dateLine}>{dateLine()}</Text>
          </View>
          <AskExternalAIButton
            subject="Pulse Nexus — today's snapshot"
            getSnapshotText={() => buildDashboardSnapshotText(combined)}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
        ) : !anyConnected ? (
          <EmptyState />
        ) : (
          <>
            <View style={styles.hero}>
              <RecoveryRing
                value={recoveryValue}
                label="Recovery"
                sub={recoverySource}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {rows.length === 0 ? (
              <Link href="/preferences" asChild>
                <Pressable style={styles.emptyCard}>
                  <Ionicons name="options" size={18} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    No metric cards enabled. Tap to choose what to show.
                  </Text>
                </Pressable>
              </Link>
            ) : (
              <View style={styles.grid}>
                {rows.map((row, ri) => (
                  <View key={ri} style={styles.row}>
                    {row.map((c) => (
                      <MetricCard
                        key={c.key}
                        label={c.label}
                        value={c.value}
                        sub={c.sub}
                        icon={c.icon}
                        accent={c.accent}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )}

            {insights.length > 0 ? (
              <>
                <Text style={styles.section}>Insights</Text>
                {insights.map((i, idx) => (
                  <InsightCard key={idx} insight={i} />
                ))}
              </>
            ) : null}

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

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyBadge}>
        <Ionicons name="link" size={28} color={colors.accent} />
      </View>
      <Text style={styles.emptyStateTitle}>Connect a device to get started</Text>
      <Text style={styles.emptyStateBody}>
        Pulse Nexus pulls live data from Apple Health, WHOOP, Fitbit, and Garmin. Turn on any
        combination on the Connect screen and this dashboard fills in.
      </Text>
      <Link href="/connect" asChild>
        <Pressable style={styles.emptyStateBtn}>
          <Ionicons name="link" size={16} color="#fff" />
          <Text style={styles.emptyStateBtnText}>Connect devices</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs + 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  greeting: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateLine: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.xs + 2,
    borderRadius: radii.xl,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },

  grid: { marginTop: spacing.sm },
  row: { flexDirection: 'row' },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    borderRadius: radii.md,
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm as unknown as number,
  },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginLeft: 8 },

  section: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
  },
  error: { color: colors.danger, margin: spacing.md },
  note: {
    color: colors.textDim,
    fontSize: 12,
    margin: spacing.md,
    lineHeight: 18,
  },

  emptyState: {
    alignItems: 'center',
    padding: spacing.xxl,
    marginTop: spacing.xl,
    marginHorizontal: spacing.xs + 2,
    borderRadius: radii.xl,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    gap: spacing.sm as unknown as number,
  },
  emptyStateBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
});
