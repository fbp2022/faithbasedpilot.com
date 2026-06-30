/**
 * Shared types for chat providers (Gemini, ChatGPT, Claude, Grok).
 *
 * Each provider implements `ChatProvider` so the Coach screen can swap
 * between them at runtime based on the user's preference.
 */
export type ChatRole = 'user' | 'assistant';

export type ChatMessage = { role: ChatRole; text: string };

export type GroundingSource = { title: string; uri: string };

export type ChatTurnResult = {
  text: string;
  sources: GroundingSource[];
};

export type ChatTurnInput = {
  system: string;
  history: ChatMessage[];
  userMessage: string;
};

export interface ChatProvider {
  id: 'gemini' | 'openai' | 'anthropic' | 'xai';
  name: string;
  vendor: string;
  modelLabel: string;
  hasWebSearch: boolean;
  apiKeyEnvVar: string;
  apiKeyHelpUrl: string;
  isConfigured: () => boolean;
  chatTurn: (input: ChatTurnInput) => Promise<ChatTurnResult>;
}
