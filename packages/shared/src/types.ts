import { z } from "zod";

export const gameKindSchema = z.enum(["tris", "connect3", "connect4"]);
export type GameKind = z.infer<typeof gameKindSchema>;

export const userSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().min(1).max(32),
  avatarUrl: z.string().url().optional(),
  demo: z.boolean()
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  token: z.string().min(16),
  user: userSchema,
  guildId: z.string().min(1).max(128),
  instanceId: z.string().min(1).max(128),
  expiresAt: z.number().int().positive()
});
export type AppSession = z.infer<typeof sessionSchema>;

export const roomSummarySchema = z.object({
  roomId: z.string().length(6),
  game: gameKindSchema,
  hostName: z.string(),
  players: z.number().int().min(0).max(2),
  spectators: z.number().int().min(0),
  status: z.enum(["lobby", "playing", "finished"]),
  updatedAt: z.number().int()
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  rating: number;
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface MatchHistoryEntry {
  matchId: string;
  game: GameKind;
  winnerId: string | null;
  finishedAt: number;
  players: Array<{ userId: string; displayName: string; outcome: "win" | "loss" | "draw" }>;
}
