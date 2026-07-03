import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/lib/theme';
import {
  connectHealth,
  disconnectHealth,
  isHealthConnected,
  isHealthPlatformSupported,
} from '@/lib/healthkit';
import {
  connectWhoop,
  disconnectWhoop,
  isWhoopConfigured,
  isWhoopConnected,
} from '@/lib/whoop';
import {
  connectFitbit,
  disconnectFitbit,
  isFitbitConfigured,
  isFitbitConnected,
} from '@/lib/fitbit';
import {
  connectGarmin,
  disconnectGarmin,
  isGarminConfigured,
  isGarminConnected,
} from '@/lib/garmin';

type ProviderKey = 'health' | 'whoop' | 'fitbit' | 'garmin';

type ProviderRow = {
  key: ProviderKey;
  name: string;
  short: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  brand: string;
  isConnected: () => Promise<boolean>;
  isConfigured: () => boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  notConfiguredHint: string;
};

const PROVIDERS: ProviderRow[] = [
  {
    key: 'health',
    name: 'Apple Health',
    short: 'Apple Health',
    blurb:
      'Steps, heart rate, sleep, workouts, and everything else Health has stored on this iPhone.',
    icon: 'heart',
    brand: colors.apple,
    isConnected: isHealthConnected,
    isConfigured: () => isHealthPlatformSupported(),
    connect: connectHealth,
    disconnect: disconnectHealth,
    notConfiguredHint:
      'Apple Health is only available on iPhone. Build the iOS app to enable this connection.',
  },
  {
    key: 'whoop',
    name: 'WHOOP',
    short: 'WHOOP',
    blurb: 'Recovery, HRV, sleep performance, strain, and workouts from your WHOOP strap.',
    icon: 'pulse',
    brand: colors.whoop,
    isConnected: isWhoopConnected,
    isConfigured: isWhoopConfigured,
    connect: connectWhoop,
    disconnect: disconnectWhoop,
    notConfiguredHint:
      'Add EXPO_PUBLIC_WHOOP_CLIENT_ID and EXPO_PUBLIC_WHOOP_CLIENT_SECRET to .env, then rebuild. Free WHOOP developer app: https://developer.whoop.com',
  },
  {
    key: 'fitbit',
    name: 'Fitbit',
    short: 'Fitbit',
    blurb:
      'Steps, sleep, resting HR, HRV, and SpO₂. Includes new Google-era models and the Pixel Watch.',
    icon: 'walk',
    brand: colors.fitbit,
    isConnected: isFitbitConnected,
    isConfigured: isFitbitConfigured,
    connect: connectFitbit,
    disconnect: disconnectFitbit,
    notConfiguredHint:
      'Add EXPO_PUBLIC_FITBIT_CLIENT_ID and EXPO_PUBLIC_FITBIT_CLIENT_SECRET to .env, then rebuild. Free Fitbit app: https://dev.fitbit.com/apps/new',
  },
  {
    key: 'garmin',
    name: 'Garmin',
    short: 'Garmin',
    blurb: 'Steps, Body Battery, stress, HRV, and sleep score from your Garmin watch.',
    icon: 'watch',
    brand: colors.garmin,
    isConnected: isGarminConnected,
    isConfigured: isGarminConfigured,
    connect: connectGarmin,
    disconnect: disconnectGarmin,
    notConfiguredHint:
      'Garmin Health API requires partner approval at https://developerportal.garmin.com. Once approved, add EXPO_PUBLIC_GARMIN_CLIENT_ID and EXPO_PUBLIC_GARMIN_CLIENT_SECRET to .env.',
  },
];

