/**
 * WHOOP Developer API client.
 *
 * Docs: https://developer.whoop.com/
 *
 * Auth flow: OAuth 2.0 Authorization Code with PKCE.
 *  - Authorize:     https://api.prod.whoop.com/oauth/oauth2/auth
 *  - Token:         https://api.prod.whoop.com/oauth/oauth2/token
 *  - API base:      https://api.prod.whoop.com/developer/v1
 *
 * The redirect URI registered with WHOOP must be the app scheme:
 *   pulsenexus://whoop-callback
 */
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { deleteSecret, getSecret, setSecret } from './storage';

const AUTH_ENDPOINT = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_ENDPOINT = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer/v1';

const SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
  'offline',
];

const NOT_CONFIGURED_MESSAGE =
  'WHOOP is not configured yet. Create a free WHOOP developer app at https://developer.whoop.com, register the redirect URI pulsenexus://whoop-callback, then add EXPO_PUBLIC_WHOOP_CLIENT_ID and EXPO_PUBLIC_WHOOP_CLIENT_SECRET to your .env and rebuild.';

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: AUTH_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
};

function envOptional(name: string): string | null {
  const v =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name] ??
    (process.env[name] as string | undefined);
  return v && v.length > 0 ? v : null;
}

function envRequired(name: string): string {
  const v = envOptional(name);
  if (!v) throw new Error(NOT_CONFIGURED_MESSAGE);
  return v;
}

export function isWhoopConfigured(): boolean {
  return (
    envOptional('EXPO_PUBLIC_WHOOP_CLIENT_ID') !== null &&
    envOptional('EXPO_PUBLIC_WHOOP_CLIENT_SECRET') !== null
  );
}

export async function connectWhoop(): Promise<void> {
  const clientId = envRequired('EXPO_PUBLIC_WHOOP_CLIENT_ID');
  const clientSecret = envRequired('EXPO_PUBLIC_WHOOP_CLIENT_SECRET');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'pulsenexus', path: 'whoop-callback' });

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
    throw new Error('WHOOP sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(`WHOOP sign-in failed (${result.type}). Please try again.`);
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

  await setSecret('whoop.access_token', token.accessToken);
  if (token.refreshToken) await setSecret('whoop.refresh_token', token.refreshToken);
  if (token.expiresIn) {
    const expiresAt = Date.now() + token.expiresIn * 1000;
    await setSecret('whoop.expires_at', String(expiresAt));
  }
}

export async function disconnectWhoop(): Promise<void> {
  await deleteSecret('whoop.access_token');
  await deleteSecret('whoop.refresh_token');
  await deleteSecret('whoop.expires_at');
}

export async function isWhoopConnected(): Promise<boolean> {
  return (await getSecret('whoop.access_token')) !== null;
}

async function getValidAccessToken(): Promise<string> {
  const access = await getSecret('whoop.access_token');
  const expiresAtStr = await getSecret('whoop.expires_at');
  const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
  if (access && expiresAt - 60_000 > Date.now()) return access;

  const refresh = await getSecret('whoop.refresh_token');
  if (!refresh) throw new Error('WHOOP not connected. Open the Connect tab to sign in.');

  const clientId = envRequired('EXPO_PUBLIC_WHOOP_CLIENT_ID');
  const clientSecret = envRequired('EXPO_PUBLIC_WHOOP_CLIENT_SECRET');
  const refreshed = await AuthSession.refreshAsync(
    { clientId, clientSecret, refreshToken: refresh, scopes: SCOPES },
    discovery,
  );
  await setSecret('whoop.access_token', refreshed.accessToken);
  if (refreshed.refreshToken) await setSecret('whoop.refresh_token', refreshed.refreshToken);
  if (refreshed.expiresIn) {
    await setSecret('whoop.expires_at', String(Date.now() + refreshed.expiresIn * 1000));
  }
  return refreshed.accessToken;
}

async function whoopGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const token = await getValidAccessToken();
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`WHOOP ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export type WhoopRecovery = {
  cycle_id: number;
  score: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number };
  updated_at: string;
};
export type WhoopSleep = {
  id: number;
  start: string;
  end: string;
  score: {
    sleep_performance_percentage: number;
    sleep_efficiency_percentage: number;
    sleep_needed_milli: number;
    stage_summary: { total_in_bed_time_milli: number };
  };
};
export type WhoopCycle = {
  id: number;
  start: string;
  end: string | null;
  score: { strain: number; average_heart_rate: number };
};

export async function getLatestWhoopRecovery(): Promise<WhoopRecovery | null> {
  const out = await whoopGet<{ records: WhoopRecovery[] }>('/recovery', { limit: '1' });
  return out.records[0] ?? null;
}
export async function getLatestWhoopSleep(): Promise<WhoopSleep | null> {
  const out = await whoopGet<{ records: WhoopSleep[] }>('/activity/sleep', { limit: '1' });
  return out.records[0] ?? null;
}
export async function getLatestWhoopCycle(): Promise<WhoopCycle | null> {
  const out = await whoopGet<{ records: WhoopCycle[] }>('/cycle', { limit: '1' });
  return out.records[0] ?? null;
}
