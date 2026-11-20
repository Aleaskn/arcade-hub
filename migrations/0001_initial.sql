PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('tris', 'connect3', 'connect4')),
  winner_id TEXT,
  finished_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS rankings (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  drawn INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game, user_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  game TEXT NOT NULL,
  host_name TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 1,
  spectators INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'lobby',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_scope_updated ON rooms(scope_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_guild_game_rating ON rankings(guild_id, game, rating DESC);
CREATE INDEX IF NOT EXISTS idx_matches_guild_finished ON matches(guild_id, finished_at DESC);
