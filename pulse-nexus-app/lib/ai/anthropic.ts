/**
 * Anthropic Claude provider.
 *
 * Defaults to claude-3-5-haiku-latest for cost; bump to a sonnet/opus model
 * via EXPO_PUBLIC_ANTHROPIC_MODEL for higher quality. Web search is supported
 * via Anthropic's web_search tool on capable models.
 *
 * Get an API key at https://console.anthropic.com/settings/keys (paid).
 *
 * NOTE: Anthropic's API historically rejects browser-origin requests. We send
 * a vendor-recommended header to opt in to direct-from-client usage; if
 * Anthropic later requires a server intermediary, route this provider through
 * a Cloudflare/Vercel function. The structure below isolates that change.
 */
import { missingKeyError, readEnv } from './env';
import type { ChatProvider, ChatTurnInput, ChatTurnResult, GroundingSource } from './types';

const MODEL = readEnv('EXPO_PUBLIC_ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-latest';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ENV = 'EXPO_PUBLIC_ANTHROPIC_API_KEY';
const HELP = 'https://console.anthropic.com/settings/keys';

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
    citations?: Array<{ url?: string; title?: string }>;
  }>;
};

async function chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const key = readEnv(ENV);
  if (!key) throw missingKeyError(ENV, HELP);

  const messages = [
    ...input.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: input.userMessage },
  ];

  const body = {
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    system: input.system,
    messages,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Anthropic request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as AnthropicResponse;
  const blocks = json.content ?? [];
  const text = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  const sources: GroundingSource[] = blocks
    .flatMap((b) => b.citations ?? [])
    .filter((c) => !!c.url)
    .map((c) => ({ title: c.title ?? c.url ?? '', uri: c.url ?? '' }));
  return { text, sources };
}

export const anthropicProvider: ChatProvider = {
  id: 'anthropic',
  name: 'Claude',
  vendor: 'Anthropic',
  modelLabel: MODEL,
  hasWebSearch: false,
  apiKeyEnvVar: ENV,
  apiKeyHelpUrl: HELP,
  isConfigured: () => readEnv(ENV) !== null,
  chatTurn,
};
