import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Insight } from '@/lib/assistant';
import { colors, radii, spacing } from '@/lib/theme';

const STYLE: Record<
  Insight['level'],
  { bar: string; icon: keyof typeof Ionicons.glyphMap; title: string }
> = {
  good: { bar: colors.positive, icon: 'checkmark-circle', title: colors.text },
  neutral: { bar: colors.accent, icon: 'information-circle', title: colors.text },
  warn: { bar: colors.warn, icon: 'alert-circle', title: colors.text },
};

export function InsightCard({ insight }: { insight: Insight }) {
  const s = STYLE[insight.level];
  return (
    <View style={[styles.card, { borderLeftColor: s.bar }]}>
      <View style={styles.head}>
        <Ionicons name={s.icon} size={16} color={s.bar} />
        <Text style={[styles.title, { color: s.title }]} numberOfLines={2}>
          {insight.title}
        </Text>
      </View>
      <Text style={styles.detail}>{insight.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderLeftWidth: 3,
    padding: spacing.md + 2,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.xs + 2,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', marginLeft: 8, flex: 1 },
  detail: { color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 20 },
});
