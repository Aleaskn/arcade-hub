import { connect3Definition, connect4Definition, GameRuleError, trisDefinition, type ConnectState, type TrisState } from "@arcade-hub/game-engine";
import { clientCommandSchema, PROTOCOL_VERSION, type ClientCommand, type GameKind, type RoomSnapshot, type ServerEvent, type User } from "@arcade-hub/shared";
import type { Env } from "../env";
import { persistFinalizedMatch } from "../db/repository";

type Participant = RoomSnapshot["participants"][number];
type PublicGame = NonNullable<RoomSnapshot["gameState"]>;

interface PersistentRoom {
  roomId: string;
  game: GameKind;
  guildId: string;
  instanceId: string;
  scopeKey: string;
  hostId: string;
  status: "lobby" | "playing" | "finished";
  revision: number;
  participants: Participant[];
  gameState: PublicGame | null;
  rematchVotes: string[];
  processedCommandIds: string[];
  maxSpectators: number;
  updatedAt: number;
}

interface SocketAttachment {
  userId: string;
  windowStartedAt: number;
  messageCount: number;
}

interface InternalIdentity {
  user: User;
  scopeKey: string;
  guildId: string;
  instanceId: string;
}

function readIdentity(request: Request): InternalIdentity {
  const userId = request.headers.get("x-user-id");
  const displayName = request.headers.get("x-user-name");
  const scope = request.headers.get("x-scope-key");
  const guildId = request.headers.get("x-guild-id");
  const instanceId = request.headers.get("x-instance-id");
  if (!userId || !displayName || !scope || !guildId || !instanceId) throw new Error("Identità interna incompleta");
  return { user: { id: userId, displayName, demo: request.headers.get("x-user-demo") === "true" }, scopeKey: scope, guildId, instanceId };
}

