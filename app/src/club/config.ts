// Server secrets for the club API. Never prefixed with EXPO_PUBLIC_ (those reach the browser).
type Env = Record<string, string | undefined>;

export interface ClubConfig {
  jwtSecret: string;
  botKey: string;
  bridgeKey?: string;
  qrSecret: string;
  photoKey: string;
}

// ponytail: outside a deployment (no VERCEL, NODE_ENV not production) each secret falls back to a
// fixed, obviously local value so tests and local runs need no setup. A Vercel deployment without
// the variable answers 503 config_faltante on the endpoints that need it; a self-hosted production
// server (NODE_ENV=production without VERCEL, e.g. the Docker image) refuses to start instead.

const NAMES = [
  'CERBERUS_JWT_SECRET',
  'CERBERUS_BOT_KEY',
  'CERBERUS_QR_SECRET',
  'CERBERUS_PHOTO_KEY',
] as const;

export function clubConfig(env: Env): Partial<ClubConfig> {
  const production = env.NODE_ENV === 'production';
  const deployed = Boolean(env.VERCEL) || production;
  if (production && !env.VERCEL) {
    const missing = NAMES.filter((n) => !env[n]);
    if (missing.length) throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}.`);
  }
  const pick = (name: string) => env[name] || (deployed ? undefined : `local-${name}`);
  return {
    jwtSecret: pick('CERBERUS_JWT_SECRET'),
    botKey: pick('CERBERUS_BOT_KEY'),
    ...(env.CERBERUS_BRIDGE_KEY ? { bridgeKey: env.CERBERUS_BRIDGE_KEY } : {}),
    qrSecret: pick('CERBERUS_QR_SECRET'),
    photoKey: pick('CERBERUS_PHOTO_KEY'),
  };
}
