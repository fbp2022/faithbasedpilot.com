/**
 * Active-AI-provider registry.
 *
 * The Coach chat asks `getActiveProvider()` for whichever provider the user
 * picked in Preferences and uses it for every turn. If the active provider
 * isn't configured (missing API key in .env), `chatTurn()` will throw a
 * helpful error pointing the user to the right env var.
 */
import { loadPreferences, type ProviderId } from '../preferences';
import { unify, type CombinedSnapshot } from '../assistant';
import type { ChatMessage, ChatProvider, ChatTurnResult, GroundingSource } from './types';

import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import { xaiProvider } from './xai';

export const PROVIDERS: Record<ProviderId, ChatProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  xai: xaiProvider,
};

export const PROVIDER_ORDER: ProviderId[] = ['gemini', 'openai', 'anthropic', 'xai'];

const SYSTEM_INSTRUCTION = `You are the Pulse Nexus coach: a friendly, concise health and fitness assistant inside an iPhone app called Pulse Nexus, made by Faith Based Innovations.

You can see a snapshot of the user's most recent metrics — heart rate variability, recovery, sleep stages, strain, body battery, steps, and so on — pulled from Apple Health, WHOOP, Fitbit, and Garmin. Use those values when they are relevant. Refer to them by source when the user asks where a number came from.

Style rules:
- Lead with the answer, then the explanation.
- Default to 2-5 sentences. Use bullet points only when the user asks for steps or comparisons.
- If a number is missing in the snapshot, say "I don't have a current reading for that" rather than guessing.
- Cite the source on the dashboard (e.g., "WHOOP says..." or "Apple Health says...") when quoting a specific value.

Hard limits:
- You are not a doctor. Do not diagnose, prescribe, or give specific medical, legal, or financial advice. For symptoms that concern the user, recommend they consult a clinician.
- You can recommend training adjustments and lifestyle habits (sleep, hydration, walking, breathing) within the range of common consumer-fitness guidance.
- When using web search, summarize and cite. Don't pretend a result is your own opinion.`;

export function summarizeContext(snap: CombinedSnapshot): string {
  const u = unify(snap);
  const lines: string[] = [];
  const push = (k: string, v: string | null) => {
    if (v != null) lines.push(`- ${k}: ${v}`);
  };

  push('Recovery', u.recovery ? `${u.recovery.value}% (${u.recovery.source})` : null);
  push(
    'Resting HR',
    u.restingHR ? `${Math.round(u.restingHR.value)} bpm (${u.restingHR.source})` : null,
  );
  push('HRV', u.hrvMs ? `${Math.round(u.hrvMs.value)} ms (${u.hrvMs.source})` : null);
  push(
    'Sleep last night',
    u.sleepHours ? `${u.sleepHours.value.toFixed(1)} h (${u.sleepHours.source})` : null,
  );
  push(
    'Sleep score',
    u.sleepScore ? `${Math.round(u.sleepScore.value)} (${u.sleepScore.source})` : null,
  );
  push(
    'Strain today',
    u.strainOrLoad
      ? `${u.strainOrLoad.value.toFixed(1)} / 21 (${u.strainOrLoad.source})`
      : null,
  );
  push('Body Battery', u.bodyBattery != null ? `${u.bodyBattery} (Garmin)` : null);
  push('Stress avg', u.stressAvg != null ? `${u.stressAvg} (Garmin)` : null);
  push(
    'Steps today',
    u.steps ? `${Math.round(u.steps.value).toLocaleString()} (${u.steps.source})` : null,
  );
  push(
    'Active kcal today',
    u.activeKcal
      ? `${Math.round(u.activeKcal.value).toLocaleString()} (${u.activeKcal.source})`
      : null,
  );
  push('SpO₂', u.spo2 ? `${u.spo2.value.toFixed(0)}% (${u.spo2.source})` : null);

  if (lines.length === 0) {
    return "The user has no live metrics available right now — they haven't connected a device yet, or their connected sources returned no data.";
  }
  return `Current user metrics (from the Pulse Nexus dashboard):\n${lines.join('\n')}`;
}

export async function getActiveProvider(): Promise<ChatProvider> {
  const prefs = await loadPreferences();
  return PROVIDERS[prefs.aiProvider] ?? geminiProvider;
}

export async function chatTurn(
  history: ChatMessage[],
  userMessage: string,
  healthContext?: CombinedSnapshot,
): Promise<ChatTurnResult & { providerName: string; providerVendor: string }> {
  const provider = await getActiveProvider();
  const systemText = healthContext
    ? `${SYSTEM_INSTRUCTION}\n\n${summarizeContext(healthContext)}`
    : SYSTEM_INSTRUCTION;
  const result = await provider.chatTurn({
    system: systemText,
    history,
    userMessage,
  });
  return { ...result, providerName: provider.name, providerVendor: provider.vendor };
}

export type { ChatMessage, ChatTurnResult, GroundingSource, ChatProvider };
