import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { gameKindSchema, type GameKind, type RoomSummary } from "@arcade-hub/shared";
import { bearerToken, createSessionToken, createSocketTicket, verifySessionToken, verifySocketTicket } from "./auth/session";
import { exchangeDiscordCode } from "./auth/discord";
import { getHistory, getLeaderboard } from "./db/repository";
import { scopeKey, type Env, type SessionClaims } from "./env";
import { GameRoom } from "./durable-objects/GameRoom";

type Variables = { claims: SessionClaims };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

app.use("/api/*", async (context, next) => {
  const origin = context.req.header("origin");
  const allowed = context.env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  if (origin && allowed.includes(origin)) {
    context.header("access-control-allow-origin", origin);
    context.header("vary", "Origin");
    context.header("access-control-allow-headers", "authorization, content-type");
    context.header("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "no-referrer");
  if (context.req.method === "OPTIONS") return context.body(null, 204);
  await next();
});

app.use("/api/*", async (context, next) => {
  if (context.req.path === "/api/health") return next();
  const now = Date.now();
  const group = context.req.path.endsWith("/ticket") ? "ticket" : context.req.path.startsWith("/api/auth/") ? "auth" : "general";
  const key = `${context.req.header("cf-connecting-ip") ?? "local"}:${group}`;
  const bucket = rateBuckets.get(key);
  const current = !bucket || now - bucket.startedAt >= 60_000 ? { startedAt: now, count: 1 } : { ...bucket, count: bucket.count + 1 };
  rateBuckets.set(key, current);
  const limit = group === "ticket" ? 60 : group === "auth" ? 60 : 600;
  if (current.count > limit) return context.json({ error: "Troppe richieste: riprova tra poco" }, 429);
  if (rateBuckets.size > 5_000) for (const [bucketKey, value] of rateBuckets) if (now - value.startedAt >= 60_000) rateBuckets.delete(bucketKey);
  return next();
});

app.get("/api/health", (context) => context.json({ ok: true, demo: context.env.DEMO_MODE === "true", newLobbiesEnabled: context.env.NEW_LOBBIES_ENABLED === "true", protocolVersion: 1 }));

const demoLoginSchema = z.object({
  displayName: z.string().trim().min(1).max(32),
  deviceId: z.string().uuid(),
  guildId: z.string().min(1).max(64).default("demo-guild"),
  instanceId: z.string().min(1).max(64).default("demo-instance")
});

app.post("/api/auth/demo", async (context) => {
  if (context.env.DEMO_MODE !== "true") return context.json({ error: "Modalità demo disabilitata" }, 404);
  const parsed = demoLoginSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Dati identità demo non validi" }, 400);
  const claims = {
    sub: `demo:${parsed.data.deviceId}`,
    name: parsed.data.displayName,
    demo: true,
    guildId: `demo:${parsed.data.guildId}`,
    instanceId: `demo:${parsed.data.instanceId}`
  } as const;
  const session = await createSessionToken(context.env, claims);
  return context.json({ ...session, user: { id: claims.sub, displayName: claims.name, demo: true }, guildId: claims.guildId, instanceId: claims.instanceId });
});

const discordLoginSchema = z.object({ code: z.string().min(1).max(512), guildId: z.string().max(128).nullable(), instanceId: z.string().min(1).max(128) });
app.post("/api/auth/discord/exchange", async (context) => {
  const parsed = discordLoginSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Payload OAuth non valido" }, 400);
  try {
    const claims = await exchangeDiscordCode(context.env, parsed.data.code, parsed.data.guildId, parsed.data.instanceId);
    const session = await createSessionToken(context.env, claims);
    return context.json({ ...session, user: { id: claims.sub, displayName: claims.name, demo: false }, guildId: claims.guildId, instanceId: claims.instanceId });
  } catch (error) {
    console.warn("Scambio OAuth non riuscito");
    return context.json({ error: error instanceof Error ? error.message : "OAuth non riuscito" }, 401);
  }
});

app.use("/api/rooms/*", async (context, next) => {
  if (context.req.path.endsWith("/socket")) return next();
  try {
    context.set("claims", await verifySessionToken(context.env, bearerToken(context.req.raw)));
    await next();
  } catch {
    return context.json({ error: "Sessione non valida o scaduta" }, 401);
  }
});
app.use("/api/rooms", async (context, next) => {
  try {
    context.set("claims", await verifySessionToken(context.env, bearerToken(context.req.raw)));
    await next();
  } catch {
    return context.json({ error: "Sessione non valida o scaduta" }, 401);
  }
});
app.use("/api/leaderboard/*", authenticate);
app.use("/api/history", authenticate);
app.use("/api/me", authenticate);

async function authenticate(context: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> {
  try {
    context.set("claims", await verifySessionToken(context.env, bearerToken(context.req.raw)));
    await next();
  } catch {
    return context.json({ error: "Sessione non valida o scaduta" }, 401);
  }
}

app.get("/api/me", (context) => {
  const claims = context.get("claims");
  return context.json({ user: { id: claims.sub, displayName: claims.name, demo: claims.demo }, guildId: claims.guildId, instanceId: claims.instanceId, expiresAt: claims.exp * 1000 });
});

app.get("/api/rooms", async (context) => {
  const claims = context.get("claims");
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result = await context.env.DB.prepare(`SELECT room_id AS roomId, game, host_name AS hostName, players, spectators, status, updated_at AS updatedAt
    FROM rooms WHERE scope_key = ?1 AND updated_at >= ?2 ORDER BY updated_at DESC LIMIT 50`).bind(scopeKey(claims), cutoff).all<RoomSummary>();
  return context.json({ rooms: result.results });
});

app.post("/api/rooms", async (context) => {
  if (context.env.NEW_LOBBIES_ENABLED !== "true") return context.json({ error: "Nuove lobby temporaneamente sospese per tutela delle quote" }, 503);
  const claims = context.get("claims");
  const parsed = z.object({ game: gameKindSchema }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Gioco non valido" }, 400);
  const roomId = await reserveRoomId(context.env.DB, scopeKey(claims), parsed.data.game, claims.name);
  const stub = context.env.GAME_ROOMS.get(context.env.GAME_ROOMS.idFromName(`${scopeKey(claims)}:${roomId}`));
  const response = await stub.fetch("https://room.internal/init", { method: "POST", headers: internalHeaders(claims), body: JSON.stringify({ roomId, game: parsed.data.game }) });
  if (!response.ok) return context.json({ error: "Impossibile inizializzare la stanza" }, 500);
  return context.json({ roomId }, 201);
});

app.post("/api/rooms/:roomId/ticket", async (context) => {
  const claims = context.get("claims");
  const roomId = context.req.param("roomId").toUpperCase();
  const room = await context.env.DB.prepare("SELECT room_id FROM rooms WHERE room_id = ?1 AND scope_key = ?2").bind(roomId, scopeKey(claims)).first();
  if (!room) return context.json({ error: "Stanza non trovata in questa sessione" }, 404);
  return context.json({ ticket: await createSocketTicket(context.env, claims, roomId), expiresIn: 45 });
});

app.get("/api/rooms/:roomId/socket", async (context) => {
  if (context.req.header("upgrade") !== "websocket") return context.text("Upgrade WebSocket richiesto", 426);
  const roomId = context.req.param("roomId").toUpperCase();
  try {
    const ticket = context.req.query("ticket");
    if (!ticket) throw new Error("Ticket assente");
    const claims = await verifySocketTicket(context.env, ticket, roomId);
    const room = await context.env.DB.prepare("SELECT room_id FROM rooms WHERE room_id = ?1 AND scope_key = ?2").bind(roomId, scopeKey(claims)).first();
    if (!room) return context.text("Stanza non autorizzata", 403);
    const role = context.req.query("role") === "spectator" ? "spectator" : "player";
    const stub = context.env.GAME_ROOMS.get(context.env.GAME_ROOMS.idFromName(`${scopeKey(claims)}:${roomId}`));
    const headers = internalHeaders(claims);
    headers.set("upgrade", "websocket");
    headers.set("x-room-role", role);
    return stub.fetch("https://room.internal/socket", { headers });
  } catch {
    return context.text("Ticket socket non valido", 401);
  }
});

app.get("/api/leaderboard/:game", async (context) => {
  const claims = context.get("claims");
  const game = gameKindSchema.safeParse(context.req.param("game"));
  if (!game.success) return context.json({ error: "Gioco non valido" }, 400);
  return context.json({ entries: await getLeaderboard(context.env.DB, claims.guildId, game.data) });
});

app.get("/api/history", async (context) => {
  const claims = context.get("claims");
  const page = Math.max(0, Number.parseInt(context.req.query("page") || "0", 10) || 0);
  return context.json({ matches: await getHistory(context.env.DB, claims.guildId, page), page });
});

app.notFound(async (context) => context.env.ASSETS.fetch(context.req.raw));
app.onError((error, context) => {
  console.error("Errore applicativo", error instanceof Error ? error.message : "sconosciuto");
  return context.json({ error: "Errore interno" }, 500);
});

async function reserveRoomId(db: D1Database, scope: string, game: GameKind, hostName: string): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let roomId = "";
    const random = crypto.getRandomValues(new Uint8Array(6));
    for (const value of random) roomId += alphabet[value % alphabet.length];
    try {
      await db.prepare("INSERT INTO rooms (room_id, scope_key, game, host_name, players, spectators, status, updated_at) VALUES (?1, ?2, ?3, ?4, 1, 0, 'lobby', ?5)")
        .bind(roomId, scope, game, hostName, Date.now()).run();
      return roomId;
    } catch { /* collisione improbabile */ }
  }
  throw new Error("Impossibile generare un codice stanza");
}

function internalHeaders(claims: SessionClaims): Headers {
  return new Headers({
    "content-type": "application/json",
    "x-user-id": claims.sub,
    "x-user-name": claims.name,
    "x-user-demo": String(claims.demo),
    "x-scope-key": scopeKey(claims),
    "x-guild-id": claims.guildId,
    "x-instance-id": claims.instanceId
  });
}

export { GameRoom };
export default app;
