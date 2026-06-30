/**
 * Fitbit Web API client.
 *
 * Works for all current Fitbit devices, including the Google-era models
 * (Charge 6, Inspire 3, Versa 4, Sense 2) and Pixel Watch (Fitbit data
 * is accessible via the Fitbit Web API once the user signs in with their
 * Google account, which the Fitbit OAuth flow handles transparently).
 *
 * Docs: https://dev.fitbit.com/build/reference/web-api/
 * Auth: OAuth 2.0 with PKCE
 *   Authorize: https://www.fitbit.com/oauth2/authorize
 *   Token:     https://api.fitbit.com/oauth2/token
 *   API base:  https://api.fitbit.com
 *
 * Redirect URI registered with Fitbit: forgefit://fitbit-callback
 *
 * Free for personal/dev use; rate-limited per app + per user.
 */
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { getSecret, setSecret, deleteSecret } from './storage';

const AUTH_ENDPOINT = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_ENDPOINT = 'https://api.fitbit.com/oauth2/token';
const API_BASE = 'https://api.fitbit.com';

const SCOPES = [
  'activity',
  'cardio_fitness',
  'heartrate',
  'oxygen_saturation',
  'profile',
  'respiratory_rate',
  'sleep',
  'temperature',
  'weight',
];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: AUTH_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
};

function env(name: string): string {
  const v =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name] ??
    (process.env[name] as string | undefined);
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export async function connectFitbit(): Promise<void> {
  const clientId = env('EXPO_PUBLIC_FITBIT_CLIENT_ID');
  const clientSecret = env('EXPO_PUBLIC_FITBIT_CLIENT_SECRET');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'forgefit', path: 'fitbit-callback' });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(`Fitbit authorization failed: ${result.type}`);
  }

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      clientSecret,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );

  await persistTokens(token);
}

export async function disconnectFitbit(): Promise<void> {
  await deleteSecret('fitbit.access_token');
  await deleteSecret('fitbit.refresh_token');
  await deleteSecret('fitbit.expires_at');
}

export async function isFitbitConnected(): Promise<boolean> {
  return (await getSecret('fitbit.access_token')) !== null;
}

async function persistTokens(token: AuthSession.TokenResponse): Promise<void> {
  await setSecret('fitbit.access_token', token.accessToken);
  if (token.refreshToken) await setSecret('fitbit.refresh_token', token.refreshToken);
  if (token.expiresIn) {
    await setSecret('fitbit.expires_at', String(Date.now() + token.expiresIn * 1000));
  }
}

async function getValidAccessToken(): Promise<string> {
  const access = await getSecret('fitbit.access_token');
  const expiresAtStr = await getSecret('fitbit.expires_at');
  const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
  if (access && expiresAt - 60_000 > Date.now()) return access;

  const refresh = await getSecret('fitbit.refresh_token');
  if (!refresh) throw new Error('Fitbit not connected. Open the Connect tab to sign in.');

  const clientId = env('EXPO_PUBLIC_FITBIT_CLIENT_ID');
  const clientSecret = env('EXPO_PUBLIC_FITBIT_CLIENT_SECRET');
  const refreshed = await AuthSession.refreshAsync(
    { clientId, clientSecret, refreshToken: refresh, scopes: SCOPES },
    discovery,
  );
  await persistTokens(refreshed);
  return refreshed.accessToken;
}

async function fitbitGet<T>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Fitbit ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type FitbitDailyActivity = {
  steps: number | null;
  caloriesOut: number | null;
  veryActiveMinutes: number | null;
  fairlyActiveMinutes: number | null;
};
export type FitbitSleepSummary = {
  asleepHours: number | null;
  efficiencyPct: number | null;
  scoreMaybe: number | null;
};
export type FitbitHeartSummary = {
  restingHR: number | null;
};
export type FitbitHrvSummary = {
  dailyRmssdMs: number | null;
};
export type FitbitSpo2Summary = {
  averagePct: number | null;
};

export type FitbitSnapshot = {
  date: string;
  activity: FitbitDailyActivity;
  sleep: FitbitSleepSummary;
  heart: FitbitHeartSummary;
  hrv: FitbitHrvSummary;
  spo2: FitbitSpo2Summary;
};

export async function getFitbitSnapshot(): Promise<FitbitSnapshot> {
  const date = today();

  const [activity, sleep, heart, hrv, spo2] = await Promise.all([
    fitbitGet<{
      summary: {
        steps?: number;
        caloriesOut?: number;
        veryActiveMinutes?: number;
        fairlyActiveMinutes?: number;
      };
    }>(`/1/user/-/activities/date/${date}.json`).catch(() => null),
    fitbitGet<{
      summary?: { totalMinutesAsleep?: number; totalTimeInBed?: number };
      sleep?: Array<{ efficiency?: number; minutesAsleep?: number }>;
    }>(`/1.2/user/-/sleep/date/${date}.json`).catch(() => null),
    fitbitGet<{
      'activities-heart'?: Array<{ value?: { restingHeartRate?: number } }>;
    }>(`/1/user/-/activities/heart/date/${date}/1d.json`).catch(() => null),
    fitbitGet<{ hrv?: Array<{ value?: { dailyRmssd?: number } }> }>(
      `/1/user/-/hrv/date/${date}.json`,
    ).catch(() => null),
    fitbitGet<{ value?: { avg?: number } }>(`/1/user/-/spo2/date/${date}.json`).catch(() => null),
  ]);

  return {
    date,
    activity: {
      steps: activity?.summary.steps ?? null,
      caloriesOut: activity?.summary.caloriesOut ?? null,
      veryActiveMinutes: activity?.summary.veryActiveMinutes ?? null,
      fairlyActiveMinutes: activity?.summary.fairlyActiveMinutes ?? null,
    },
    sleep: {
      asleepHours:
        sleep?.summary?.totalMinutesAsleep != null ? sleep.summary.totalMinutesAsleep / 60 : null,
      efficiencyPct: sleep?.sleep?.[0]?.efficiency ?? null,
      scoreMaybe: null,
    },
    heart: {
      restingHR: heart?.['activities-heart']?.[0]?.value?.restingHeartRate ?? null,
    },
    hrv: {
      dailyRmssdMs: hrv?.hrv?.[0]?.value?.dailyRmssd ?? null,
    },
    spo2: {
      averagePct: spo2?.value?.avg ?? null,
    },
  };
}
