import { StyleSheet, Text, View } from 'react-native';

import type { Workout, WorkoutSource } from '@/lib/workouts';
import { colors, radii, spacing } from '@/lib/theme';

const SOURCE_COLOR: Record<WorkoutSource, string> = {
  'Apple Health': colors.apple,
  WHOOP: colors.whoop,
  Fitbit: colors.fitbit,
  Garmin: colors.garmin,
};

function fmtDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay
    ? `Today, ${time}`
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function strainColor(s: number | undefined): string {
  if (s == null) return colors.textMuted;
  if (s >= 18) return colors.danger;
  if (s >= 14) return colors.warn;
  if (s >= 10) return colors.positive;
  return colors.accent;
}

export function WorkoutCard({ workout }: { workout: Workout }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.sourcePill, { backgroundColor: SOURCE_COLOR[workout.source] }]}>
          <Text style={styles.sourcePillText}>{workout.source}</Text>
        </View>
        {workout.strainOrLoad != null ? (
          <View style={[styles.strainPill, { borderColor: strainColor(workout.strainOrLoad) }]}>
            <Text style={[styles.strainPillText, { color: strainColor(workout.strainOrLoad) }]}>
              Strain {workout.strainOrLoad.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.type}>{workout.type}</Text>
      <Text style={styles.time}>{fmtTime(workout.start)}</Text>

      <View style={styles.statsRow}>
        <Stat label="Duration" value={fmtDuration(workout.durationMin)} />
        {workout.distanceKm != null ? (
          <Stat label="Distance" value={`${workout.distanceKm.toFixed(2)} km`} />
        ) : null}
        {workout.calories != null ? (
          <Stat label="kcal" value={Math.round(workout.calories).toLocaleString()} />
        ) : null}
        {workout.avgHR != null ? (
          <Stat label="Avg HR" value={`${Math.round(workout.avgHR)}`} />
        ) : null}
        {workout.maxHR != null ? (
          <Stat label="Max HR" value={`${Math.round(workout.maxHR)}`} />
        ) : null}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginVertical: spacing.xs + 2,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill },
  sourcePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  strainPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  strainPillText: { fontSize: 11, fontWeight: '700' },
  type: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.md, letterSpacing: -0.3 },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, marginHorizontal: -6 },
  stat: { paddingHorizontal: 6, marginTop: 6, minWidth: 80 },
  statLabel: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
});
