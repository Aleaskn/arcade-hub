import type { Env, SessionClaims } from "../env";

const encoder = new TextEncoder();

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64url(input: string): string {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return atob(normalized);
}

function getSecret(env: Env): string {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  if (env.DEMO_MODE === "true") return "arcade-hub-local-demo-secret-not-for-production";
  throw new Error("SESSION_SECRET non configurato");
}

async function keyFor(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(getSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(env: Env, claims: Omit<SessionClaims, "exp">): Promise<{ token: string; expiresAt: number }> {
  const ttl = Number.parseInt(env.SESSION_TTL_SECONDS || "14400", 10);
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const payload = base64url(JSON.stringify({ ...claims, exp: expiresAt } satisfies SessionClaims));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(env), encoder.encode(payload));
  return { token: `${payload}.${base64url(new Uint8Array(signature))}`, expiresAt: expiresAt * 1000 };
}

export async function verifySessionToken(env: Env, token: string): Promise<SessionClaims> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Sessione non valida");
  const signatureBytes = Uint8Array.from(decodeBase64url(signature), (char) => char.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", await keyFor(env), signatureBytes, encoder.encode(payload));
  if (!valid) throw new Error("Firma sessione non valida");
  const claims = JSON.parse(decodeBase64url(payload)) as SessionClaims;
  if (!claims.sub || !claims.name || !claims.guildId || !claims.instanceId || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Sessione scaduta o incompleta");
  if (claims.demo && env.DEMO_MODE !== "true") throw new Error("Sessioni demo disabilitate");
  return claims;
}

export async function createSocketTicket(env: Env, claims: SessionClaims, roomId: string): Promise<string> {
  const payload = base64url(JSON.stringify({ claims, roomId, exp: Math.floor(Date.now() / 1000) + 45, nonce: crypto.randomUUID() }));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(env), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function verifySocketTicket(env: Env, token: string, roomId: string): Promise<SessionClaims> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Ticket socket non valido");
  const bytes = Uint8Array.from(decodeBase64url(signature), (char) => char.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", await keyFor(env), bytes, encoder.encode(payload)))) throw new Error("Firma ticket non valida");
  const ticket = JSON.parse(decodeBase64url(payload)) as { claims: SessionClaims; roomId: string; exp: number };
  if (ticket.roomId !== roomId || ticket.exp <= Math.floor(Date.now() / 1000)) throw new Error("Ticket socket scaduto");
  if (ticket.claims.demo && env.DEMO_MODE !== "true") throw new Error("Sessioni demo disabilitate");
  return ticket.claims;
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Autenticazione richiesta");
  return header.slice(7);
}
