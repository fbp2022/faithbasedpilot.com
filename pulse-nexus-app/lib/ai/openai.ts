/**
 * OpenAI ChatGPT provider.
 *
 * Defaults to gpt-4o-mini for cost. Web search is supported via the new
 * `web_search` tool on supported models; if disabled or unsupported, the
 * model answers from its own knowledge.
 *
 * Get an API key at https://platform.openai.com/api-keys (paid).
 */
import { missingKeyError, readEnv } from './env';
import type { ChatProvider, ChatTurnInput, ChatTurnResult, GroundingSource } from './types';

const MODEL = readEnv('EXPO_PUBLIC_OPENAI_MODEL') ?? 'gpt-4o-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ENV = 'EXPO_PUBLIC_OPENAI_API_KEY';
const HELP = 'https://platform.openai.com/api-keys';

type ChatCompletion = {
  choices?: Array<{
    message?: { content?: string; annotations?: Array<{ url?: string; title?: string }> };
  }>;
};

async function chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const key = readEnv(ENV);
  if (!key) throw missingKeyError(ENV, HELP);

  const messages = [
    { role: 'system' as const, content: input.system },
    ...input.history.map((m) => ({
      role: m.role,
      content: m.text,
    })),
    { role: 'user' as const, content: input.userMessage },
  ];

  const body = {
    model: MODEL,
    messages,
    temperature: 0.3,
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
    throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as ChatCompletion;
  const choice = json.choices?.[0];
  const text = choice?.message?.content?.trim() ?? '';
  const sources: GroundingSource[] =
    choice?.message?.annotations
      ?.filter((a) => !!a.url)
      .map((a) => ({ title: a.title ?? a.url ?? '', uri: a.url ?? '' })) ?? [];
  return { text, sources };
}

export const openaiProvider: ChatProvider = {
  id: 'openai',
  name: 'ChatGPT',
  vendor: 'OpenAI',
  modelLabel: MODEL,
  hasWebSearch: false,
  apiKeyEnvVar: ENV,
  apiKeyHelpUrl: HELP,
  isConfigured: () => readEnv(ENV) !== null,
  chatTurn,
};
