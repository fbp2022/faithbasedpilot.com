import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { chatTurn, getActiveProvider } from '@/lib/ai';
import type { ChatMessage, ChatProvider, GroundingSource } from '@/lib/ai/types';
import {
  getTodaySnapshot,
  requestHealthPermissions,
  type DailyHealthSnapshot,
} from '@/lib/healthkit';
import {
  getLatestWhoopCycle,
  getLatestWhoopRecovery,
  getLatestWhoopSleep,
  isWhoopConnected,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from '@/lib/whoop';
import { getFitbitSnapshot, isFitbitConnected, type FitbitSnapshot } from '@/lib/fitbit';
import { getGarminSnapshot, isGarminConnected, type GarminSnapshot } from '@/lib/garmin';
import type { CombinedSnapshot } from '@/lib/assistant';

type DisplayMessage = ChatMessage & {
  id: string;
  pending?: boolean;
  sources?: GroundingSource[];
  error?: string;
};

const SUGGESTIONS = [
  'Why is my recovery low?',
  'What should I do today based on my data?',
  'Is my HRV trending in a healthy range?',
  'Compare my WHOOP and Apple Health resting HR.',
];

const WELCOME: DisplayMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    "Hi — I'm the Pulse Nexus coach. I can see your most recent Apple Health, WHOOP, Fitbit, and Garmin data, and I can search the web. Ask me anything about your training, recovery, or sleep.",
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [snapshot, setSnapshot] = useState<CombinedSnapshot | null>(null);
  const [provider, setProvider] = useState<ChatProvider | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const loadProvider = useCallback(async () => {
    const p = await getActiveProvider();
    setProvider(p);
  }, []);

  const loadSnapshot = useCallback(async () => {
    await requestHealthPermissions().catch(() => {});
    const [health, whoopConnected, fitbitConnected, garminConnected] = await Promise.all([
      getTodaySnapshot().catch<DailyHealthSnapshot | null>(() => null),
      isWhoopConnected(),
      isFitbitConnected(),
      isGarminConnected(),
    ]);

    const [whoop, fitbit, garmin] = await Promise.all([
      whoopConnected
        ? Promise.all([
            getLatestWhoopRecovery().catch<WhoopRecovery | null>(() => null),
            getLatestWhoopSleep().catch<WhoopSleep | null>(() => null),
            getLatestWhoopCycle().catch<WhoopCycle | null>(() => null),
          ]).then(([recovery, sleep, cycle]) => ({ recovery, sleep, cycle }))
        : Promise.resolve({ recovery: null, sleep: null, cycle: null }),
      fitbitConnected
        ? getFitbitSnapshot().catch<FitbitSnapshot | null>(() => null)
        : Promise.resolve<FitbitSnapshot | null>(null),
      garminConnected
        ? getGarminSnapshot().catch<GarminSnapshot | null>(() => null)
        : Promise.resolve<GarminSnapshot | null>(null),
    ]);

    setSnapshot({ health, whoop, fitbit, garmin });
  }, []);

  useEffect(() => {
    loadProvider();
    loadSnapshot();
  }, [loadProvider, loadSnapshot]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMsg: DisplayMessage = { id: `u${Date.now()}`, role: 'user', text: trimmed };
      const pendingId = `m${Date.now()}`;
      const pendingMsg: DisplayMessage = {
        id: pendingId,
        role: 'assistant',
        text: '',
        pending: true,
      };
      setMessages((m) => [...m, userMsg, pendingMsg]);
      setInput('');
      setSending(true);

      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

      try {
        const history: ChatMessage[] = messages
          .filter((m) => m.id !== 'welcome' && !m.error && !m.pending)
          .map((m) => ({ role: m.role, text: m.text }));

        const result = await chatTurn(history, trimmed, snapshot ?? undefined);
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? { ...msg, text: result.text, pending: false, sources: result.sources }
              : msg,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((m) =>
          m.map((x) =>
            x.id === pendingId ? { ...x, pending: false, text: '', error: msg } : x,
          ),
        );
      } finally {
        setSending(false);
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [messages, sending, snapshot],
  );

  const newConversation = useCallback(() => {
    setMessages([WELCOME]);
    setInput('');
    loadProvider();
    loadSnapshot();
  }, [loadProvider, loadSnapshot]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <DisclaimerBanner />

        {provider ? (
          <Link href="/preferences" asChild>
            <Pressable style={styles.providerBar}>
              <Text style={styles.providerLabel}>Coach engine</Text>
              <Text style={styles.providerValue}>
                {provider.name} · {provider.modelLabel}
                {!provider.isConfigured() ? '  ⚠️ key missing' : ''}
              </Text>
            </Pressable>
          </Link>
        ) : null}

        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}

          {messages.length === 1 ? (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={styles.suggestion}
                  onPress={() => sendMessage(s)}
                  disabled={sending}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputRow}>
          <Pressable onPress={newConversation} style={styles.newBtn} disabled={sending}>
            <Text style={styles.newBtnText}>+</Text>
          </Pressable>
          <TextInput
            placeholder={`Ask ${provider?.name ?? 'the coach'}…`}
            placeholderTextColor="#6c8094"
            value={input}
            onChangeText={setInput}
            style={styles.input}
            multiline
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit
            editable={!sending}
          />
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={sending || !input.trim()}
            style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.4 }]}
          >
            <Text style={styles.sendBtnText}>{sending ? '…' : 'Send'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.coachBubble]}>
        {msg.pending ? (
          <ActivityIndicator color="#c2cfdb" />
        ) : msg.error ? (
          <Text style={styles.error}>{msg.error}</Text>
        ) : (
          <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>{msg.text}</Text>
        )}

        {msg.sources && msg.sources.length > 0 ? (
          <View style={styles.sources}>
            <Text style={styles.sourcesHeader}>Sources</Text>
            {msg.sources.slice(0, 5).map((s, i) => (
              <Pressable key={i} onPress={() => Linking.openURL(s.uri)}>
                <Text style={styles.sourceLink} numberOfLines={1}>
                  {i + 1}. {s.title || s.uri}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  providerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0f1620',
    borderBottomWidth: 1,
    borderBottomColor: '#1c242e',
  },
  providerLabel: {
    color: '#8aa0b4',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  providerValue: { color: '#f5f7fa', fontSize: 13, fontWeight: '600' },
  scroll: { padding: 8, paddingBottom: 16 },
  bubbleRow: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 4 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 14 },
  coachBubble: { backgroundColor: '#141a22' },
  userBubble: { backgroundColor: '#3ddc97' },
  bubbleText: { color: '#f5f7fa', fontSize: 15, lineHeight: 22 },
  userBubbleText: { color: '#0b0f14', fontWeight: '600' },
  error: { color: '#ff8a65', fontSize: 14 },
  sources: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1c242e' },
  sourcesHeader: {
    color: '#8aa0b4',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  sourceLink: { color: '#7fb5ff', fontSize: 13, marginTop: 3, textDecorationLine: 'underline' },
  suggestions: { marginTop: 16, paddingHorizontal: 4 },
  suggestion: {
    backgroundColor: '#141a22',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftColor: '#3ddc97',
    borderLeftWidth: 3,
  },
  suggestionText: { color: '#c2cfdb', fontSize: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: 12,
    borderTopColor: '#1c242e',
    borderTopWidth: 1,
    backgroundColor: '#0b0f14',
  },
  newBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141a22',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  newBtnText: { color: '#f5f7fa', fontSize: 22, marginTop: -2 },
  input: {
    flex: 1,
    backgroundColor: '#141a22',
    color: '#f5f7fa',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 38,
  },
  sendBtn: {
    backgroundColor: '#3ddc97',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendBtnText: { color: '#0b0f14', fontSize: 15, fontWeight: '700' },
});
