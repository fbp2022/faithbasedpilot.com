/**
 * Back-compat shim. The Coach chat now uses lib/ai/, which supports Gemini,
 * ChatGPT, Claude, and Grok — selected by the user in Preferences.
 *
 * New code should import from `@/lib/ai` instead.
 */
export { chatTurn, summarizeContext, getActiveProvider, PROVIDERS, PROVIDER_ORDER } from './ai';
export type { ChatMessage, GroundingSource, ChatTurnResult, ChatProvider } from './ai';

import type { ChatTurnResult } from './ai/types';
import { geminiProvider } from './ai/gemini';

/**
 * Single-shot ask using Gemini specifically (kept for any non-chat callers).
 * New UI should use the multi-provider chatTurn() from `@/lib/ai`.
 */
export async function askWeb(question: string): Promise<ChatTurnResult> {
  return geminiProvider.chatTurn({ system: '', history: [], userMessage: question });
}