export default function ConnectScreen() {
  const [statuses, setStatuses] = useState<Record<ProviderKey, boolean | null>>({
    health: null,
    whoop: null,
    fitbit: null,
    garmin: null,
  });
  const [busy, setBusy] = useState<ProviderKey | null>(null);
  const [errors, setErrors] = useState<Record<ProviderKey, string | null>>({
    health: null,
    whoop: null,
    fitbit: null,
    garmin: null,
  });

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(async (p) => [p.key, await p.isConnected().catch(() => false)] as const),
    );
    setStatuses((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onConnect = async (p: ProviderRow) => {
    setBusy(p.key);
    setErrors((e) => ({ ...e, [p.key]: null }));
    try {
      await p.connect();
      await refresh();
    } catch (err) {
      setErrors((e) => ({ ...e, [p.key]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async (p: ProviderRow) => {
    setBusy(p.key);
    setErrors((e) => ({ ...e, [p.key]: null }));
    try {
      await p.disconnect();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const connectedCount = Object.values(statuses).filter((v) => v === true).length;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="link" size={22} color={colors.accent} />
          </View>
          <Text style={styles.h1}>Connect your devices</Text>
          <Text style={styles.p}>
            Turn on any combination below. Pulse Nexus merges what it can read and tells you in
            plain English when devices disagree.
          </Text>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{connectedCount}</Text>
            <Text style={styles.heroStatLabel}>connected</Text>
          </View>
        </View>

        {PROVIDERS.map((p) => {
          const connected = statuses[p.key];
          const configured = p.isConfigured();
          const isBusy = busy === p.key;
          const err = errors[p.key];

          return (
            <View key={p.key} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.iconChip, { backgroundColor: `${p.brand}22` }]}>
                  <Ionicons name={p.icon} size={22} color={p.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.cardBlurb}>{p.blurb}</Text>
                </View>
                <StatusPill state={connected} configured={configured} />
              </View>

              {!configured ? (
                <View style={styles.hint}>
                  <Ionicons name="information-circle" size={16} color={colors.warn} />
                  <Text style={styles.hintText}>{p.notConfiguredHint}</Text>
                </View>
              ) : null}

              {err ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{err}</Text>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                {connected === true ? (
                  <Pressable
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={() => onDisconnect(p)}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <>
                        <Ionicons name="log-out-outline" size={16} color={colors.text} />
                        <Text style={styles.btnSecondaryText}>Disconnect</Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    style={[
                      styles.btn,
                      styles.btnPrimary,
                      { backgroundColor: p.brand },
                      !configured && styles.btnDisabled,
                    ]}
                    onPress={() => onConnect(p)}
                    disabled={isBusy || !configured}
                  >
                    {isBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="link" size={16} color="#fff" />
                        <Text style={styles.btnPrimaryText}>
                          {configured ? `Connect ${p.short}` : `${p.short} setup required`}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        <Text style={styles.footNote}>
          {Platform.OS === 'ios'
            ? 'Apple Health data stays on your iPhone. WHOOP, Fitbit, and Garmin tokens are stored in the iOS Keychain — Pulse Nexus has no server.'
            : 'WHOOP, Fitbit, and Garmin tokens are stored securely on-device. Apple Health is only available on iOS.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ state, configured }: { state: boolean | null; configured: boolean }) {
  if (state === null) return <ActivityIndicator color={colors.textMuted} />;
  if (!configured) {
    return (
      <View style={[styles.pill, { backgroundColor: `${colors.warn}22` }]}>
        <View style={[styles.pillDot, { backgroundColor: colors.warn }]} />
        <Text style={[styles.pillText, { color: colors.warn }]}>Setup</Text>
      </View>
    );
  }
  if (state) {
    return (
      <View style={[styles.pill, { backgroundColor: `${colors.positive}22` }]}>
        <View style={[styles.pillDot, { backgroundColor: colors.positive }]} />
        <Text style={[styles.pillText, { color: colors.positive }]}>Live</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, { backgroundColor: colors.bgCardMuted }]}>
      <View style={[styles.pillDot, { backgroundColor: colors.textDim }]} />
      <Text style={[styles.pillText, { color: colors.textMuted }]}>Off</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 40 },

  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  p: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  heroStat: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  heroStatValue: {
    color: colors.accent,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroStatLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 6,
    marginBottom: 6,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md as unknown as number },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cardBlurb: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginLeft: spacing.sm,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.warn}14`,
    borderRadius: radii.md,
    borderLeftColor: colors.warn,
    borderLeftWidth: 3,
    gap: spacing.sm as unknown as number,
  },
  hintText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: spacing.sm,
    flex: 1,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: `${colors.danger}14`,
    borderRadius: radii.md,
    borderLeftColor: colors.danger,
    borderLeftWidth: 3,
  },
  errorText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: spacing.sm,
    flex: 1,
  },

  actionRow: { marginTop: spacing.md },
  btn: {
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm as unknown as number,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  btnSecondary: {
    backgroundColor: colors.bgCardMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  btnDisabled: { opacity: 0.55 },

  footNote: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
