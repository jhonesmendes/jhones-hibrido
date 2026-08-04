import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Sprint Q2/Q4: ciclo do scheduler — redistribui 'waiting', despacha
 * timeout de 'selecting'/'assigned' e checa fila crítica.
 * `distributeConversation`/`getDepartmentQueueConfig` (Modo A),
 * `selection.ts` (Modo B) e `critical-alert.ts` são mockados (cada um já
 * testado no próprio arquivo) — aqui o foco é só a orquestração do ciclo:
 * quem é chamado, com o quê, e que uma falha pontual não trava o resto. */

type Row = Record<string, unknown>;

let waitingRows: Row[] = [];
let selectingExpiredRows: Row[] = [];
let assignedExpiredRows: Row[] = [];
let conversationQueueRows: Row[] = [];
let agentStatusUpdates: Row[] = [];
let selectCallsOnConversationQueue = 0;

const distributeConversationMock = vi.fn();
const getDepartmentQueueConfigMock = vi.fn();
const handleSelectionTimeoutMock = vi.fn();
const handleSelectionAcceptTimeoutMock = vi.fn();
const checkCriticalQueuesMock = vi.fn();

vi.mock("@/server/queue/manager", () => ({
  distributeConversation: (...args: unknown[]) => distributeConversationMock(...args),
  getDepartmentQueueConfig: (...args: unknown[]) => getDepartmentQueueConfigMock(...args),
}));

vi.mock("@/server/queue/selection", () => ({
  handleSelectionTimeout: (...args: unknown[]) => handleSelectionTimeoutMock(...args),
  handleSelectionAcceptTimeout: (...args: unknown[]) => handleSelectionAcceptTimeoutMock(...args),
}));

vi.mock("@/server/queue/critical-alert", () => ({
  checkCriticalQueues: (...args: unknown[]) => checkCriticalQueuesMock(...args),
}));

vi.mock("@/lib/db", () => {
  const conversationQueue = { __name: "conversationQueue" };
  const agentStatus = { __name: "agentStatus" };
  return {
    getDb: () => ({
      select: (shape?: Record<string, unknown>) => ({
        from: () => ({
          where: () => {
            // As duas primeiras chamadas com esse shape são a lista de
            // 'waiting' (Modo A) e a de 'selecting' vencido (Modo B) —
            // nessa ordem, igual ao runQueueCycle. A 3ª (sem shape de 1
            // chave) é a de 'assigned' vencido.
            if (shape && Object.keys(shape).length === 1 && "id" in shape) {
              selectCallsOnConversationQueue += 1;
              return Promise.resolve(selectCallsOnConversationQueue === 1 ? waitingRows : selectingExpiredRows);
            }
            return Promise.resolve(assignedExpiredRows);
          },
        }),
      }),
      update: (table: { __name: string }) => ({
        set: (v: Row) => ({
          where: () => {
            let result: Row[] = [];
            if (table.__name === "conversationQueue") {
              const current = conversationQueueRows[0];
              if (current && current.status === "assigned") {
                const merged = { ...current, ...v };
                conversationQueueRows = [merged];
                result = [merged];
              }
            } else if (table.__name === "agentStatus") {
              agentStatusUpdates.push(v);
            }
            return Object.assign(Promise.resolve(result), {
              returning: () => Promise.resolve(result),
            });
          },
        }),
      }),
    }),
    schema: { conversationQueue, agentStatus },
  };
});

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  waitingRows = [];
  selectingExpiredRows = [];
  assignedExpiredRows = [];
  conversationQueueRows = [];
  agentStatusUpdates = [];
  selectCallsOnConversationQueue = 0;
  distributeConversationMock.mockReset().mockResolvedValue({ assigned: false });
  getDepartmentQueueConfigMock.mockReset();
  handleSelectionTimeoutMock.mockReset().mockResolvedValue(undefined);
  handleSelectionAcceptTimeoutMock.mockReset().mockResolvedValue(undefined);
  checkCriticalQueuesMock.mockReset().mockResolvedValue(undefined);
});

import { runQueueCycle } from "@/server/queue/scheduler";

