import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { connectFitbit, disconnectFitbit, isFitbitConnected } from '@/lib/fitbit';
import {
  connectGarmin,
  disconnectGarmin,
  isGarminConfigured,
  isGarminConnected,
} from '@/lib/garmin';
import { disconnectWhoop, isWhoopConnected } from '@/lib/whoop';

type ProviderKey = 'whoop' | 'fitbit' | 'garmin';

type ProviderRow = {
  key: ProviderKey;
  name: string;
  blurb: string;
  notice?: string;
  isConnected: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  connect?: () => Promise<void>;
  route?: string;
  connectLabel?: string;
};

const PROVIDERS: ProviderRow[] = [
  {
    key: 'whoop',
    name: 'WHOOP',
    blurb:
      'Direct Bluetooth pairing with your WHOOP strap. No WHOOP account, no subscription, no cloud. Live heart rate streams as soon as you pair.',
    isConnected: isWhoopConnected,
    disconnect: disconnectWhoop,
    route: '/whoop-connect',
    connectLabel: 'Pair over Bluetooth',
  },
  {
    key: 'fitbit',
    name: 'Fitbit (incl. new Google models & Pixel Watch)',
    blurb: 'Steps, heart rate, sleep, HRV, SpO₂. Signs in via Google account.',
    isConnected: isFitbitConnected,
    connect: connectFitbit,
    disconnect: disconnectFitbit,
  },
  {
    key: 'garmin',
    name: 'Garmin',
    blurb: 'Steps, body battery, stress, HRV, sleep score.',
    notice:
      'Garmin Health API requires partner approval at developerportal.garmin.com. Until you are approved and have added GARMIN credentials to .env, this button will surface an "approval required" error.',
    isConnected: isGarminConnected,
    connect: connectGarmin,
    disconnect: disconnectGarmin,
  },
];

export default function ConnectScreen() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [garminReady] = useState<boolean>(isGarminConfigured());

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(async (p) => [p.key, await p.isConnected().catch(() => false)] as const),
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-refresh when returning from a modal (e.g. /whoop-connect after pairing).
  useEffect(() => {
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const onConnect = async (p: ProviderRow) => {
    if (p.route) {
      router.push(p.route as never);
      return;
    }
    if (!p.connect) return;
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
    try {
      await p.disconnect();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Connect your devices</Text>
        <Text style={styles.p}>
          Connect any combination of the services below. Pulse Nexus will merge what it can read
          from each and tell you in plain English when two devices disagree.
        </Text>

        {PROVIDERS.map((p) => {
          const connected = statuses[p.key];
          const isBusy = busy === p.key;
          const err = errors[p.key];
          const showApprovalNotice = p.key === 'garmin' && !garminReady;
          return (
            <View key={p.key} style={styles.card}>
              <Text style={styles.cardTitle}>{p.name}</Text>
              <Text style={styles.cardBlurb}>{p.blurb}</Text>

              {p.notice ? <Text style={styles.notice}>{p.notice}</Text> : null}

              <View style={styles.cardRow}>
                <Text style={styles.statusLabel}>Status</Text>
                {connected === undefined || connected === null ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.statusValue, { color: connected ? '#3ddc97' : '#ff8a65' }]}>
                    {connected ? 'Connected' : 'Not connected'}
                  </Text>
                )}
              </View>

              {connected === false ? (
                <Pressable
                  style={[styles.button, showApprovalNotice && { opacity: 0.6 }]}
                  onPress={() => onConnect(p)}
                  disabled={isBusy}
                >
                  <Text style={styles.buttonText}>
                    {isBusy
                      ? `Opening ${p.name}…`
                      : p.connectLabel ?? `Connect ${p.name.split(' ')[0]}`}
                  </Text>
                </Pressable>
              ) : null}

              {connected === true ? (
                <View style={styles.rowActions}>
                  {p.route ? (
                    <Pressable
                      style={[styles.button, styles.buttonSecondary]}
                      onPress={() => onConnect(p)}
                      disabled={isBusy}
                    >
                      <Text style={styles.buttonSecondaryText}>Manage</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.button, { backgroundColor: '#ff8a65', flex: 1 }]}
                    onPress={() => onDisconnect(p)}
                    disabled={isBusy}
                  >
                    <Text style={styles.buttonText}>{isBusy ? 'Disconnecting…' : 'Disconnect'}</Text>
                  </Pressable>
                </View>
              ) : null}

              {err ? <Text style={styles.error}>{err}</Text> : null}
            </View>
          );
        })}

        <Text style={styles.h2}>Apple Health</Text>
        <Text style={styles.p}>
          Apple Health permissions are requested automatically on the dashboard. To change them,
          open the iOS Settings app → Privacy & Security → Health → Pulse Nexus.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 18 },
  h1: { color: '#f5f7fa', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  h2: { color: '#f5f7fa', fontSize: 22, fontWeight: '700', marginTop: 28, marginBottom: 8 },
  p: { color: '#c2cfdb', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  cardTitle: { color: '#f5f7fa', fontSize: 18, fontWeight: '700' },
  cardBlurb: { color: '#8aa0b4', fontSize: 13, marginTop: 4 },
  notice: {
    color: '#f1e6b8',
    fontSize: 13,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#2a210a',
    borderRadius: 8,
    borderLeftColor: '#f1c40f',
    borderLeftWidth: 3,
    lineHeight: 18,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  statusLabel: { color: '#8aa0b4', fontSize: 14 },
  statusValue: { fontSize: 15, fontWeight: '700' },
  button: {
    backgroundColor: '#3ddc97',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#0b0f14', fontSize: 15, fontWeight: '700' },
  buttonSecondary: {
    backgroundColor: '#1c242e',
    flex: 1,
    marginRight: 8,
  },
  buttonSecondaryText: { color: '#c2cfdb', fontSize: 15, fontWeight: '700' },
  rowActions: { flexDirection: 'row' },
  error: { color: '#ff8a65', marginTop: 10, fontSize: 13 },
});
