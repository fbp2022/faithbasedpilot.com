import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * A large recovery-style ring, styled to match the Pulse Nexus app icon
 * (chrome R inside a glowing cyan ring on a matte-black tile). Uses pure
 * View primitives — no react-native-svg dependency — so it works with the
 * current Expo dependency set without a native rebuild.
 *
 * Uses a static ring coloured by zone plus a big percentage number in the
 * middle. It is intentionally not an animated arc: the icon's aesthetic is
 * a full glowing ring, and this component keeps that language.
 */

function zoneColor(pct: number): { color: string; label: string } {
  if (pct >= 67) return { color: colors.positive, label: 'Recovered' };
  if (pct >= 34) return { color: colors.warn, label: 'Moderate' };
  return { color: colors.danger, label: 'Low' };
}

export type RecoveryRingProps = {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  color?: string;
  showZone?: boolean;
};

export function RecoveryRing({
  value,
  size = 220,
  stroke = 10,
  label,
  sub,
  color,
  showZone = true,
}: RecoveryRingProps) {
  const pct = value == null ? null : Math.max(0, Math.min(100, value));
  const zone = pct == null ? null : zoneColor(pct);
  const ringColor = color ?? zone?.color ?? colors.accent;
  const inner = size - stroke * 2 - 8;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.glow,
          {
            width: size + 24,
            height: size + 24,
            borderRadius: (size + 24) / 2,
            backgroundColor: pct == null ? 'transparent' : `${ringColor}18`,
          },
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: pct == null ? colors.borderStrong : ringColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={[
            styles.inner,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              borderColor: colors.border,
            },
          ]}
        >
          {label ? <Text style={styles.label}>{label}</Text> : null}
          <Text
            style={[
              styles.value,
              { color: pct == null ? colors.textMuted : ringColor },
            ]}
          >
            {pct == null ? '—' : `${Math.round(pct)}%`}
          </Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
          {showZone && zone ? (
            <Text style={[styles.zone, { color: ringColor }]}>{zone.label}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
  },
  inner: {
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  value: {
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  sub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  zone: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
