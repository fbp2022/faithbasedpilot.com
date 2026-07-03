import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PROVIDERS, PROVIDER_ORDER } from '@/lib/ai';
import type { ProviderId, DashboardCardKey } from '@/lib/preferences';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '@/lib/preferences';
import { colors, radii, spacing } from '@/lib/theme';

const CARD_LABELS: Record<DashboardCardKey, string> = {
  steps: 'Steps',
  activeKcal: 'Active kcal',
  restingHR: 'Resting heart rate',
  hrvMs: 'HRV',
  recovery: 'Recovery',
  sleep: 'Sleep',
  strain: 'Strain (WHOOP)',
  bodyBattery: 'Body Battery (Garmin)',
  spo2: 'SpO₂',
  stress: 'Stress (Garmin)',
};

export default function PreferencesScreen() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    loadPreferences().then(setPrefs);
  }, []);

  const persist = useCallback(async (next: Preferences) => {
    setPrefs(next);
    await savePreferences(next);
  }, []);

  if (!prefs) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Preferences</Text>

        <Text style={styles.h2}>Coach engine</Text>
        <Text style={styles.p}>
          Pick which AI provider answers in the Coach tab. Each provider needs its own API key in
          your <Text style={styles.mono}>.env</Text> file at build time.
        </Text>

        {PROVIDER_ORDER.map((id) => {
          const p = PROVIDERS[id];
          const selected = prefs.aiProvider === id;
          const configured = p.isConfigured();
          return (
            <Pressable
              key={id}
              style={[styles.providerCard, selected && styles.providerCardSelected]}
              onPress={() => persist({ ...prefs, aiProvider: id as ProviderId })}
            >
              <View style={styles.providerHeader}>
                <Text style={styles.providerName}>
                  {p.name}
                  <Text style={styles.providerVendor}> · {p.vendor}</Text>
                </Text>
                {selected ? <Text style={styles.providerSelected}>✓</Text> : null}
              </View>
              <Text style={styles.providerMeta}>
                Model: <Text style={styles.mono}>{p.modelLabel}</Text>
                {p.hasWebSearch ? '   ·   Live web search' : ''}
              </Text>
              <View style={styles.providerStatusRow}>
                <View
                  style={[
                    styles.providerStatusDot,
                    { backgroundColor: configured ? colors.positive : colors.warn },
                  ]}
                />
                <Text
                  style={[
                    styles.providerStatusText,
                    { color: configured ? colors.positive : colors.warn },
                  ]}
                >
                  {configured ? 'API key configured' : `Missing ${p.apiKeyEnvVar}`}
                </Text>
                <Pressable onPress={() => Linking.openURL(p.apiKeyHelpUrl)}>
                  <Text style={styles.providerHelp}>Get a key</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.h2}>Dashboard cards</Text>
        <Text style={styles.p}>Choose which metric cards appear on the Home tab.</Text>

        {(Object.keys(CARD_LABELS) as DashboardCardKey[]).map((k) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowLabel}>{CARD_LABELS[k]}</Text>
            <Switch
              value={prefs.dashboardCards[k]}
              onValueChange={(v) =>
                persist({
                  ...prefs,
                  dashboardCards: { ...prefs.dashboardCards, [k]: v },
                })
              }
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor={colors.text}
            />
          </View>
        ))}

        <Text style={styles.h2}>Units</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>System</Text>
          <View style={styles.segmentRow}>
            {(['metric', 'imperial'] as const).map((u) => (
              <Pressable
                key={u}
                onPress={() => persist({ ...prefs, units: u })}
                style={[styles.segment, prefs.units === u && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, prefs.units === u && styles.segmentTextActive]}>
                  {u === 'metric' ? 'Metric' : 'Imperial'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={styles.resetBtn}
          onPress={() => persist(DEFAULT_PREFERENCES)}
        >
          <Text style={styles.resetBtnText}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  h1: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  h2: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.xs + 2,
  },
  p: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: spacing.sm },
  mono: { fontFamily: 'Menlo' },

  providerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginTop: spacing.sm,
    borderColor: colors.border,
    borderWidth: 1,
  },
  providerCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  providerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  providerVendor: { color: colors.textMuted, fontSize: 13, fontWeight: '400' },
  providerSelected: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  providerMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  providerStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm + 2 },
  providerStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  providerStatusText: { fontSize: 13, flex: 1, fontWeight: '600' },
  providerHelp: {
    color: colors.accent,
    fontSize: 12,
    textDecorationLine: 'underline',
    marginLeft: 8,
    fontWeight: '600',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.text, fontSize: 14 },

  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { paddingHorizontal: 12, paddingVertical: 6 },
  segmentActive: { backgroundColor: colors.accent, borderRadius: radii.sm },
  segmentText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#fff' },

  resetBtn: {
    marginTop: spacing.xxl,
    padding: 12,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  resetBtnText: { color: colors.danger, fontWeight: '700' },
});
