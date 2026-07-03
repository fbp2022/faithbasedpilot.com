/**
 * Garmin Health API client.
 *
 * IMPORTANT — partner approval gate:
 *   The Garmin Health API is not self-serve. You must apply at
 *   https://developerportal.garmin.com/ and be approved as a partner.
 *   Until you are approved, this client cannot exchange tokens, and
 *   the Connect button will surface the error message below to the user.
 *
 * Once approved, Garmin gives you:
 *   - A Consumer Key (used as OAuth client_id)
 *   - A Consumer Secret (used as OAuth client_secret)
 *   - Confirmed authorize/token endpoints (Garmin has migrated from OAuth
 *     1.0a to OAuth 2.0 with PKCE; the endpoints below reflect their
 *     current OAuth 2.0 flow as of 2024-2025 but you should confirm
 *     against the partner kit you receive).
 *
 * Redirect URI to register with Garmin: pulsenexus://garmin-callback
 *
 * Docs: https://developer.garmin.com/gc-developer-program/health-api/
 */
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { getSecret, setSecret, deleteSecret } from './storage';

const AUTH_ENDPOINT = 'https://connect.garmin.com/oauth2Confirm';
const TOKEN_ENDPOINT = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const API_BASE = 'https://apis.garmin.com/wellness-api/rest';

const SCOPES: string[] = [];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: AUTH_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
};

const APPROVAL_REQUIRED_MESSAGE =
  'Garmin Health API access requires partner approval. Apply at https://developerportal.garmin.com/ and, once approved, add the credentials from Garmin to your .env file as EXPO_PUBLIC_GARMIN_CLIENT_ID / EXPO_PUBLIC_GARMIN_CLIENT_SECRET.';

function envOptional(name: string): string | null {
  const v =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name] ??
    (process.env[name] as string | undefined);
  return v && v.length > 0 ? v : null;
}

function envRequired(name: string): string {
  const v = envOptional(name);
  if (!v) throw new Error(APPROVAL_REQUIRED_MESSAGE);
  return v;
}

export async function connectGarmin(): Promise<void> {
  const clientId = envRequired('EXPO_PUBLIC_GARMIN_CLIENT_ID');
  const clientSecret = envRequired('EXPO_PUBLIC_GARMIN_CLIENT_SECRET');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'pulsenexus', path: 'garmin-callback' });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Garmin sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(`Garmin sign-in failed (${result.type}). Please try again.`);
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

export async function disconnectGarmin(): Promise<void> {
  await deleteSecret('garmin.access_token');
  await deleteSecret('garmin.refresh_token');
  await deleteSecret('garmin.expires_at');
}

export async function isGarminConnected(): Promise<boolean> {
  return (await getSecret('garmin.access_token')) !== null;
}

export function isGarminConfigured(): boolean {
  return (
    envOptional('EXPO_PUBLIC_GARMIN_CLIENT_ID') !== null &&
    envOptional('EXPO_PUBLIC_GARMIN_CLIENT_SECRET') !== null
  );
}

async function persistTokens(token: AuthSession.TokenResponse): Promise<void> {
  await setSecret('garmin.access_token', token.accessToken);
  if (token.refreshToken) await setSecret('garmin.refresh_token', token.refreshToken);
  if (token.expiresIn) {
    await setSecret('garmin.expires_at', String(Date.now() + token.expiresIn * 1000));
  }
}

async function getValidAccessToken(): Promise<string> {
  const access = await getSecret('garmin.access_token');
  const expiresAtStr = await getSecret('garmin.expires_at');
  const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
  if (access && expiresAt - 60_000 > Date.now()) return access;

  const refresh = await getSecret('garmin.refresh_token');
  if (!refresh) throw new Error('Garmin not connected. Open the Connect tab to sign in.');

  const clientId = envRequired('EXPO_PUBLIC_GARMIN_CLIENT_ID');
  const clientSecret = envRequired('EXPO_PUBLIC_GARMIN_CLIENT_SECRET');
  const refreshed = await AuthSession.refreshAsync(
    { clientId, clientSecret, refreshToken: refresh, scopes: SCOPES },
    discovery,
  );
  await persistTokens(refreshed);
  return refreshed.accessToken;
}

async function garminGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const token = await getValidAccessToken();
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Garmin ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export type GarminSnapshot = {
  date: string;
  steps: number | null;
  activeKcal: number | null;
  intenseMinutes: number | null;
  restingHR: number | null;
  hrvLastNightMs: number | null;
  bodyBattery: number | null;
  stressAvg: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
};

type GarminDailySummary = {
  steps?: number;
  activeKilocalories?: number;
  intensityDurationGoalInSeconds?: number;
  moderateIntensityDurationInSeconds?: number;
  vigorousIntensityDurationInSeconds?: number;
  restingHeartRateInBeatsPerMinute?: number;
  bodyBatteryHighestValue?: number;
  averageStressLevel?: number;
};
type GarminSleepSummary = {
  durationInSeconds?: number;
  overallSleepScore?: { value?: number };
};
type GarminHrvSummary = {
  lastNightAvg?: number;
};

function todayEpochRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    start: String(Math.floor(start.getTime() / 1000)),
    end: String(Math.floor(now.getTime() / 1000)),
  };
}

export async function getGarminSnapshot(): Promise<GarminSnapshot> {
  const { start, end } = todayEpochRange();
  const date = new Date().toISOString().slice(0, 10);

  const [daily, sleep, hrv] = await Promise.all([
    garminGet<GarminDailySummary[]>('/dailies', {
      uploadStartTimeInSeconds: start,
      uploadEndTimeInSeconds: end,
    }).catch(() => null),
    garminGet<GarminSleepSummary[]>('/sleeps', {
      uploadStartTimeInSeconds: start,
      uploadEndTimeInSeconds: end,
    }).catch(() => null),
    garminGet<GarminHrvSummary[]>('/hrv', {
      uploadStartTimeInSeconds: start,
      uploadEndTimeInSeconds: end,
    }).catch(() => null),
  ]);

  const d = daily?.[0];
  const s = sleep?.[0];
  const h = hrv?.[0];

  const intenseSeconds =
    (d?.moderateIntensityDurationInSeconds ?? 0) + (d?.vigorousIntensityDurationInSeconds ?? 0);

  return {
    date,
    steps: d?.steps ?? null,
    activeKcal: d?.activeKilocalories ?? null,
    intenseMinutes: intenseSeconds > 0 ? Math.round(intenseSeconds / 60) : null,
    restingHR: d?.restingHeartRateInBeatsPerMinute ?? null,
    hrvLastNightMs: h?.lastNightAvg ?? null,
    bodyBattery: d?.bodyBatteryHighestValue ?? null,
    stressAvg: d?.averageStressLevel ?? null,
    sleepHours: s?.durationInSeconds != null ? s.durationInSeconds / 3600 : null,
    sleepScore: s?.overallSleepScore?.value ?? null,
  };
}
