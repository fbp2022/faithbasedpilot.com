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
import { SafeAreaView } from 'react-native-safe-area-context';

import { WorkoutCard } from '@/components/WorkoutCard';
import { AskExternalAIButton } from '@/components/AskExternalAI';
import { getAllWorkouts, type Workout, type WorkoutSource } from '@/lib/workouts';
import { buildWorkoutsSnapshotText } from '@/lib/snapshot-text';
import { colors, radii, spacing } from '@/lib/theme';

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: '7 d', days: 7 },
  { label: '14 d', days: 14 },
  { label: '30 d', days: 30 },
  { label: '90 d', days: 90 },
];

type FilterSource = WorkoutSource | 'All';
const FILTERS: FilterSource[] = ['All', 'Apple Health', 'WHOOP', 'Fitbit', 'Garmin'];

export default function WorkoutsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [days, setDays] = useState<number>(14);
  const [source, setSource] = useState<FilterSource>('All');

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = await getAllWorkouts(days);
      setWorkouts(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const filtered = source === 'All' ? workouts : workouts.filter((w) => w.source === source);

  const totals = filtered.reduce(
    (acc, w) => {
      acc.count += 1;
      acc.durationMin += w.durationMin;
      acc.distanceKm += w.distanceKm ?? 0;
      acc.calories += w.calories ?? 0;
      return acc;
    },
    { count: 0, durationMin: 0, distanceKm: 0, calories: 0 },
  );

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
          <Text style={styles.h1}>Workouts</Text>
          <AskExternalAIButton
            subject={`Pulse Nexus — workouts (last ${days} days)`}
            getSnapshotText={() => buildWorkoutsSnapshotText(filtered, days)}
          />
        </View>
        <Text style={styles.sub}>
          Merged from Apple Health, WHOOP, Fitbit, and Garmin. Pull to refresh.
        </Text>

        <View style={styles.chipRow}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w.days}
              onPress={() => setDays(w.days)}
              style={[styles.chip, days === w.days && styles.chipActive]}
            >
              <Text style={[styles.chipText, days === w.days && styles.chipTextActive]}>{w.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.chipRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setSource(f)}
              style={[styles.chip, source === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, source === f && styles.chipTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summary}>
          <Summary label="Workouts" value={String(totals.count)} />
          <Summary
            label="Total time"
            value={
              totals.durationMin > 60
                ? `${Math.floor(totals.durationMin / 60)}h ${Math.round(totals.durationMin % 60)}m`
                : `${Math.round(totals.durationMin)}m`
            }
          />
          <Summary
            label="Distance"
            value={totals.distanceKm > 0 ? `${totals.distanceKm.toFixed(1)} km` : '—'}
          />
          <Summary
            label="Calories"
            value={totals.calories > 0 ? Math.round(totals.calories).toLocaleString() : '—'}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>
            No workouts in this window. Connect more sources on the Connect tab, or log a workout on
            your watch and pull to refresh.
          </Text>
        ) : (
          filtered.map((w) => <WorkoutCard key={w.id} workout={w} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
    marginHorizontal: 6,
  },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginHorizontal: 6, marginTop: 4 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    marginHorizontal: 2,
  },
  chip: {
    backgroundColor: colors.bgCard,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    margin: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginHorizontal: 6,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCell: { flex: 1, minWidth: 80, paddingVertical: 4 },
  summaryLabel: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  summaryValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 },
  error: { color: colors.danger, margin: spacing.md },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
    padding: spacing.lg,
    lineHeight: 20,
  },
});
