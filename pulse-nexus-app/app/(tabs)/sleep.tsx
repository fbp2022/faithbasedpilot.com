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
import {
  formatHM,
  getSleepCombined,
  totalAsleepMinutes,
  type SleepCombined,
  type SleepSnapshot,
} from '@/lib/sleep';

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const SOURCE_COLOR: Record<SleepSnapshot['source'], string> = {
  'Apple Health': '#fa5252',
  WHOOP: '#3ddc97',
  Fitbit: '#5b8def',
  Garmin: '#7c5cff',
};

function scoreLabel(score: number | null | undefined): { text: string; color: string } {
  if (score == null) return { text: '—', color: '#8aa0b4' };
  if (score >= 85) return { text: `${Math.round(score)} · Optimal`, color: '#3ddc97' };
  if (score >= 70) return { text: `${Math.round(score)} · Sufficient`, color: '#f1c40f' };
  return { text: `${Math.round(score)} · Insufficient`, color: '#ff8a65' };
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <Text style={styles.h1}>Sleep</Text>
        <Text style={styles.sub}>
          Last night, merged across Apple Health, WHOOP, Fitbit, and Garmin. Pull to refresh.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
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
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 12, paddingBottom: 40 },
  h1: { color: '#f5f7fa', fontSize: 28, fontWeight: '800', marginHorizontal: 4 },
  sub: { color: '#8aa0b4', fontSize: 13, marginHorizontal: 4, marginTop: 4 },
  error: { color: '#ff8a65', margin: 12 },
  empty: { color: '#8aa0b4', textAlign: 'center', marginTop: 32, padding: 18, lineHeight: 20 },

  heroCard: {
    marginTop: 14,
    backgroundColor: '#141a22',
    borderRadius: 16,
    padding: 16,
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  sourcePillText: { color: '#0b0f14', fontSize: 11, fontWeight: '700' },
  heroDate: { color: '#8aa0b4', fontSize: 12 },
  heroValue: {
    color: '#f5f7fa',
    fontSize: 44,
    fontWeight: '800',
    marginTop: 10,
    letterSpacing: -1,
  },
  heroLabel: {
    color: '#8aa0b4',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timeRow: { marginTop: 8 },
  timeText: { color: '#c2cfdb', fontSize: 13 },
  stageWrap: { marginTop: 14 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -6 },
  mini: {
    paddingHorizontal: 6,
    marginTop: 8,
    minWidth: '33%',
  },
  miniLabel: {
    color: '#6c8094',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  miniValue: { color: '#f5f7fa', fontSize: 16, fontWeight: '700', marginTop: 2 },

  section: {
    color: '#f5f7fa',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 6,
    marginHorizontal: 4,
  },
  perSourceCard: {
    backgroundColor: '#141a22',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  perSourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perSourceTotal: { color: '#c2cfdb', fontSize: 13, fontWeight: '600' },

  smallNote: { color: '#6c8094', fontSize: 12, lineHeight: 18, marginTop: 18, marginHorizontal: 4 },
});
