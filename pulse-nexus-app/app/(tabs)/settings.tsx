import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import Constants from 'expo-constants';

export default function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  const publisher =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.publisher ??
    'Faith Based Innovations';

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Settings</Text>

        <Link href="/connect" asChild>
          <Pressable style={styles.actionRow}>
            <View>
              <Text style={styles.actionTitle}>Connect devices</Text>
              <Text style={styles.actionSub}>WHOOP, Fitbit, Garmin</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </Link>

        <Link href="/preferences" asChild>
          <Pressable style={styles.actionRow}>
            <View>
              <Text style={styles.actionTitle}>Preferences</Text>
              <Text style={styles.actionSub}>Coach engine, dashboard cards, units</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </Link>

        <Text style={styles.h2}>About</Text>
        <View style={styles.row}>
          <Text style={styles.label}>App</Text>
          <Text style={styles.value}>Pulse Nexus</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Built by</Text>
          <Text style={styles.value}>{publisher}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>{version}</Text>
        </View>

        <Text style={styles.h2}>How insights work</Text>
        <Text style={styles.p}>
          Dashboard insights are deterministic rules in the app — no machine learning. The exact
          rules are visible in source, so anything the app says can be traced to a specific
          comparison on your data.
        </Text>

        <Text style={styles.h2}>How the Coach chat works</Text>
        <Text style={styles.p}>
          The Coach tab is a multi-turn chat. You can pick the AI provider in Preferences — Google
          Gemini, ChatGPT (OpenAI), Claude (Anthropic), or Grok (xAI). Each turn sends the provider
          a deterministic plain-text summary of your current Pulse Nexus metrics, the prior
          conversation, and your new message. The coach is instructed not to give medical advice.
          Like any generative AI, it can be wrong — verify before relying on its answers,
          especially for medical, legal, or financial questions.
        </Text>

        <Text style={styles.h2}>How Workouts works</Text>
        <Text style={styles.p}>
          The Workouts tab pulls workout history in parallel from every connected source — Apple
          Health, WHOOP, Fitbit, and Garmin — normalizes the fields into one shape, and shows them
          newest-first. Filter by source and time window.
        </Text>

        <Text style={styles.h2}>How Sleep works</Text>
        <Text style={styles.p}>
          The Sleep tab shows last night merged across all four sources, with the most detailed
          source picked as the primary (priority: WHOOP → Garmin → Fitbit → Apple Health). When
          multiple sources have data, a per-device comparison is shown below so you can see how
          each one classified the same night.
        </Text>

        <Text style={styles.h2}>Privacy</Text>
        <Text style={styles.p}>
          Apple Health data is read on-device. WHOOP, Fitbit, and Garmin data are fetched directly
          from those vendors&apos; servers using OAuth tokens stored in the iOS Keychain — Pulse
          Nexus has no backend of its own. The only data that leaves your phone goes to your
          chosen AI provider, and only when you use the Coach tab: your message, the prior chat
          turns, and a compact plain-text summary of your current metrics.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 18 },
  h1: { color: '#f5f7fa', fontSize: 28, fontWeight: '800' },
  h2: { color: '#f5f7fa', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 6 },
  p: { color: '#c2cfdb', fontSize: 14, lineHeight: 20 },

  actionRow: {
    backgroundColor: '#141a22',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionTitle: { color: '#f5f7fa', fontSize: 16, fontWeight: '700' },
  actionSub: { color: '#8aa0b4', fontSize: 12, marginTop: 2 },
  chev: { color: '#6c8094', fontSize: 22, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c242e',
  },
  label: { color: '#8aa0b4', fontSize: 14 },
  value: { color: '#f5f7fa', fontSize: 14, fontWeight: '600' },
});