describe("runQueueCycle", () => {
  it("tenta redistribuir toda linha 'waiting'", async () => {
    waitingRows = [{ id: "cq_1" }, { id: "cq_2" }];
    await runQueueCycle();
    expect(distributeConversationMock).toHaveBeenCalledWith("cq_1");
    expect(distributeConversationMock).toHaveBeenCalledWith("cq_2");
  });

  it("uma falha numa linha 'waiting' não interrompe as outras", async () => {
    waitingRows = [{ id: "cq_1" }, { id: "cq_2" }];
    distributeConversationMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ assigned: false });
    await expect(runQueueCycle()).resolves.toBeUndefined();
    expect(distributeConversationMock).toHaveBeenCalledTimes(2);
  });

  it("accept_timeout_action='next-agent': devolve pra waiting, decrementa o agente e tenta de novo na hora", async () => {
    const now = new Date();
    conversationQueueRows = [
      { id: "cq_3", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 },
    ];
    assignedExpiredRows = [{ id: "cq_3", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 }];
    getDepartmentQueueConfigMock.mockResolvedValue({ acceptTimeoutAction: "next-agent" });

    await runQueueCycle(now);

    expect(conversationQueueRows[0]?.status).toBe("waiting");
    expect(conversationQueueRows[0]?.assignedTo).toBe(null);
    expect(conversationQueueRows[0]?.attempt).toBe(2);
    expect(agentStatusUpdates).toHaveLength(1);
    expect(distributeConversationMock).toHaveBeenCalledWith("cq_3");
  });

  it("accept_timeout_action='queue': devolve pra waiting mas NÃO redistribui na hora (espera o próximo ciclo)", async () => {
    const now = new Date();
    conversationQueueRows = [
      { id: "cq_4", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 },
    ];
    assignedExpiredRows = [{ id: "cq_4", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 }];
    getDepartmentQueueConfigMock.mockResolvedValue({ acceptTimeoutAction: "queue" });

    await runQueueCycle(now);

    expect(conversationQueueRows[0]?.status).toBe("waiting");
    expect(distributeConversationMock).not.toHaveBeenCalled();
  });

  it("já não está mais 'assigned' (aceita entre a leitura e o processamento): não reprocessa", async () => {
    conversationQueueRows = [
      { id: "cq_5", departmentId: "dep_1", status: "accepted", assignedTo: "mb_1", attempt: 1 },
    ];
    assignedExpiredRows = [{ id: "cq_5", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 }];
    getDepartmentQueueConfigMock.mockResolvedValue({ acceptTimeoutAction: "next-agent" });

    await runQueueCycle(new Date());

    expect(agentStatusUpdates).toHaveLength(0);
    expect(distributeConversationMock).not.toHaveBeenCalled();
  });

  it("Modo B: 'assigned' vencido chama handleSelectionAcceptTimeout, não o fluxo genérico do Modo A", async () => {
    assignedExpiredRows = [{ id: "cq_6", departmentId: "dep_1", status: "assigned", assignedTo: "mb_1", attempt: 1 }];
    getDepartmentQueueConfigMock.mockResolvedValue({ routingMode: "client-selection" });

    await runQueueCycle(new Date());

    expect(handleSelectionAcceptTimeoutMock).toHaveBeenCalledWith("cq_6");
    expect(agentStatusUpdates).toHaveLength(0); // não passou pelo claim genérico do Modo A
  });

  it("Cenário 3: 'selecting' vencido chama handleSelectionTimeout pra cada linha", async () => {
    selectingExpiredRows = [{ id: "cq_7" }, { id: "cq_8" }];
    await runQueueCycle();
    expect(handleSelectionTimeoutMock).toHaveBeenCalledWith("cq_7");
    expect(handleSelectionTimeoutMock).toHaveBeenCalledWith("cq_8");
  });

  it("chama checkCriticalQueues a cada ciclo", async () => {
    const now = new Date();
    await runQueueCycle(now);
    expect(checkCriticalQueuesMock).toHaveBeenCalledWith(now);
  });
});
