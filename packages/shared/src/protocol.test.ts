import { describe, expect, it } from "vitest";
import { clientCommandSchema } from "./protocol";

describe("protocollo", () => {
  it("rifiuta versioni e mosse ambigue", () => {
    const base = { version: 1, roomId: "ABC123", commandId: crypto.randomUUID(), type: "game.move" };
    expect(clientCommandSchema.safeParse({ ...base, payload: { position: 1, column: 2 } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...base, version: 2, payload: { position: 1 } }).success).toBe(false);
  });
});
