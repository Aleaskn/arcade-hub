import { describe, expect, it } from "vitest";
import { GameRuleError } from "./core";
import { getTrisResult, trisDefinition } from "./tris";

describe("Tris", () => {
  it.each([
    [0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]
  ])("riconosce la vittoria %j", (...line: number[]) => {
    const board = Array<string | null>(9).fill(null);
    for (const index of line) board[index] = "a";
    expect(getTrisResult(board)).toEqual({ status: "won", winnerId: "a" });
  });

  it("riconosce il pareggio", () => {
    expect(getTrisResult(["a","b","a", "a","b","b", "b","a","a"])).toEqual({ status: "draw" });
  });

  it("applica turni e non muta lo stato per mosse invalide", () => {
    const initial = trisDefinition.createInitialState(["a", "b"]);
    const next = trisDefinition.applyMove(initial, { position: 0 }, "a");
    expect(initial.board[0]).toBeNull();
    expect(next.currentPlayerId).toBe("b");
    expect(() => trisDefinition.applyMove(next, { position: 0 }, "b")).toThrowError(GameRuleError);
    expect(() => trisDefinition.applyMove(next, { position: 1 }, "a")).toThrowError(/turno/);
    expect(() => trisDefinition.applyMove(next, { position: 9 }, "b")).toThrowError(/Cella/);
  });

  it("blocca mosse dopo la fine", () => {
    let state = trisDefinition.createInitialState(["a", "b"]);
    for (const [player, position] of [["a",0],["b",3],["a",1],["b",4],["a",2]] as const) state = trisDefinition.applyMove(state, { position }, player);
    expect(state.result).toEqual({ status: "won", winnerId: "a" });
    expect(() => trisDefinition.applyMove(state, { position: 8 }, "b")).toThrowError(/terminata/);
  });
});
