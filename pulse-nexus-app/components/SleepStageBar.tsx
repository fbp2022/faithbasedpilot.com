import { StyleSheet, Text, View } from 'react-native';
import type { SleepStageMs } from '@/lib/sleep';

const COLORS: Record<keyof SleepStageMs, string> = {
  deep: '#5b8def',
  rem: '#7c5cff',
  light: '#3ddc97',
  awake: '#f1c40f',
};

const ORDER: Array<keyof SleepStageMs> = ['deep', 'rem', 'light', 'awake'];

function fmtMin(ms: number): string {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SleepStageBar({ stages }: { stages: SleepStageMs }) {
  const total = stages.deep + stages.rem + stages.light + stages.awake;
  return (
    <View>
      <View style={styles.bar}>
        {total === 0 ? (
          <View style={[styles.segment, { flex: 1, backgroundColor: '#1c242e' }]} />
        ) : (
          ORDER.map((k) => {
            const v = stages[k];
            if (v <= 0) return null;
            return (
              <View
                key={k}
                style={[styles.segment, { flex: v, backgroundColor: COLORS[k] }]}
              />
            );
          })
        )}
      </View>
      <View style={styles.legend}>
        {ORDER.map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: COLORS[k] }]} />
            <Text style={styles.legendLabel}>
              {k[0].toUpperCase() + k.slice(1)} {fmtMin(stages[k])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#1c242e',
  },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendLabel: { color: '#c2cfdb', fontSize: 12 },
});
