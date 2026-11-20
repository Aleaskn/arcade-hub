import { describe, expect, it } from "vitest";
import { connect3Definition, connect4Definition, findConnectResult } from "./connect";

describe("Forza 3/4", () => {
  it.each([
    { cells: [35,36,37,38], label: "orizzontale" },
    { cells: [14,21,28,35], label: "verticale" },
    { cells: [14,22,30,38], label: "diagonale crescente" },
    { cells: [20,26,32,38], label: "diagonale decrescente" }
  ])("riconosce $label", ({ cells }) => {
    const board = Array<string | null>(42).fill(null);
    for (const index of cells) board[index] = "a";
    expect(findConnectResult(board, 7, 6, 4)).toEqual({ status: "won", winnerId: "a" });
  });

  it("applica la gravità e alterna i turni", () => {
    let state = connect4Definition.createInitialState(["a", "b"]);
    state = connect4Definition.applyMove(state, { column: 2 }, "a");
    expect(state.board[37]).toBe("a");
    state = connect4Definition.applyMove(state, { column: 2 }, "b");
    expect(state.board[30]).toBe("b");
    expect(state.board.filter(Boolean)).toHaveLength(2);
  });

  it.each([
    { width: 5, height: 4, connectN: 3, board: ["b","a","b","a","b","b","a","b","a","b","a","b","a","b","a","a","b","a","b","a"] },
    { width: 7, height: 6, connectN: 4, board: ["a","a","b","a","b","a","b","a","b","b","a","a","b","a","b","a","b","b","a","b","a","a","b","a","a","b","a","a","a","b","a","b","b","a","b","b","b","a","a","b","a","a"] }
  ])("riconosce il pareggio $width×$height", ({ board, width, height, connectN }) => {
    expect(findConnectResult(board, width, height, connectN)).toEqual({ status: "draw" });
  });

  it("rifiuta colonna piena, limiti e fuori turno senza mutare", () => {
    let state = connect3Definition.createInitialState(["a", "b"]);
    expect(() => connect3Definition.applyMove(state, { column: -1 }, "a")).toThrowError(/Colonna/);
    expect(() => connect3Definition.applyMove(state, { column: 0 }, "b")).toThrowError(/turno/);
    for (let i = 0; i < 4; i += 1) state = connect3Definition.applyMove(state, { column: 0 }, i % 2 === 0 ? "a" : "b");
    const before = state.board;
    expect(() => connect3Definition.applyMove(state, { column: 0 }, "a")).toThrowError(/piena/);
    expect(state.board).toBe(before);
  });

  it("blocca le mosse dopo la vittoria", () => {
    let state = connect4Definition.createInitialState(["a", "b"]);
    for (const [player, column] of [["a",0],["b",1],["a",0],["b",1],["a",0],["b",1],["a",0]] as const) state = connect4Definition.applyMove(state, { column }, player);
    expect(state.result).toEqual({ status: "won", winnerId: "a" });
    expect(() => connect4Definition.applyMove(state, { column: 2 }, "b")).toThrowError(/terminata/);
  });

  it("non espone stato privato e non supera le celle", () => {
    let state = connect4Definition.createInitialState(["a", "b"]);
    const columns = [0, 1, 2, 3, 4, 5, 6, 0];
    for (let i = 0; i < columns.length; i += 1) state = connect4Definition.applyMove(state, { column: columns[i]! }, i % 2 === 0 ? "a" : "b");
    const view = connect4Definition.getViewForPlayer(state, "observer");
    expect(view.private).toBeNull();
    expect(view.public.board).toHaveLength(42);
    expect(view.public.board.filter(Boolean).length).toBeLessThanOrEqual(42);
  });
});
