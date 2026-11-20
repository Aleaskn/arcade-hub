import { PROTOCOL_VERSION, serverEventSchema, type AppSession, type ClientCommand, type GameKind, type ServerEvent } from "../packages/shared/src/index";

const baseUrl = process.env.ARCADE_BASE_URL ?? "http://localhost:8787";
const roomsToCreate = Number.parseInt(process.env.LOAD_ROOMS ?? "15", 10);
const latencies: number[] = [];
let receivedMessages = 0;
let sentMessages = 0;
let errors = 0;

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const started = performance.now();
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  latencies.push(performance.now() - started);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) { errors += 1; throw new Error(body.error ?? `HTTP ${response.status}`); }
  return body;
}

async function login(name: string): Promise<AppSession> {
  return api<AppSession>("/api/auth/demo", { method: "POST", body: JSON.stringify({ displayName: name, deviceId: crypto.randomUUID() }) });
}

class LoadClient {
  private readonly queue: ServerEvent[] = [];
  private wakes: Array<() => void> = [];
  constructor(readonly socket: WebSocket, readonly roomId: string) {
    socket.addEventListener("message", (event) => {
      receivedMessages += 1;
      const parsed = serverEventSchema.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) this.queue.push(parsed.data); else errors += 1;
      for (const wake of this.wakes.splice(0)) wake();
    });
  }
  async opened(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout socket")), 5000);
      this.socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Errore socket")); }, { once: true });
    });
    await this.wait((event) => event.type === "room.snapshot");
  }
  send(type: ClientCommand["type"], payload: Record<string, unknown> = {}): number {
    sentMessages += 1;
    const started = performance.now();
    this.socket.send(JSON.stringify({ version: PROTOCOL_VERSION, roomId: this.roomId, commandId: crypto.randomUUID(), type, payload }));
    return started;
  }
  async wait(predicate: (event: ServerEvent) => boolean): Promise<ServerEvent> {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const index = this.queue.findIndex(predicate);
      if (index >= 0) return this.queue.splice(index, 1)[0]!;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 250);
        const wake = () => { clearTimeout(timeout); resolve(); };
        this.wakes.push(wake);
      });
    }
    errors += 1;
    throw new Error("Timeout evento");
  }
  async command(type: ClientCommand["type"], payload: Record<string, unknown>, predicate: (event: ServerEvent) => boolean): Promise<ServerEvent> {
    const started = this.send(type, payload);
    const event = await this.wait(predicate);
    latencies.push(performance.now() - started);
    return event;
  }
}

async function connect(session: AppSession, roomId: string): Promise<LoadClient> {
  const { ticket } = await api<{ ticket: string }>(`/api/rooms/${roomId}/ticket`, { method: "POST" }, session.token);
  const url = new URL(`${baseUrl}/api/rooms/${roomId}/socket`);
  url.protocol = "ws:";
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("role", "player");
  const client = new LoadClient(new WebSocket(url), roomId);
  await client.opened();
  return client;
}

async function exerciseRoom(index: number): Promise<void> {
  const game: GameKind = (["tris", "connect3", "connect4"] as const)[index % 3]!;
  const [hostSession, guestSession] = await Promise.all([login(`Load H${index}`), login(`Load G${index}`)]);
  const { roomId } = await api<{ roomId: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ game }) }, hostSession.token);
  const host = await connect(hostSession, roomId);
  let guest = await connect(guestSession, roomId);
  host.send("room.ready", { ready: true });
  guest.send("room.ready", { ready: true });
  await host.wait((event) => event.type === "room.updated" && event.payload.participants.filter((p) => p.role === "player").every((p) => p.ready));
  await host.command("room.start", {}, (event) => event.type === "match.started");

  if (index % 5 === 0) {
    guest.socket.close(1000, "simulazione disconnessione");
    await new Promise((resolve) => setTimeout(resolve, 35));
    guest = await connect(guestSession, roomId);
  }

  const moves = game === "tris" ? [0, 3, 1, 4, 2] : game === "connect3" ? [0, 1, 0, 1, 0] : [0, 1, 0, 1, 0, 1, 0];
  for (let moveIndex = 0; moveIndex < moves.length; moveIndex += 1) {
    const client = moveIndex % 2 === 0 ? host : guest;
    const final = moveIndex === moves.length - 1;
    await client.command("game.move", game === "tris" ? { position: moves[moveIndex] } : { column: moves[moveIndex] }, (event) => event.type === (final ? "match.finished" : "match.updated"));
  }
  host.socket.close(1000, "fine carico");
  guest.socket.close(1000, "fine carico");
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: roomsToCreate }, (_, index) => exerciseRoom(index)));
const elapsedMs = performance.now() - startedAt;
const estimate = {
  websocketMessagesPer4Hours: 30 * 4 * 60 * 4,
  matchesPer4HoursAt10Minutes: 15 * 24,
  d1BaseRowsWrittenPer4Hours: 15 * 24 * 7
};
console.log(JSON.stringify({
  ok: errors === 0,
  participants: roomsToCreate * 2,
  rooms: roomsToCreate,
  disconnectReconnectCycles: Math.ceil(roomsToCreate / 5),
  elapsedMs: Math.round(elapsedMs),
  operationsMeasured: latencies.length,
  p50Ms: Math.round(percentile(latencies, 0.5) * 10) / 10,
  p95Ms: Math.round(percentile(latencies, 0.95) * 10) / 10,
  sentMessages,
  receivedMessages,
  errors,
  estimate
}));
