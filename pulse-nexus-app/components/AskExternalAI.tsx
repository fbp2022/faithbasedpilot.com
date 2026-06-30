import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { shareSnapshot, type ExternalTarget } from '@/lib/share';

type Target = {
  id: ExternalTarget;
  label: string;
  sub: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TARGETS: Target[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    sub: 'Open the ChatGPT app with this data as the prompt',
    color: '#10a37f',
    icon: 'chatbubble-ellipses',
  },
  {
    id: 'claude',
    label: 'Claude',
    sub: 'Open Anthropic Claude with this data as the prompt',
    color: '#d97757',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    id: 'grok',
    label: 'Grok',
    sub: 'Open grok.com with this data as the prompt',
    color: '#1f1f1f',
    icon: 'sparkles',
  },
  {
    id: 'system',
    label: 'Share to…',
    sub: 'iOS share sheet — pick any installed app',
    color: '#5b8def',
    icon: 'share-outline',
  },
  {
    id: 'clipboard',
    label: 'Copy to clipboard',
    sub: 'Paste into anything',
    color: '#8aa0b4',
    icon: 'copy-outline',
  },
];

export function AskExternalAIButton({
  getSnapshotText,
  subject,
}: {
  getSnapshotText: () => Promise<string> | string;
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busyTarget, setBusyTarget] = useState<ExternalTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePress = async (target: ExternalTarget) => {
    setBusyTarget(target);
    setError(null);
    try {
      const snapshotText = await getSnapshotText();
      await shareSnapshot({ snapshotText, target, subject });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyTarget(null);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Ask external AI about this data"
        style={styles.headerBtn}
      >
        <Ionicons name="share-outline" size={22} color="#f5f7fa" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Ask about this data</Text>
            <Text style={styles.subtitle}>
              Pulse Nexus will hand a plain-text snapshot to whichever app you choose. Nothing
              leaves your phone until you confirm.
            </Text>

            {TARGETS.map((t) => (
              <Pressable
                key={t.id}
                style={styles.row}
                onPress={() => handlePress(t.id)}
                disabled={busyTarget !== null}
              >
                <View style={[styles.iconWrap, { backgroundColor: t.color }]}>
                  <Ionicons name={t.icon} size={20} color="#fff" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{t.label}</Text>
                  <Text style={styles.rowSub}>{t.sub}</Text>
                </View>
                {busyTarget === t.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#6c8094" />
                )}
              </Pressable>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141a22',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 28,
  },
  title: { color: '#f5f7fa', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#8aa0b4', fontSize: 13, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c242e',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { color: '#f5f7fa', fontSize: 16, fontWeight: '700' },
  rowSub: { color: '#8aa0b4', fontSize: 12, marginTop: 2 },
  error: { color: '#ff8a65', fontSize: 13, marginTop: 12 },
  cancel: { padding: 14, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#7fb5ff', fontSize: 15, fontWeight: '600' },
});
