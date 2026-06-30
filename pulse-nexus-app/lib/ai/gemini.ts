/**
 * Google Gemini chat provider (free tier available via aistudio.google.com).
 *
 * Uses gemini-2.0-flash with the built-in Google Search grounding tool so the
 * coach can cite live web results.
 */
import { missingKeyError, readEnv } from './env';
import type { ChatProvider, ChatTurnInput, ChatTurnResult, GroundingSource } from './types';

const MODEL = readEnv('EXPO_PUBLIC_GEMINI_MODEL') ?? 'gemini-2.0-flash';
const ENDPOINT = (): string =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const ENV = 'EXPO_PUBLIC_GEMINI_API_KEY';
const HELP = 'https://aistudio.google.com/app/apikey';

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
    };
  }>;
};

async function chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const key = readEnv(ENV);
  if (!key) throw missingKeyError(ENV, HELP);

  const contents = [
    ...input.history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user' as const, parts: [{ text: input.userMessage }] },
  ];

  const body = {
    systemInstruction: { role: 'system', parts: [{ text: input.system }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.3 },
  };

  const res = await fetch(`${ENDPOINT()}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as GeminiResponse;
  const candidate = json.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((p) => p.text ?? '')
      .filter(Boolean)
      .join('\n')
      .trim() ?? '';
  const sources: GroundingSource[] =
    candidate?.groundingMetadata?.groundingChunks
      ?.map((c) => (c.web?.uri ? { title: c.web.title ?? c.web.uri, uri: c.web.uri } : null))
      .filter((x): x is GroundingSource => !!x) ?? [];
  return { text, sources };
}

export const geminiProvider: ChatProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  vendor: 'Google',
  modelLabel: MODEL,
  hasWebSearch: true,
  apiKeyEnvVar: ENV,
  apiKeyHelpUrl: HELP,
  isConfigured: () => readEnv(ENV) !== null,
  chatTurn,
};
