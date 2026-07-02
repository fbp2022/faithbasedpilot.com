import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '@/lib/theme';

export type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
};

export function MetricCard({ label, value, sub, icon, accent }: MetricCardProps) {
  const accentColor = accent ?? colors.accent;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {icon ? (
          <View style={[styles.iconChip, { backgroundColor: `${accentColor}22` }]}>
            <Ionicons name={icon} size={14} color={accentColor} />
          </View>
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    margin: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    flex: 1,
  },
  value: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sub: { color: colors.textDim, fontSize: 11, marginTop: 6 },
});
