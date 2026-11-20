export type PlayerId = string;

export type GameResult =
  | { status: "playing" }
  | { status: "draw" }
  | { status: "won"; winnerId: PlayerId };

export interface GameDefinition<State, Move, PublicView, PrivateView = never> {
  readonly id: string;
  createInitialState(players: readonly [PlayerId, PlayerId]): State;
  validateMove(state: State, move: Move, playerId: PlayerId): void;
  applyMove(state: State, move: Move, playerId: PlayerId): State;
  getViewForPlayer(state: State, playerId: PlayerId | null): { public: PublicView; private: PrivateView | null };
  getResult(state: State): GameResult;
}

export type GameErrorCode = "NOT_A_PLAYER" | "NOT_YOUR_TURN" | "INVALID_POSITION" | "CELL_OCCUPIED" | "COLUMN_FULL" | "GAME_FINISHED";

export class GameRuleError extends Error {
  readonly code: GameErrorCode;
  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}

export function assertActivePlayer(players: readonly [PlayerId, PlayerId], currentPlayerId: PlayerId, playerId: PlayerId, result: GameResult): void {
  if (!players.includes(playerId)) throw new GameRuleError("NOT_A_PLAYER", "Non sei un giocatore della partita");
  if (result.status !== "playing") throw new GameRuleError("GAME_FINISHED", "La partita è già terminata");
  if (currentPlayerId !== playerId) throw new GameRuleError("NOT_YOUR_TURN", "Non è il tuo turno");
}

export function nextPlayer(players: readonly [PlayerId, PlayerId], current: PlayerId): PlayerId {
  return current === players[0] ? players[1] : players[0];
}
