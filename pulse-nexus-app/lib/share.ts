/**
 * "Ask external AI" plumbing.
 *
 * Pulse Nexus can hand a deterministic plain-text snapshot to whichever
 * AI app the user prefers — ChatGPT, Claude, Grok — via the iOS Share
 * Sheet (universal: any installed app appears as a target).
 *
 * For ChatGPT and Claude we *also* try a deep-link URL scheme so the
 * receiving app opens directly with the prompt pre-filled when possible;
 * if that fails we fall back to the share sheet.
 *
 * This is the simple, no-backend path. For ChatGPT to *actively pull*
 * Pulse Nexus data via its own tools, deploy the connector in
 * `../pulse-nexus-connector/` and install it as a Custom GPT.
 */
import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { wrapForExternalAI } from './snapshot-text';

export type ExternalTarget = 'chatgpt' | 'claude' | 'grok' | 'system' | 'clipboard';

type DeepLinkAttempt = { url: string; prepareText?: (t: string) => string };

const DEEP_LINKS: Record<Exclude<ExternalTarget, 'system' | 'clipboard'>, DeepLinkAttempt[]> = {
  chatgpt: [
    { url: 'chatgpt://?prompt=' },
    { url: 'https://chat.openai.com/?q=' },
  ],
  claude: [
    { url: 'claude://chat?q=' },
    { url: 'https://claude.ai/new?q=' },
  ],
  grok: [
    { url: 'https://grok.com/?q=' },
  ],
};

async function tryDeepLinks(attempts: DeepLinkAttempt[], wrapped: string): Promise<boolean> {
  for (const attempt of attempts) {
    const url = attempt.url + encodeURIComponent(wrapped);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // Try the next one.
    }
  }
  return false;
}

async function shareViaSheet(wrapped: string, subject: string): Promise<void> {
  await Share.share({ message: wrapped, title: subject }, { subject });
}

export type ShareInput = {
  snapshotText: string;
  target: ExternalTarget;
  subject?: string;
};

export async function shareSnapshot(input: ShareInput): Promise<void> {
  const wrapped = wrapForExternalAI(input.snapshotText);
  const subject = input.subject ?? 'Pulse Nexus snapshot';

  if (input.target === 'clipboard') {
    await Clipboard.setStringAsync(wrapped);
    return;
  }

  if (input.target === 'system') {
    await shareViaSheet(wrapped, subject);
    return;
  }

  const opened = await tryDeepLinks(DEEP_LINKS[input.target], wrapped);
  if (!opened) {
    // The user might not have the target app installed; fall back to the
    // universal share sheet so they can pick one or two web alternatives.
    await shareViaSheet(wrapped, subject);
  }
}
