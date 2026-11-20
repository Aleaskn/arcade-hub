import { PROTOCOL_VERSION, serverEventSchema, type AppSession, type ClientCommand, type GameKind, type RoomSnapshot, type ServerEvent } from "../packages/shared/src/index";

const baseUrl = process.env.ARCADE_BASE_URL ?? "http://localhost:8787";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`VERIFICA FALLITA: ${message}`);
}

async function json<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(`${path}: ${body.error ?? response.status}`);
  return body;
}

async function login(name: string): Promise<AppSession> {
  return json<AppSession>("/api/auth/demo", { method: "POST", body: JSON.stringify({ displayName: name, deviceId: crypto.randomUUID() }) });
}

class RoomClient {
  private readonly events: ServerEvent[] = [];
  private readonly waiters: Array<() => void> = [];
  readonly socket: WebSocket;
  constructor(url: string, readonly roomId: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (message) => {
      const result = serverEventSchema.safeParse(JSON.parse(String(message.data)));
      if (result.success) {
        this.events.push(result.data);
        for (const waiter of this.waiters.splice(0)) waiter();
      }
    });
  }
  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout apertura socket")), 5000);
      this.socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Errore apertura socket")); }, { once: true });
    });
  }
  send(type: ClientCommand["type"], payload: Record<string, unknown> = {}, commandId: string = crypto.randomUUID()): string {
    this.socket.send(JSON.stringify({ version: PROTOCOL_VERSION, roomId: this.roomId, commandId, type, payload }));
    return commandId;
  }
  async waitFor(predicate: (event: ServerEvent) => boolean, timeoutMs = 5000): Promise<ServerEvent> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const index = this.events.findIndex(predicate);
      if (index >= 0) return this.events.splice(index, 1)[0]!;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const waiterIndex = this.waiters.indexOf(wake);
          if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
          reject(new Error("Timeout evento socket"));
        }, Math.min(1000, end - Date.now()));
        const wake = () => { clearTimeout(timeout); resolve(); };
        this.waiters.push(wake);
      }).catch(() => undefined);
    }
    throw new Error("Evento socket atteso non ricevuto");
  }
  close(): void { this.socket.close(1000, "test completato"); }
}

async function connect(session: AppSession, roomId: string, role: "player" | "spectator"): Promise<RoomClient> {
  const { ticket } = await json<{ ticket: string }>(`/api/rooms/${roomId}/ticket`, { method: "POST" }, session.token);
  const url = new URL(`${baseUrl}/api/rooms/${roomId}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("role", role);
  const client = new RoomClient(url.toString(), roomId);
  await client.open();
  await client.waitFor((event) => event.type === "room.snapshot");
  return client;
}

function snapshot(event: ServerEvent): RoomSnapshot {
  check(event.type !== "error", "ricevuto errore invece dello snapshot");
  return event.payload;
}

async function run(): Promise<void> {
  const startedAt = performance.now();
  const health = await json<{ ok: boolean; demo: boolean }>("/api/health");
  check(health.ok && health.demo, "health demo");
  const [alice, bob, spectator] = await Promise.all([login("Alice Test"), login("Bob Test"), login("Spettatore Test")]);
  check(alice.user.id !== bob.user.id, "identità demo separate");

  const { roomId } = await json<{ roomId: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ game: "tris" satisfies GameKind }) }, alice.token);
  const aliceSocket = await connect(alice, roomId, "player");
  const bobSocket = await connect(bob, roomId, "player");
  const spectatorSocket = await connect(spectator, roomId, "spectator");

  spectatorSocket.send("game.move", { position: 0 });
  const spectatorError = await spectatorSocket.waitFor((event) => event.type === "error");
  check(spectatorError.type === "error" && spectatorError.payload.message.includes("spettatori"), "spettatore non può muovere");

  aliceSocket.send("room.ready", { ready: true });
  await aliceSocket.waitFor((event) => event.type === "room.updated" && snapshot(event).participants.some((p) => p.user.id === alice.user.id && p.ready));
  bobSocket.send("room.ready", { ready: true });
  await aliceSocket.waitFor((event) => event.type === "room.updated" && snapshot(event).participants.filter((p) => p.role === "player").every((p) => p.ready));
  aliceSocket.send("room.start");
  await aliceSocket.waitFor((event) => event.type === "match.started");

  const moves = [[aliceSocket, 0], [bobSocket, 3], [aliceSocket, 1], [bobSocket, 4]] as const;
  for (const [client, position] of moves) {
    client.send("game.move", { position });
    await aliceSocket.waitFor((event) => event.type === "match.updated" && snapshot(event).gameState?.lastMove === position);
  }
  const finalCommandId = aliceSocket.send("game.move", { position: 2 });
  const finished = await aliceSocket.waitFor((event) => event.type === "match.finished");
  check(snapshot(finished).gameState?.winnerId === alice.user.id, "vittoria Tris determinata dal server");
  aliceSocket.send("game.move", { position: 2 }, finalCommandId);
  await aliceSocket.waitFor((event) => event.type === "room.snapshot");

  const { entries } = await json<{ entries: Array<{ userId: string; rating: number; played: number }> }>("/api/leaderboard/tris", {}, alice.token);
  const aliceRank = entries.find((entry) => entry.userId === alice.user.id);
  check(aliceRank?.rating === 1025 && aliceRank.played === 1, "ranking idempotente (+25, una sola partita)");

  bobSocket.close();
  const reconnectedBob = await connect(bob, roomId, "player");
  reconnectedBob.send("state.request");
  const restored = await reconnectedBob.waitFor((event) => event.type === "room.snapshot");
  check(snapshot(restored).gameState?.status === "won", "snapshot ripristinato alla riconnessione");

  aliceSocket.send("game.rematch", { accept: true });
  reconnectedBob.send("game.rematch", { accept: true });
  const rematch = await aliceSocket.waitFor((event) => event.type === "match.started");
  check(snapshot(rematch).gameState?.status === "playing" && snapshot(rematch).gameState?.matchId !== snapshot(finished).gameState?.matchId, "rivincita con nuovo match ID");

  const second = await json<{ roomId: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ game: "connect4" }) }, alice.token);
  const { rooms } = await json<{ rooms: Array<{ roomId: string }> }>("/api/rooms", {}, alice.token);
  check(rooms.some((room) => room.roomId === roomId) && rooms.some((room) => room.roomId === second.roomId), "stanze multiple isolate");

  const forged = await fetch(`${baseUrl}/api/rooms`, { headers: { authorization: "Bearer forged.token" } });
  check(forged.status === 401, "sessione falsificata rifiutata");

  aliceSocket.close(); reconnectedBob.close(); spectatorSocket.close();
  console.log(JSON.stringify({ ok: true, roomId, checks: 11, elapsedMs: Math.round(performance.now() - startedAt) }));
}

await run();
