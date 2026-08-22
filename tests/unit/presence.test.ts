import { beforeEach, describe, expect, it, vi } from "vitest";

/** Sprint Q1: presença do agente — upsert simples, sem lógica de fila ainda. */

let statusRows: { status: string }[] = [];
let upsertCalls: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => {
  const agentStatus = { __name: "agentStatus" };
  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(statusRows),
          }),
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            upsertCalls.push({ ...v, ...set });
            return Promise.resolve();
          },
        }),
      }),
    }),
    schema: { agentStatus },
  };
});

beforeEach(() => {
  statusRows = [];
  upsertCalls = [];
});

import {
  getMemberStatus,
  isAgentStatusValue,
  setMemberStatus,
  touchPresence,
} from "@/server/presence/status";

describe("isAgentStatusValue", () => {
  it("aceita só os 4 valores válidos", () => {
    expect(isAgentStatusValue("online")).toBe(true);
    expect(isAgentStatusValue("busy")).toBe(true);
    expect(isAgentStatusValue("away")).toBe(true);
    expect(isAgentStatusValue("offline")).toBe(true);
    expect(isAgentStatusValue("almoco")).toBe(false);
  });
});

describe("getMemberStatus", () => {
  it("sem linha ainda: offline por padrão", async () => {
    statusRows = [];
    await expect(getMemberStatus("mb_1")).resolves.toBe("offline");
  });

  it("com linha: devolve o status salvo", async () => {
    statusRows = [{ status: "online" }];
    await expect(getMemberStatus("mb_1")).resolves.toBe("online");
  });
});

describe("setMemberStatus", () => {
  it("faz upsert com o status escolhido", async () => {
    await setMemberStatus("mb_1", "away");
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.memberId).toBe("mb_1");
    expect(upsertCalls[0]?.status).toBe("away");
  });
});

describe("touchPresence (heartbeat de atividade)", () => {
  it("sem linha ainda (primeiro login): assume online", async () => {
    statusRows = [];
    await touchPresence("mb_1");
    expect(upsertCalls[0]?.status).toBe("online");
  });

  it("estava away: volta pra online (retomou o uso)", async () => {
    statusRows = [{ status: "away" }];
    await touchPresence("mb_1");
    expect(upsertCalls[0]?.status).toBe("online");
  });

  it("estava busy: NÃO sobrescreve (estado manual explícito)", async () => {
    statusRows = [{ status: "busy" }];
    await touchPresence("mb_1");
    expect(upsertCalls[0]?.status).toBe("busy");
  });

  it("estava offline: NÃO sobrescreve (o agente se desconectou de propósito)", async () => {
    statusRows = [{ status: "offline" }];
    await touchPresence("mb_1");
    expect(upsertCalls[0]?.status).toBe("offline");
  });

  it("estava online: mantém online (só atualiza lastSeenAt)", async () => {
    statusRows = [{ status: "online" }];
    await touchPresence("mb_1");
    expect(upsertCalls[0]?.status).toBe("online");
  });
});
