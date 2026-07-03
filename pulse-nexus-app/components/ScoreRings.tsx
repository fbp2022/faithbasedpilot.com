import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Three compact score rings shown side by side, in the style of the Bevel
 * health app's header. Each ring keeps the Pulse Nexus icon aesthetic — a
 * static glowing ring on a matte-black inner disc — but at a smaller size
 * so three fit in a row, with the metric label sitting underneath.
 *
 * Pure View primitives (no react-native-svg), consistent with the single
 * RecoveryRing this replaces in the dashboard hero.
 */

export type ScoreRing = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  /** 0–100 used only to pick a zone colour when `color` is not supplied. */
  zoneValue?: number | null;
  color?: string;
  hasData: boolean;
};

function zoneColor(pct: number): string {
  if (pct >= 67) return colors.positive;
  if (pct >= 34) return colors.warn;
  return colors.danger;
}

export function ScoreRings({ rings, size = 104, stroke = 7 }: { rings: ScoreRing[]; size?: number; stroke?: number }) {
  return (
    <View style={styles.row}>
      {rings.map((r) => (
        <SingleRing key={r.key} ring={r} size={size} stroke={stroke} />
      ))}
    </View>
  );
}

function SingleRing({ ring, size, stroke }: { ring: ScoreRing; size: number; stroke: number }) {
  const ringColor = ring.hasData
    ? ring.color ?? (ring.zoneValue != null ? zoneColor(ring.zoneValue) : colors.accent)
    : colors.borderStrong;
  const inner = size - stroke * 2 - 6;

  return (
    <View style={styles.item}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {ring.hasData ? (
          <View
            style={[
              styles.glow,
              {
                width: size + 14,
                height: size + 14,
                borderRadius: (size + 14) / 2,
                backgroundColor: `${ringColor}18`,
              },
            ]}
          />
        ) : null}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: ringColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={[
              styles.inner,
              { width: inner, height: inner, borderRadius: inner / 2 },
            ]}
          >
            <Text
              style={[styles.value, { color: ring.hasData ? colors.text : colors.textMuted }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {ring.value}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.label}>{ring.label}</Text>
      {ring.sub ? (
        <Text style={styles.sub} numberOfLines={1}>
          {ring.sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    width: '100%',
  },
  item: {
    alignItems: 'center',
    flex: 1,
  },
  glow: {
    position: 'absolute',
  },
  inner: {
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  sub: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
