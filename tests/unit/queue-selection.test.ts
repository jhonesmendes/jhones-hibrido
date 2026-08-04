import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Sprint Q3: Modo B (seleção pelo cliente) — saudação, interpretação da
 * resposta e os dois timeouts (seleção e aceite). `manager.ts` e `send.ts`
 * são mockados; o foco aqui é a lógica de selection.ts em si. */

type Row = Record<string, unknown>;

const loadQueueRowMock = vi.fn();
const getDepartmentQueueConfigMock = vi.fn();
const listDepartmentAgentsMock = vi.fn();
const assignConversationToAgentMock = vi.fn();
const distributeConversationMock = vi.fn();
const sendTextMock = vi.fn();

let conversationQueueUpdates: Row[] = [];
let agentStatusUpdates: Row[] = [];

vi.mock("@/server/queue/manager", () => ({
  loadQueueRow: (...args: unknown[]) => loadQueueRowMock(...args),
  getDepartmentQueueConfig: (...args: unknown[]) => getDepartmentQueueConfigMock(...args),
  listDepartmentAgents: (...args: unknown[]) => listDepartmentAgentsMock(...args),
  assignConversationToAgent: (...args: unknown[]) => assignConversationToAgentMock(...args),
  distributeConversation: (...args: unknown[]) => distributeConversationMock(...args),
}));

vi.mock("@/server/inbox/send", () => ({
  sendText: (...args: unknown[]) => sendTextMock(...args),
}));

vi.mock("@/lib/db", () => {
  const conversationQueue = { __name: "conversationQueue" };
  const agentStatus = { __name: "agentStatus" };
  return {
    getDb: () => ({
      update: (table: { __name: string }) => ({
        set: (v: Row) => ({
          where: () => {
            let result: Row[] = [];
            if (table.__name === "conversationQueue") {
              conversationQueueUpdates.push(v);
              result = [{ ...v }];
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
  conversationQueueUpdates = [];
  agentStatusUpdates = [];
  loadQueueRowMock.mockReset();
  getDepartmentQueueConfigMock.mockReset();
  listDepartmentAgentsMock.mockReset();
  assignConversationToAgentMock.mockReset().mockResolvedValue(true);
  distributeConversationMock.mockReset().mockResolvedValue({ assigned: false });
  sendTextMock.mockReset().mockResolvedValue({ messageId: "msg_1" });
});

import {
  handleSelectionAcceptTimeout,
  handleSelectionReply,
  handleSelectionTimeout,
  sendSelectionGreeting,
} from "@/server/queue/selection";

const CONFIG = {
  queueEnabled: true,
  routingMode: "client-selection",
  maxConversationsPerAgent: 5,
  selectionGreeting: null,
  selectionFormat: "numbered",
  selectionTimeoutSeconds: 105,
  selectionTimeoutAction: "auto-assign",
  acceptTimeoutSeconds: 120,
  noAgentsMessage: null,
  selectionUnavailableMessage: null,
  selectionShowOnlyOnline: true,
};

function queueRow(overrides: Row = {}) {
  return {
    queue: {
      id: "cq_1",
      conversationId: "cv_1",
      departmentId: "dep_1",
      status: "waiting",
      assignedTo: null,
      selectionOptions: null,
      attempt: 1,
      ...overrides,
    },
    conversation: { id: "cv_1", organizationId: "org_1", contactId: "ct_1" },
    contact: { id: "ct_1", name: "Ana Cliente" },
  };
}

describe("sendSelectionGreeting", () => {
  it("Cenário 1: envia saudação + lista numerada e entra em 'selecting'", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow());
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "online", currentConversations: 0 },
      { memberId: "mb_2", name: "Maria", status: "online", currentConversations: 0 },
      { memberId: "mb_3", name: "Offline Silva", status: "offline", currentConversations: 0 },
    ]);

    await sendSelectionGreeting("cq_1");

    expect(sendTextMock).toHaveBeenCalledOnce();
    const text = sendTextMock.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("Ana Cliente");
    expect(text).toContain("1. Carlos");
    expect(text).toContain("2. Maria");
    expect(text).not.toContain("Offline Silva");

    const update = conversationQueueUpdates.find((u) => u.status === "selecting");
    expect(update).toBeDefined();
    expect(update?.selectionOptions).toEqual([
      { label: "1", memberId: "mb_1", name: "Carlos", online: true },
      { label: "2", memberId: "mb_2", name: "Maria", online: true },
    ]);
  });

  it("Cenário 7: selectionShowOnlyOnline=false lista também offline, com indicador", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow());
    getDepartmentQueueConfigMock.mockResolvedValue({ ...CONFIG, selectionShowOnlyOnline: false });
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "online", currentConversations: 0 },
      { memberId: "mb_2", name: "Pedro", status: "offline", currentConversations: 0 },
    ]);

    await sendSelectionGreeting("cq_1");

    const text = sendTextMock.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("1. Carlos");
    expect(text).toContain("2. Pedro (offline)");

    const update = conversationQueueUpdates.find((u) => u.status === "selecting");
    expect(update?.selectionOptions).toEqual([
      { label: "1", memberId: "mb_1", name: "Carlos", online: true },
      { label: "2", memberId: "mb_2", name: "Pedro", online: false },
    ]);
  });

  it("formato 'letters': rotula A, B, C...", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow());
    getDepartmentQueueConfigMock.mockResolvedValue({ ...CONFIG, selectionFormat: "letters" });
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "online", currentConversations: 0 },
    ]);

    await sendSelectionGreeting("cq_1");

    const text = sendTextMock.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("A. Carlos");
  });

  it("Cenário 4: sem ninguém online, devolve pra 'waiting' e avisa o cliente (não trava em 'selecting')", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow());
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "offline", currentConversations: 0 },
    ]);

    await sendSelectionGreeting("cq_1");

    expect(conversationQueueUpdates[0]?.status).toBe("waiting");
    expect(sendTextMock).toHaveBeenCalledOnce();
  });

  it("departamento não é Modo B: não faz nada", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow());
    getDepartmentQueueConfigMock.mockResolvedValue({ ...CONFIG, routingMode: "automatic" });
    await sendSelectionGreeting("cq_1");
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe("handleSelectionReply", () => {
  const options = [
    { label: "1", memberId: "mb_1", name: "Carlos", online: true },
    { label: "2", memberId: "mb_2", name: "Maria", online: true },
  ];

  it("cliente responde pelo número: designa o agente escolhido", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "selecting", selectionOptions: options }));
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);

    await handleSelectionReply("cq_1", "2");

    expect(assignConversationToAgentMock).toHaveBeenCalledWith(
      expect.anything(),
      "mb_2",
      120,
      "selecting"
    );
  });

  it("cliente responde pelo nome (case-insensitive): também funciona", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "selecting", selectionOptions: options }));
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);

    await handleSelectionReply("cq_1", "carlos");

    expect(assignConversationToAgentMock).toHaveBeenCalledWith(
      expect.anything(),
      "mb_1",
      120,
      "selecting"
    );
  });

  it("resposta não reconhecida: ignora, não designa ninguém", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "selecting", selectionOptions: options }));
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);

    await handleSelectionReply("cq_1", "não sei quem é esse");

    expect(assignConversationToAgentMock).not.toHaveBeenCalled();
  });

  it("fila não está mais 'selecting' (ex.: já expirou): ignora", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "waiting" }));
    await handleSelectionReply("cq_1", "1");
    expect(assignConversationToAgentMock).not.toHaveBeenCalled();
  });
});

