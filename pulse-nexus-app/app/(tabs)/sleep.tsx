import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SleepStageBar } from '@/components/SleepStageBar';
import { AskExternalAIButton } from '@/components/AskExternalAI';
import { colors, radii, spacing } from '@/lib/theme';
import {
  formatHM,
  getSleepCombined,
  totalAsleepMinutes,
  type SleepCombined,
  type SleepSnapshot,
} from '@/lib/sleep';
import { buildSleepSnapshotText } from '@/lib/snapshot-text';

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const SOURCE_COLOR: Record<SleepSnapshot['source'], string> = {
  'Apple Health': colors.apple,
  WHOOP: colors.whoop,
  Fitbit: colors.fitbit,
  Garmin: colors.garmin,
};

function scoreLabel(score: number | null | undefined): { text: string; color: string } {
  if (score == null) return { text: '—', color: colors.textMuted };
  if (score >= 85) return { text: `${Math.round(score)} · Optimal`, color: colors.positive };
  if (score >= 70) return { text: `${Math.round(score)} · Sufficient`, color: colors.warn };
  return { text: `${Math.round(score)} · Insufficient`, color: colors.danger };
}

export default function SleepScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SleepCombined | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await getSleepCombined();
      setData(d);
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

  const primary = data?.primary ?? null;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
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
        <View style={styles.titleRow}>
          <Text style={styles.h1}>Sleep</Text>
          <AskExternalAIButton
            subject="Pulse Nexus — last night sleep"
            getSnapshotText={() =>
              buildSleepSnapshotText(data?.primary ?? null, data?.perSource ?? [])
            }
          />
        </View>
        <Text style={styles.sub}>
          Last night, merged across Apple Health, WHOOP, Fitbit, and Garmin. Pull to refresh.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : !primary ? (
          <Text style={styles.empty}>
            No sleep recorded yet. Wear your tracker overnight and pull to refresh in the morning.
          </Text>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View
                  style={[
                    styles.sourcePill,
                    { backgroundColor: SOURCE_COLOR[primary.source] },
                  ]}
                >
                  <Text style={styles.sourcePillText}>{primary.source}</Text>
                </View>
                <Text style={styles.heroDate}>{fmtDate(primary.start)}</Text>
              </View>

              <Text style={styles.heroValue}>{formatHM(primary.asleepMs)}</Text>
              <Text style={styles.heroLabel}>asleep</Text>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  Bed {fmtClock(primary.start)} → Wake {fmtClock(primary.end)}
                </Text>
              </View>

              <View style={styles.stageWrap}>
                <SleepStageBar stages={primary.stages} />
              </View>

              <View style={styles.miniGrid}>
                <Mini
                  label="In bed"
                  value={formatHM(primary.inBedMs)}
                />
                <Mini
                  label="Efficiency"
                  value={primary.efficiencyPct != null ? `${primary.efficiencyPct}%` : '—'}
                />
                <Mini
                  label="Sleep score"
                  value={scoreLabel(primary.scorePct).text}
                  color={scoreLabel(primary.scorePct).color}
                />
                <Mini
                  label="Need"
                  value={primary.needMs != null ? formatHM(primary.needMs) : '—'}
                />
                <Mini
                  label="Debt"
                  value={
                    primary.needMs != null
                      ? formatHM(Math.max(0, primary.needMs - primary.asleepMs))
                      : '—'
                  }
                />
                <Mini
                  label="Respiration"
                  value={
                    primary.avgRespRate != null ? `${primary.avgRespRate.toFixed(1)} br/min` : '—'
                  }
                />
              </View>
            </View>

            {data && data.perSource.length > 1 ? (
              <>
                <Text style={styles.section}>Per device</Text>
                {data.perSource.map((s) => (
                  <PerSourceRow key={s.source} s={s} />
                ))}
              </>
            ) : null}

            <Text style={styles.smallNote}>
              Sleep classifications differ between devices. WHOOP, Fitbit, and Garmin each use their
              own algorithms; Apple Health combines whatever was logged (Apple Watch, AutoSleep,
              etc.). Treat the totals as estimates, not lab measurements.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function PerSourceRow({ s }: { s: SleepSnapshot }) {
  return (
    <View style={styles.perSourceCard}>
      <View style={styles.perSourceHeader}>
        <View style={[styles.sourcePill, { backgroundColor: SOURCE_COLOR[s.source] }]}>
          <Text style={styles.sourcePillText}>{s.source}</Text>
        </View>
        <Text style={styles.perSourceTotal}>
          {formatHM(s.asleepMs)} asleep · {totalAsleepMinutes(s).toFixed(0)} min
        </Text>
      </View>
      <View style={styles.stageWrap}>
        <SleepStageBar stages={s.stages} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: 40 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 4,
  },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginHorizontal: 4, marginTop: 4 },
  error: { color: colors.danger, margin: spacing.md },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
    padding: spacing.lg,
    lineHeight: 20,
  },

  heroCard: {
    marginTop: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill },
  sourcePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroDate: { color: colors.textMuted, fontSize: 12 },
  heroValue: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '800',
    marginTop: spacing.md,
    letterSpacing: -1.2,
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  timeRow: { marginTop: spacing.sm },
  timeText: { color: colors.textMuted, fontSize: 13 },
  stageWrap: { marginTop: spacing.md },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, marginHorizontal: -6 },
  mini: {
    paddingHorizontal: 6,
    marginTop: spacing.sm,
    minWidth: '33%',
  },
  miniLabel: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  miniValue: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 3 },

  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.xs + 2,
    marginHorizontal: 4,
  },
  perSourceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md + 2,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  perSourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perSourceTotal: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  smallNote: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.lg,
    marginHorizontal: 4,
  },
});
