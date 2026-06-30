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
        <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
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
                    { backgroundColor: configured ? '#3ddc97' : '#ff8a65' },
                  ]}
                />
                <Text style={[styles.providerStatusText, { color: configured ? '#3ddc97' : '#ff8a65' }]}>
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
              trackColor={{ true: '#3ddc97', false: '#1c242e' }}
              thumbColor="#f5f7fa"
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
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 18 },
  h1: { color: '#f5f7fa', fontSize: 28, fontWeight: '800' },
  h2: { color: '#f5f7fa', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 6 },
  p: { color: '#c2cfdb', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  mono: { fontFamily: 'Menlo' },

  providerCard: {
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderColor: 'transparent',
    borderWidth: 2,
  },
  providerCardSelected: { borderColor: '#3ddc97' },
  providerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerName: { color: '#f5f7fa', fontSize: 17, fontWeight: '700' },
  providerVendor: { color: '#8aa0b4', fontSize: 13, fontWeight: '400' },
  providerSelected: { color: '#3ddc97', fontSize: 18, fontWeight: '700' },
  providerMeta: { color: '#8aa0b4', fontSize: 12, marginTop: 4 },
  providerStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  providerStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  providerStatusText: { fontSize: 13, flex: 1 },
  providerHelp: {
    color: '#7fb5ff',
    fontSize: 12,
    textDecorationLine: 'underline',
    marginLeft: 8,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c242e',
  },
  rowLabel: { color: '#f5f7fa', fontSize: 15 },

  segmentRow: { flexDirection: 'row', backgroundColor: '#141a22', borderRadius: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 6 },
  segmentActive: { backgroundColor: '#3ddc97', borderRadius: 8 },
  segmentText: { color: '#c2cfdb', fontWeight: '600' },
  segmentTextActive: { color: '#0b0f14' },

  resetBtn: {
    marginTop: 28,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1c242e',
  },
  resetBtnText: { color: '#ff8a65', fontWeight: '700' },
});
