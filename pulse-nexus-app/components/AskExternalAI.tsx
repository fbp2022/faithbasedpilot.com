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
import { colors, radii, spacing } from '@/lib/theme';

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
        <Ionicons name="share-outline" size={20} color={colors.accent} />
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
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md },
  cancel: { padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  cancelText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