describe("handleSelectionTimeout", () => {
  it("Cenário 3, 'auto-assign': volta pra waiting e tenta distribuir na hora", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "selecting" }));
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);

    await handleSelectionTimeout("cq_1");

    expect(conversationQueueUpdates[0]?.status).toBe("waiting");
    expect(distributeConversationMock).toHaveBeenCalledWith("cq_1");
  });

  it("'queue': volta pra waiting mas NÃO tenta na hora (espera o próximo ciclo)", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "selecting" }));
    getDepartmentQueueConfigMock.mockResolvedValue({ ...CONFIG, selectionTimeoutAction: "queue" });

    await handleSelectionTimeout("cq_1");

    expect(conversationQueueUpdates[0]?.status).toBe("waiting");
    expect(distributeConversationMock).not.toHaveBeenCalled();
  });
});

describe("handleSelectionAcceptTimeout", () => {
  it("Cenário 2: reoferece as opções restantes, excluindo quem não respondeu", async () => {
    const options = [
      { label: "1", memberId: "mb_1", name: "Carlos", online: true },
      { label: "2", memberId: "mb_2", name: "Maria", online: true },
    ];
    loadQueueRowMock.mockResolvedValue(
      queueRow({ status: "assigned", assignedTo: "mb_1", selectionOptions: options })
    );
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "online", currentConversations: 0 },
      { memberId: "mb_2", name: "Maria", status: "online", currentConversations: 0 },
    ]);

    await handleSelectionAcceptTimeout("cq_1");

    expect(agentStatusUpdates).toHaveLength(1); // decrementou o Carlos
    const reoffer = conversationQueueUpdates.find((u) => Array.isArray(u.selectionOptions));
    expect(reoffer?.selectionOptions).toEqual([{ label: "1", memberId: "mb_2", name: "Maria", online: true }]);
    expect(sendTextMock).toHaveBeenCalledOnce();
    const text = sendTextMock.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("Carlos");
    expect(text).toContain("1. Maria");
  });

  it("Cenário 4 via timeout: ninguém mais disponível, devolve pra waiting", async () => {
    loadQueueRowMock.mockResolvedValue(
      queueRow({ status: "assigned", assignedTo: "mb_1", selectionOptions: [{ label: "1", memberId: "mb_1", name: "Carlos", online: true }] })
    );
    getDepartmentQueueConfigMock.mockResolvedValue(CONFIG);
    listDepartmentAgentsMock.mockResolvedValue([
      { memberId: "mb_1", name: "Carlos", status: "online", currentConversations: 0 },
    ]);

    await handleSelectionAcceptTimeout("cq_1");

    const waitingUpdate = conversationQueueUpdates.find((u) => u.status === "waiting");
    expect(waitingUpdate).toBeDefined();
  });

  it("linha não está mais 'assigned': ignora", async () => {
    loadQueueRowMock.mockResolvedValue(queueRow({ status: "accepted", assignedTo: "mb_1" }));
    await handleSelectionAcceptTimeout("cq_1");
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});
