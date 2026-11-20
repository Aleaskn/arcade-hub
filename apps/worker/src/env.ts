export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
  DB: D1Database;
  ASSETS: Fetcher;
  DEMO_MODE: string;
  NEW_LOBBIES_ENABLED: string;
  ALLOWED_ORIGINS: string;
  SESSION_TTL_SECONDS: string;
  DISCONNECT_GRACE_SECONDS: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

export interface SessionClaims {
  sub: string;
  name: string;
  demo: boolean;
  guildId: string;
  instanceId: string;
  exp: number;
}

export function scopeKey(claims: SessionClaims): string {
  return `${claims.guildId}:${claims.instanceId}`;
}
