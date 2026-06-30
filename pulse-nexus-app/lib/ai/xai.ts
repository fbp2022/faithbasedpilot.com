/**
 * xAI Grok provider.
 *
 * xAI's API is OpenAI-compatible at the chat-completions level, plus an
 * additional `search_parameters` field for built-in live web search.
 *
 * Defaults to grok-2-latest. Override via EXPO_PUBLIC_XAI_MODEL.
 *
 * Get an API key at https://console.x.ai/ (paid; SuperGrok subscribers may
 * receive monthly API credits).
 */
import { missingKeyError, readEnv } from './env';
import type { ChatProvider, ChatTurnInput, ChatTurnResult, GroundingSource } from './types';

const MODEL = readEnv('EXPO_PUBLIC_XAI_MODEL') ?? 'grok-2-latest';
const ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const ENV = 'EXPO_PUBLIC_XAI_API_KEY';
const HELP = 'https://console.x.ai/';

type ChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
      citations?: Array<string | { url?: string; title?: string }>;
    };
  }>;
  citations?: Array<string | { url?: string; title?: string }>;
};

async function chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const key = readEnv(ENV);
  if (!key) throw missingKeyError(ENV, HELP);

  const messages = [
    { role: 'system' as const, content: input.system },
    ...input.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: input.userMessage },
  ];

  const body = {
    model: MODEL,
    messages,
    temperature: 0.3,
    search_parameters: { mode: 'auto' },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`xAI request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as ChatCompletion;
  const choice = json.choices?.[0];
  const text = choice?.message?.content?.trim() ?? '';
  const raw = choice?.message?.citations ?? json.citations ?? [];
  const sources: GroundingSource[] = raw
    .map((c) => (typeof c === 'string' ? { title: c, uri: c } : c.url ? { title: c.title ?? c.url, uri: c.url } : null))
    .filter((x): x is GroundingSource => !!x);
  return { text, sources };
}

export const xaiProvider: ChatProvider = {
  id: 'xai',
  name: 'Grok',
  vendor: 'xAI',
  modelLabel: MODEL,
  hasWebSearch: true,
  apiKeyEnvVar: ENV,
  apiKeyHelpUrl: HELP,
  isConfigured: () => readEnv(ENV) !== null,
  chatTurn,
};
