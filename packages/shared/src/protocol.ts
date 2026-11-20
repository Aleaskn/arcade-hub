import { z } from "zod";
import { gameKindSchema, userSchema } from "./types";

export const PROTOCOL_VERSION = 1 as const;

const baseCommand = z.object({
  version: z.literal(PROTOCOL_VERSION),
  roomId: z.string().length(6),
  commandId: z.string().uuid()
});

export const clientCommandSchema = z.discriminatedUnion("type", [
  baseCommand.extend({ type: z.literal("room.join"), payload: z.object({ asSpectator: z.boolean().default(false) }) }),
  baseCommand.extend({ type: z.literal("room.leave"), payload: z.object({}) }),
  baseCommand.extend({ type: z.literal("room.ready"), payload: z.object({ ready: z.boolean() }) }),
  baseCommand.extend({ type: z.literal("room.start"), payload: z.object({}) }),
  baseCommand.extend({ type: z.literal("game.move"), payload: z.object({ position: z.number().int().min(0).max(8).optional(), column: z.number().int().min(0).max(6).optional() }).refine((v) => (v.position === undefined) !== (v.column === undefined), "Serve una sola mossa") }),
  baseCommand.extend({ type: z.literal("game.rematch"), payload: z.object({ accept: z.boolean() }) }),
  baseCommand.extend({ type: z.literal("state.request"), payload: z.object({}) })
]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;

export const participantSchema = z.object({
  user: userSchema,
  role: z.enum(["player", "spectator"]),
  slot: z.number().int().min(0).max(1).nullable(),
  ready: z.boolean(),
  connected: z.boolean(),
  disconnectedAt: z.number().int().nullable()
});

export const publicGameStateSchema = z.object({
  kind: gameKindSchema,
  board: z.array(z.string().nullable()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  currentPlayerId: z.string().nullable(),
  status: z.enum(["playing", "won", "draw", "forfeit"]),
  winnerId: z.string().nullable(),
  lastMove: z.number().int().nullable(),
  matchId: z.string()
});

export const roomSnapshotSchema = z.object({
  roomId: z.string().length(6),
  game: gameKindSchema,
  hostId: z.string(),
  status: z.enum(["lobby", "playing", "finished"]),
  revision: z.number().int().nonnegative(),
  participants: z.array(participantSchema),
  gameState: publicGameStateSchema.nullable(),
  rematchVotes: z.array(z.string()),
  maxSpectators: z.number().int().positive()
});
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;

const eventBase = z.object({ version: z.literal(PROTOCOL_VERSION), roomId: z.string().length(6), revision: z.number().int().nonnegative() });
export const serverEventSchema = z.discriminatedUnion("type", [
  eventBase.extend({ type: z.enum(["room.snapshot", "room.updated", "match.started", "match.updated", "match.finished"]), payload: roomSnapshotSchema }),
  eventBase.extend({ type: z.literal("error"), payload: z.object({ code: z.string(), message: z.string(), commandId: z.string().uuid().optional() }) })
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
