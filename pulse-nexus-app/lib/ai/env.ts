import Constants from 'expo-constants';

export function readEnv(name: string): string | null {
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name];
  const fromEnv = process.env[name];
  const v = fromExtra ?? fromEnv;
  return v && v.length > 0 ? v : null;
}

export function missingKeyError(envVar: string, helpUrl: string): Error {
  return new Error(
    `Missing ${envVar}. Add a value to your .env (get a key at ${helpUrl}) and rebuild the app.`,
  );
}
