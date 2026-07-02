import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '@/lib/theme';

export function DisclaimerBanner() {
  return (
    <View style={styles.box}>
      <Ionicons name="information-circle" size={16} color={colors.warn} />
      <Text style={styles.text}>
        Answers in this tab come from a generative AI model with live web search. They can be
        incomplete or wrong. Don&apos;t use them for medical, legal, or financial decisions without
        verifying with a qualified source.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.warn}14`,
    borderLeftColor: colors.warn,
    borderLeftWidth: 3,
    padding: spacing.md,
    marginHorizontal: spacing.xs + 2,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    gap: spacing.sm as unknown as number,
  },
  text: { color: colors.text, fontSize: 12, lineHeight: 18, marginLeft: spacing.sm, flex: 1 },
});
