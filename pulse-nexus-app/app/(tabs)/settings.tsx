import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '@/lib/theme';

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
            <View style={[styles.actionIcon, { backgroundColor: colors.accentGlow }]}>
              <Ionicons name="link" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Connect devices</Text>
              <Text style={styles.actionSub}>Apple Health, WHOOP, Fitbit, Garmin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        </Link>

        <Link href="/preferences" asChild>
          <Pressable style={styles.actionRow}>
            <View style={[styles.actionIcon, { backgroundColor: colors.accentGlow }]}>
              <Ionicons name="options" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Preferences</Text>
              <Text style={styles.actionSub}>Coach engine, dashboard cards, units</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
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

        <Text style={styles.h2}>Sending data to the ChatGPT app</Text>
        <Text style={styles.p}>
          Every Home, Sleep, and Workouts screen has a share button in the top right. Tap it to send
          that screen&apos;s data to the external ChatGPT, Claude, or Grok app — or any other app
          via the iOS share sheet. Pulse Nexus builds a plain-text summary and hands it to the
          chosen app as the prompt; the AI then answers questions about your live data.
        </Text>
        <Text style={styles.p}>
          For a deeper integration where ChatGPT actively pulls your data on demand, deploy the
          Pulse Nexus connector (Cloudflare Worker — free tier) and install it as a Custom GPT. The
          full walkthrough is in the project&apos;s pulse-nexus-connector folder.
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
  p: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },

  actionRow: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  actionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
