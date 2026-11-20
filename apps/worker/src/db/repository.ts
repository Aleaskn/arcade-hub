import type { GameKind, LeaderboardEntry, MatchHistoryEntry, User } from "@arcade-hub/shared";

export interface FinalizedMatch {
  matchId: string;
  guildId: string;
  game: GameKind;
  winnerId: string | null;
  finishedAt: number;
  players: Array<{ user: User; outcome: "win" | "loss" | "draw" }>;
}

export async function persistFinalizedMatch(db: D1Database, match: FinalizedMatch): Promise<boolean> {
  for (const { user } of match.players) {
    await db.prepare("INSERT INTO users (id, display_name, demo, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at")
      .bind(user.id, user.displayName, user.demo ? 1 : 0, match.finishedAt).run();
  }
  const inserted = await db.prepare("INSERT OR IGNORE INTO matches (id, guild_id, game, winner_id, finished_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(match.matchId, match.guildId, match.game, match.winnerId, match.finishedAt).run();
  if ((inserted.meta.changes ?? 0) === 0) return false;

  for (const player of match.players) {
    await db.prepare("INSERT INTO match_players (match_id, user_id, outcome) VALUES (?1, ?2, ?3)")
      .bind(match.matchId, player.user.id, player.outcome).run();
    const win = player.outcome === "win" ? 1 : 0;
    const loss = player.outcome === "loss" ? 1 : 0;
    const draw = player.outcome === "draw" ? 1 : 0;
    const delta = win ? 25 : loss ? -15 : 0;
    const initialRating = Math.max(0, 1000 + delta);
    await db.prepare(`INSERT INTO rankings (guild_id, game, user_id, rating, played, won, lost, drawn, updated_at)
      VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8)
      ON CONFLICT(guild_id, game, user_id) DO UPDATE SET
        rating = MAX(0, rankings.rating + ?9), played = rankings.played + 1,
        won = rankings.won + ?5, lost = rankings.lost + ?6, drawn = rankings.drawn + ?7, updated_at = ?8`)
      .bind(match.guildId, match.game, player.user.id, initialRating, win, loss, draw, match.finishedAt, delta).run();
  }
  return true;
}

export async function getLeaderboard(db: D1Database, guildId: string, game: GameKind): Promise<LeaderboardEntry[]> {
  const result = await db.prepare(`SELECT r.user_id AS userId, u.display_name AS displayName, r.rating, r.played, r.won, r.lost, r.drawn
    FROM rankings r JOIN users u ON u.id = r.user_id WHERE r.guild_id = ?1 AND r.game = ?2
    ORDER BY r.rating DESC, r.won DESC, r.played ASC LIMIT 50`).bind(guildId, game).all<LeaderboardEntry>();
  return result.results;
}

interface HistoryRow { matchId: string; game: GameKind; winnerId: string | null; finishedAt: number; userId: string; displayName: string; outcome: "win" | "loss" | "draw" }
export async function getHistory(db: D1Database, guildId: string, page: number): Promise<MatchHistoryEntry[]> {
  const result = await db.prepare(`SELECT m.id AS matchId, m.game, m.winner_id AS winnerId, m.finished_at AS finishedAt,
    mp.user_id AS userId, u.display_name AS displayName, mp.outcome
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN users u ON u.id = mp.user_id
    WHERE m.guild_id = ?1 ORDER BY m.finished_at DESC LIMIT 40 OFFSET ?2`).bind(guildId, page * 40).all<HistoryRow>();
  const matches = new Map<string, MatchHistoryEntry>();
  for (const row of result.results) {
    const entry = matches.get(row.matchId) ?? { matchId: row.matchId, game: row.game, winnerId: row.winnerId, finishedAt: row.finishedAt, players: [] };
    entry.players.push({ userId: row.userId, displayName: row.displayName, outcome: row.outcome });
    matches.set(row.matchId, entry);
  }
  return [...matches.values()];
}
