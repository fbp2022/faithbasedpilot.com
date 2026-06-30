/**
 * Persisted user preferences. Lives in the iOS Keychain via expo-secure-store
 * so the user's choices survive reinstall just like their OAuth tokens.
 */
import { getSecret, setSecret } from './storage';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'xai';

export type DashboardCardKey =
  | 'steps'
  | 'activeKcal'
  | 'restingHR'
  | 'hrvMs'
  | 'recovery'
  | 'sleep'
  | 'strain'
  | 'bodyBattery'
  | 'spo2'
  | 'stress';

export type Preferences = {
  aiProvider: ProviderId;
  dashboardCards: Record<DashboardCardKey, boolean>;
  units: 'metric' | 'imperial';
};

export const DEFAULT_PREFERENCES: Preferences = {
  aiProvider: 'gemini',
  dashboardCards: {
    steps: true,
    activeKcal: true,
    restingHR: true,
    hrvMs: true,
    recovery: true,
    sleep: true,
    strain: true,
    bodyBattery: true,
    spo2: false,
    stress: false,
  },
  units: 'metric',
};

const KEY = 'preferences.v1';

export async function loadPreferences(): Promise<Preferences> {
  const raw = await getSecret(KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      dashboardCards: {
        ...DEFAULT_PREFERENCES.dashboardCards,
        ...(parsed.dashboardCards ?? {}),
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await setSecret(KEY, JSON.stringify(prefs));
}

export async function updatePreferences(
  patch: (current: Preferences) => Preferences,
): Promise<Preferences> {
  const current = await loadPreferences();
  const next = patch(current);
  await savePreferences(next);
  return next;
}
