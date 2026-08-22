import { describe, expect, it, vi } from "vitest";

/** Sweeper de ausência automática — marca "away" quem está "online" sem
 * heartbeat há tempo demais; nunca toca "busy"/"offline" (estados manuais). */

let whereCalls: unknown[] = [];
let returningResult: { id: string }[] = [];

vi.mock("@/lib/db", () => {
  const agentStatus = { __name: "agentStatus", status: "status", lastSeenAt: "lastSeenAt" };
  return {
    getDb: () => ({
      update: () => ({
        set: () => ({
          where: (cond: unknown) => {
            whereCalls.push(cond);
            return { returning: () => Promise.resolve(returningResult) };
          },
        }),
      }),
    }),
    schema: { agentStatus },
  };
});

import { runPresenceAwaySweep } from "@/server/presence/sweeper";

describe("runPresenceAwaySweep", () => {
  it("devolve quantas linhas foram marcadas away", async () => {
    whereCalls = [];
    returningResult = [{ id: "ast_1" }, { id: "ast_2" }];
    const count = await runPresenceAwaySweep();
    expect(count).toBe(2);
    expect(whereCalls).toHaveLength(1);
  });

  it("zero linhas afetadas quando ninguém está ocioso", async () => {
    returningResult = [];
    const count = await runPresenceAwaySweep();
    expect(count).toBe(0);
  });
});