export class GameRoom implements DurableObject {
  private room: PersistentRoom | null = null;
  private readonly ready: Promise<void>;
  private readonly inflightCommandIds = new Set<string>();

  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get<PersistentRoom>("room")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/init")) return this.initialize(request);
    if (request.headers.get("upgrade") === "websocket" && url.pathname.endsWith("/socket")) return this.handleConnect(request);
    if (request.method === "GET" && url.pathname.endsWith("/snapshot")) return Response.json(this.snapshot());
    return new Response("Not found", { status: 404 });
  }

  private async initialize(request: Request): Promise<Response> {
    if (this.room) return Response.json(this.snapshot());
    const identity = readIdentity(request);
    const body = await request.json<{ roomId: string; game: GameKind }>();
    this.room = {
      roomId: body.roomId,
      game: body.game,
      guildId: identity.guildId,
      instanceId: identity.instanceId,
      scopeKey: identity.scopeKey,
      hostId: identity.user.id,
      status: "lobby",
      revision: 1,
      participants: [{ user: identity.user, role: "player", slot: 0, ready: false, connected: false, disconnectedAt: null }],
      gameState: null,
      rematchVotes: [],
      processedCommandIds: [],
      maxSpectators: 20,
      updatedAt: Date.now()
    };
    await this.persist();
    await this.scheduleCleanup();
    return Response.json(this.snapshot(), { status: 201 });
  }

  private async handleConnect(request: Request): Promise<Response> {
    if (!this.room) return new Response("Stanza inesistente", { status: 404 });
    const identity = readIdentity(request);
    if (identity.scopeKey !== this.room.scopeKey) return new Response("Scope non autorizzato", { status: 403 });
    const role = request.headers.get("x-room-role") === "spectator" ? "spectator" : "player";
    let participant = this.room.participants.find((item) => item.user.id === identity.user.id);
    if (!participant) {
      const players = this.room.participants.filter((item) => item.role === "player");
      if (role === "player" && players.length < 2 && this.room.status === "lobby") {
        const used = new Set(players.map((item) => item.slot));
        participant = { user: identity.user, role: "player", slot: used.has(0) ? 1 : 0, ready: false, connected: true, disconnectedAt: null };
      } else {
        const spectators = this.room.participants.filter((item) => item.role === "spectator").length;
        if (spectators >= this.room.maxSpectators) return new Response("Limite spettatori raggiunto", { status: 409 });
        participant = { user: identity.user, role: "spectator", slot: null, ready: false, connected: true, disconnectedAt: null };
      }
      this.room.participants.push(participant);
      await this.changed("room.updated");
    } else {
      participant.connected = true;
      participant.disconnectedAt = null;
      participant.user = identity.user;
      await this.changed("room.updated");
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [`user:${identity.user.id}`]);
    server.serializeAttachment({ userId: identity.user.id, windowStartedAt: Date.now(), messageCount: 0 } satisfies SocketAttachment);
    server.send(JSON.stringify(this.event("room.snapshot")));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready;
    if (!this.room) return;
    if (typeof message !== "string" || message.length > 16_384) {
      this.sendError(socket, "MESSAGE_TOO_LARGE", "Messaggio non valido o troppo grande");
      return;
    }
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    const now = Date.now();
    if (now - attachment.windowStartedAt > 10_000) {
      attachment.windowStartedAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messageCount > 40) {
      this.sendError(socket, "RATE_LIMITED", "Troppi comandi: attendi qualche secondo");
      return;
    }
    let raw: unknown;
    try { raw = JSON.parse(message); } catch { this.sendError(socket, "INVALID_JSON", "JSON non valido"); return; }
    const parsed = clientCommandSchema.safeParse(raw);
    if (!parsed.success || parsed.data.roomId !== this.room.roomId) {
      this.sendError(socket, "INVALID_COMMAND", "Comando non valido");
      return;
    }
    if (this.room.processedCommandIds.includes(parsed.data.commandId) || this.inflightCommandIds.has(parsed.data.commandId)) {
      socket.send(JSON.stringify(this.event("room.snapshot")));
      return;
    }
    this.inflightCommandIds.add(parsed.data.commandId);
    try {
      await this.handleCommand(socket, attachment.userId, parsed.data);
      this.room.processedCommandIds.push(parsed.data.commandId);
      this.room.processedCommandIds = this.room.processedCommandIds.slice(-256);
      await this.persist();
    } catch (error) {
      const code = error instanceof GameRuleError ? error.code : "COMMAND_REJECTED";
      const messageText = error instanceof Error ? error.message : "Comando rifiutato";
      this.sendError(socket, code, messageText, parsed.data.commandId);
    } finally {
      this.inflightCommandIds.delete(parsed.data.commandId);
    }
  }

  private async handleCommand(socket: WebSocket, userId: string, command: ClientCommand): Promise<void> {
    if (!this.room) return;
    const participant = this.room.participants.find((item) => item.user.id === userId);
    if (!participant) throw new Error("Non fai parte della stanza");
    if (command.type === "state.request") {
      socket.send(JSON.stringify(this.event("room.snapshot")));
      return;
    }
    if (command.type === "room.join") {
      if (!command.payload.asSpectator && participant.role === "spectator" && this.room.status === "lobby") {
        const players = this.room.participants.filter((item) => item.role === "player");
        if (players.length >= 2) throw new Error("I due posti giocatore sono occupati");
        participant.role = "player";
        participant.slot = players.some((item) => item.slot === 0) ? 1 : 0;
      }
      await this.changed("room.updated");
      return;
    }
    if (command.type === "room.leave") {
      if (this.room.status === "playing" && participant.role === "player") {
        await this.finishForfeit(userId);
      } else {
        this.room.participants = this.room.participants.filter((item) => item.user.id !== userId);
        if (this.room.hostId === userId && this.room.participants[0]) this.room.hostId = this.room.participants[0].user.id;
        await this.changed("room.updated");
      }
      return;
    }
    if (participant.role !== "player") throw new Error("Gli spettatori non possono eseguire questa azione");
    if (command.type === "room.ready") {
      if (this.room.status !== "lobby") throw new Error("La partita è già iniziata");
      participant.ready = command.payload.ready;
      await this.changed("room.updated");
      return;
    }
    if (command.type === "room.start") {
      if (this.room.hostId !== userId) throw new Error("Solo l'host può iniziare");
      const players = this.orderedPlayers();
      if (players.length !== 2 || players.some((item) => !item.ready)) throw new Error("Servono due giocatori pronti");
      this.startMatch(players[0]!.user.id, players[1]!.user.id);
      await this.changed("match.started");
      return;
    }
    if (command.type === "game.move") {
      if (this.room.status !== "playing" || !this.room.gameState) throw new Error("Nessuna partita in corso");
      this.applyMove(userId, command);
      const finished = this.room.gameState.status !== "playing";
      if (finished) {
        this.room.status = "finished";
        await this.changed("match.finished");
        await this.persistResult();
      } else {
        await this.changed("match.updated");
      }
      return;
    }
    if (command.type === "game.rematch") {
      if (this.room.status !== "finished") throw new Error("La partita non è terminata");
      this.room.rematchVotes = this.room.rematchVotes.filter((id) => id !== userId);
      if (command.payload.accept) this.room.rematchVotes.push(userId);
      const players = this.orderedPlayers();
      if (players.length === 2 && players.every((item) => this.room?.rematchVotes.includes(item.user.id))) {
        this.room.rematchVotes = [];
        this.startMatch(players[1]!.user.id, players[0]!.user.id);
        await this.changed("match.started");
      } else {
        await this.changed("room.updated");
      }
    }
  }

  private orderedPlayers(): Participant[] {
    return this.room?.participants.filter((item) => item.role === "player").sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9)) ?? [];
  }

  private startMatch(first: string, second: string): void {
    if (!this.room) return;
    const matchId = crypto.randomUUID();
    if (this.room.game === "tris") {
      const state = trisDefinition.createInitialState([first, second]);
      this.room.gameState = this.publicFromTris(state, matchId);
    } else {
      const definition = this.room.game === "connect3" ? connect3Definition : connect4Definition;
      const state = definition.createInitialState([first, second]);
      this.room.gameState = this.publicFromConnect(state, matchId);
    }
    this.room.status = "playing";
    this.room.rematchVotes = [];
  }

  private applyMove(userId: string, command: Extract<ClientCommand, { type: "game.move" }>): void {
    if (!this.room?.gameState) return;
    const game = this.room.gameState;
    const players = this.orderedPlayers().map((item) => item.user.id) as [string, string];
    if (this.room.game === "tris") {
      const state: TrisState = { players, board: game.board, currentPlayerId: game.currentPlayerId ?? players[0], result: game.status === "won" ? { status: "won", winnerId: game.winnerId ?? "" } : game.status === "draw" ? { status: "draw" } : { status: "playing" }, lastMove: game.lastMove };
      const next = trisDefinition.applyMove(state, { position: command.payload.position ?? -1 }, userId);
      this.room.gameState = this.publicFromTris(next, game.matchId);
    } else {
      const definition = this.room.game === "connect3" ? connect3Definition : connect4Definition;
      const state: ConnectState = { id: this.room.game, width: game.width, height: game.height, connectN: this.room.game === "connect3" ? 3 : 4, players, board: game.board, currentPlayerId: game.currentPlayerId ?? players[0], result: game.status === "won" ? { status: "won", winnerId: game.winnerId ?? "" } : game.status === "draw" ? { status: "draw" } : { status: "playing" }, lastMove: game.lastMove };
      const next = definition.applyMove(state, { column: command.payload.column ?? -1 }, userId);
      this.room.gameState = this.publicFromConnect(next, game.matchId);
    }
  }

  private publicFromTris(state: TrisState, matchId: string): PublicGame {
    return { kind: "tris", board: [...state.board], width: 3, height: 3, currentPlayerId: state.result.status === "playing" ? state.currentPlayerId : null, status: state.result.status, winnerId: state.result.status === "won" ? state.result.winnerId : null, lastMove: state.lastMove, matchId };
  }

  private publicFromConnect(state: ConnectState, matchId: string): PublicGame {
    return { kind: state.id, board: [...state.board], width: state.width, height: state.height, currentPlayerId: state.result.status === "playing" ? state.currentPlayerId : null, status: state.result.status, winnerId: state.result.status === "won" ? state.result.winnerId : null, lastMove: state.lastMove, matchId };
  }

  private async finishForfeit(loserId: string): Promise<void> {
    if (!this.room?.gameState) return;
    const winner = this.orderedPlayers().find((item) => item.user.id !== loserId);
    if (!winner) return;
    this.room.gameState = { ...this.room.gameState, status: "forfeit", winnerId: winner.user.id, currentPlayerId: null };
    this.room.status = "finished";
    await this.changed("match.finished");
    await this.persistResult();
  }

  private async persistResult(): Promise<void> {
    if (!this.room?.gameState || this.room.gameState.status === "playing") return;
    const winnerId = this.room.gameState.winnerId;
    const players = this.orderedPlayers();
    await persistFinalizedMatch(this.env.DB, {
      matchId: this.room.gameState.matchId,
      guildId: this.room.guildId,
      game: this.room.game,
      winnerId,
      finishedAt: Date.now(),
      players: players.map((participant) => ({ user: participant.user, outcome: winnerId === null ? "draw" : participant.user.id === winnerId ? "win" : "loss" }))
    });
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    await this.ready;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment && this.room) {
      const otherOpenSocket = this.ctx.getWebSockets(`user:${attachment.userId}`).some((candidate) => candidate !== socket && candidate.readyState === WebSocket.OPEN);
      const participant = this.room.participants.find((item) => item.user.id === attachment.userId);
      if (participant && !otherOpenSocket) {
        participant.connected = false;
        participant.disconnectedAt = Date.now();
        await this.changed("room.updated");
        if (this.room.status === "playing" && participant.role === "player") {
          const grace = Number.parseInt(this.env.DISCONNECT_GRACE_SECONDS || "90", 10) * 1000;
          await this.ctx.storage.setAlarm(Date.now() + grace);
        }
      }
    }
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) socket.close(code, reason); else socket.close();
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, "Errore socket");
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.room) return;
    const roomTtl = 24 * 60 * 60 * 1000;
    if (Date.now() - this.room.updatedAt >= roomTtl && !this.room.participants.some((participant) => participant.connected)) {
      await this.env.DB.prepare("DELETE FROM rooms WHERE room_id = ?1 AND scope_key = ?2").bind(this.room.roomId, this.room.scopeKey).run();
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    if (this.room.status !== "playing") { await this.scheduleCleanup(); return; }
    const grace = Number.parseInt(this.env.DISCONNECT_GRACE_SECONDS || "90", 10) * 1000;
    const expired = this.orderedPlayers().find((item) => item.disconnectedAt !== null && Date.now() - item.disconnectedAt >= grace);
    if (expired) await this.finishForfeit(expired.user.id); else await this.scheduleCleanup();
  }

  private snapshot(): RoomSnapshot {
    if (!this.room) throw new Error("Stanza non inizializzata");
    return { roomId: this.room.roomId, game: this.room.game, hostId: this.room.hostId, status: this.room.status, revision: this.room.revision, participants: this.room.participants, gameState: this.room.gameState, rematchVotes: this.room.rematchVotes, maxSpectators: this.room.maxSpectators };
  }

  private event(type: Exclude<ServerEvent["type"], "error">): ServerEvent {
    if (!this.room) throw new Error("Stanza non inizializzata");
    return { version: PROTOCOL_VERSION, type, roomId: this.room.roomId, revision: this.room.revision, payload: this.snapshot() };
  }

  private async changed(type: Exclude<ServerEvent["type"], "error">): Promise<void> {
    if (!this.room) return;
    this.room.revision += 1;
    this.room.updatedAt = Date.now();
    await this.persist();
    await this.updateRegistry();
    await this.scheduleCleanup();
    const payload = JSON.stringify(this.event(type));
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch { /* connessione in chiusura */ }
    }
  }

  private sendError(socket: WebSocket, code: string, message: string, commandId?: string): void {
    if (!this.room) return;
    const payload: ServerEvent = { version: PROTOCOL_VERSION, type: "error", roomId: this.room.roomId, revision: this.room.revision, payload: { code, message, ...(commandId ? { commandId } : {}) } };
    socket.send(JSON.stringify(payload));
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put("room", this.room);
  }

  private async updateRegistry(): Promise<void> {
    if (!this.room) return;
    await this.env.DB.prepare("UPDATE rooms SET players = ?1, spectators = ?2, status = ?3, updated_at = ?4 WHERE room_id = ?5 AND scope_key = ?6")
      .bind(this.room.participants.filter((item) => item.role === "player").length, this.room.participants.filter((item) => item.role === "spectator").length, this.room.status, this.room.updatedAt, this.room.roomId, this.room.scopeKey).run();
  }

  private async scheduleCleanup(): Promise<void> {
    if (!this.room) return;
    const cleanupAt = this.room.updatedAt + 24 * 60 * 60 * 1000;
    const disconnectDeadlines = this.orderedPlayers()
      .filter((participant) => participant.disconnectedAt !== null && this.room?.status === "playing")
      .map((participant) => participant.disconnectedAt! + Number.parseInt(this.env.DISCONNECT_GRACE_SECONDS || "90", 10) * 1000);
    await this.ctx.storage.setAlarm(Math.min(cleanupAt, ...disconnectDeadlines));
  }
}
