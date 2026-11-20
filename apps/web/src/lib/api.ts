import { sessionSchema, type AppSession, type GameKind, type LeaderboardEntry, type MatchHistoryEntry, type RoomSummary } from "@arcade-hub/shared";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error || `Errore HTTP ${response.status}`, response.status);
  return data;
}

export const api = {
  demoLogin: async (displayName: string, deviceId: string): Promise<AppSession> => sessionSchema.parse(await request("/auth/demo", { method: "POST", body: JSON.stringify({ displayName, deviceId }) })),
  discordExchange: async (code: string, guildId: string | null, instanceId: string): Promise<AppSession> => sessionSchema.parse(await request("/auth/discord/exchange", { method: "POST", body: JSON.stringify({ code, guildId, instanceId }) })),
  rooms: async (token: string): Promise<RoomSummary[]> => (await request<{ rooms: RoomSummary[] }>("/rooms", {}, token)).rooms,
  createRoom: async (token: string, game: GameKind): Promise<string> => (await request<{ roomId: string }>("/rooms", { method: "POST", body: JSON.stringify({ game }) }, token)).roomId,
  socketTicket: async (token: string, roomId: string): Promise<string> => (await request<{ ticket: string }>(`/rooms/${roomId}/ticket`, { method: "POST" }, token)).ticket,
  leaderboard: async (token: string, game: GameKind): Promise<LeaderboardEntry[]> => (await request<{ entries: LeaderboardEntry[] }>(`/leaderboard/${game}`, {}, token)).entries,
  history: async (token: string, page = 0): Promise<MatchHistoryEntry[]> => (await request<{ matches: MatchHistoryEntry[] }>(`/history?page=${page}`, {}, token)).matches
};

export function socketUrl(roomId: string, ticket: string, role: "player" | "spectator"): string {
  const base = new URL(`${API_BASE}/rooms/${roomId}/socket`, window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.searchParams.set("ticket", ticket);
  base.searchParams.set("role", role);
  return base.toString();
}
