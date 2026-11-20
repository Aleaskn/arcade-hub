import { GameRuleError, assertActivePlayer, nextPlayer, type GameDefinition, type GameResult, type PlayerId } from "./core";

export interface TrisState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly board: ReadonlyArray<PlayerId | null>;
  readonly currentPlayerId: PlayerId;
  readonly result: GameResult;
  readonly lastMove: number | null;
}
export interface TrisMove { position: number }
export interface TrisView { board: ReadonlyArray<PlayerId | null>; currentPlayerId: PlayerId | null; result: GameResult; lastMove: number | null }

export const TRIS_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
] as const;

export function getTrisResult(board: ReadonlyArray<PlayerId | null>): GameResult {
  for (const [a, b, c] of TRIS_LINES) {
    const value = board[a];
    if (value && value === board[b] && value === board[c]) return { status: "won", winnerId: value };
  }
  return board.every((cell) => cell !== null) ? { status: "draw" } : { status: "playing" };
}

export const trisDefinition: GameDefinition<TrisState, TrisMove, TrisView> = {
  id: "tris",
  createInitialState(players) {
    return { players, board: Array<PlayerId | null>(9).fill(null), currentPlayerId: players[0], result: { status: "playing" }, lastMove: null };
  },
  validateMove(state, move, playerId) {
    assertActivePlayer(state.players, state.currentPlayerId, playerId, state.result);
    if (!Number.isInteger(move.position) || move.position < 0 || move.position >= 9) throw new GameRuleError("INVALID_POSITION", "Cella non valida");
    if (state.board[move.position] !== null) throw new GameRuleError("CELL_OCCUPIED", "La cella è già occupata");
  },
  applyMove(state, move, playerId) {
    this.validateMove(state, move, playerId);
    const board = [...state.board];
    board[move.position] = playerId;
    const result = getTrisResult(board);
    return { ...state, board, result, lastMove: move.position, currentPlayerId: result.status === "playing" ? nextPlayer(state.players, playerId) : playerId };
  },
  getViewForPlayer(state) {
    return { public: { board: state.board, currentPlayerId: state.result.status === "playing" ? state.currentPlayerId : null, result: state.result, lastMove: state.lastMove }, private: null };
  },
  getResult(state) { return state.result; }
};
