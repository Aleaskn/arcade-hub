import { GameRuleError, assertActivePlayer, nextPlayer, type GameDefinition, type GameResult, type PlayerId } from "./core";

export interface ConnectConfig { readonly id: "connect3" | "connect4"; readonly width: number; readonly height: number; readonly connectN: number }
export interface ConnectState extends ConnectConfig {
  readonly players: readonly [PlayerId, PlayerId];
  readonly board: ReadonlyArray<PlayerId | null>;
  readonly currentPlayerId: PlayerId;
  readonly result: GameResult;
  readonly lastMove: number | null;
}
export interface ConnectMove { column: number }
export interface ConnectView { board: ReadonlyArray<PlayerId | null>; width: number; height: number; currentPlayerId: PlayerId | null; result: GameResult; lastMove: number | null }

export function findConnectResult(board: ReadonlyArray<PlayerId | null>, width: number, height: number, connectN: number): GameResult {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const player = board[row * width + column];
      if (!player) continue;
      for (const [dx, dy] of directions) {
        let matches = 1;
        for (; matches < connectN; matches += 1) {
          const x = column + dx * matches;
          const y = row + dy * matches;
          if (x < 0 || x >= width || y < 0 || y >= height || board[y * width + x] !== player) break;
        }
        if (matches === connectN) return { status: "won", winnerId: player };
      }
    }
  }
  return board.every((cell) => cell !== null) ? { status: "draw" } : { status: "playing" };
}

export function createConnectDefinition(config: ConnectConfig): GameDefinition<ConnectState, ConnectMove, ConnectView> {
  return {
    id: config.id,
    createInitialState(players) {
      return { ...config, players, board: Array<PlayerId | null>(config.width * config.height).fill(null), currentPlayerId: players[0], result: { status: "playing" }, lastMove: null };
    },
    validateMove(state, move, playerId) {
      assertActivePlayer(state.players, state.currentPlayerId, playerId, state.result);
      if (!Number.isInteger(move.column) || move.column < 0 || move.column >= state.width) throw new GameRuleError("INVALID_POSITION", "Colonna non valida");
      if (state.board[move.column] !== null) throw new GameRuleError("COLUMN_FULL", "La colonna è piena");
    },
    applyMove(state, move, playerId) {
      this.validateMove(state, move, playerId);
      const board = [...state.board];
      let target = move.column;
      for (let row = state.height - 1; row >= 0; row -= 1) {
        const index = row * state.width + move.column;
        if (board[index] === null) { target = index; break; }
      }
      board[target] = playerId;
      const result = findConnectResult(board, state.width, state.height, state.connectN);
      return { ...state, board, result, lastMove: target, currentPlayerId: result.status === "playing" ? nextPlayer(state.players, playerId) : playerId };
    },
    getViewForPlayer(state) {
      return { public: { board: state.board, width: state.width, height: state.height, currentPlayerId: state.result.status === "playing" ? state.currentPlayerId : null, result: state.result, lastMove: state.lastMove }, private: null };
    },
    getResult(state) { return state.result; }
  };
}

export const connect3Definition = createConnectDefinition({ id: "connect3", width: 5, height: 4, connectN: 3 });
export const connect4Definition = createConnectDefinition({ id: "connect4", width: 7, height: 6, connectN: 4 });
