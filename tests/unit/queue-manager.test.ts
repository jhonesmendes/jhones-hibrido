import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Sprint Q2: distribuição da fila (round-robin/first-available), aceite e
 * repasse — claim atômico contra corrida (mesmo padrão do password-reset).
 *
 * Diferente do mock genérico de password-reset.test.ts, aqui há selects com
 * JOIN de verdade (linhas combinadas de mais de uma tabela) — em vez de
 * tentar simular join no mock, cada teste monta diretamente a fixture já
 * "achatada"/combinada que o select correspondente produziria. */

type Row = Record<string, unknown>;

let departmentRows: Row[] = [];
/** Fixture já combinada (memberId + status/currentConversations/lastAssignedAt
 * do agent_status) — é o que `eligibleAgents()` devolve depois do JOIN. */
let eligibleAgentRows: Row[] = [];
/** Fixture já combinada { queue, conversation, contact } — o que a query de
 * `distributeConversation()` devolve depois dos dois INNER JOIN. */
let queueDistributeRow: Row | null = null;
let conversationQueueRows: Row[] = [];
/** claimQueuedConversation(): membro pertence (ou não) ao departamento. */
let memberDepartmentRows: Row[] = [];
/** findActiveQueueEntry(): linha ativa já existente pra essa conversa. */
let activeQueueEntryRows: Row[] = [];

let agentStatusUpdates: Row[] = [];
let conversationUpdates: Row[] = [];
let notifyCalls: Row[] = [];
let sendTextCalls: Row[] = [];

function chain(getRows: () => Row[]) {
  return {
    innerJoin: () => chain(getRows),
    leftJoin: () => chain(getRows),
    where: () =>
      Object.assign(Promise.resolve(getRows()), {
        limit: () => Promise.resolve(getRows()),
      }),
    limit: () => Promise.resolve(getRows()),
  };
}

vi.mock("@/lib/db", () => {
  const department = { __name: "department" };
  const memberDepartment = { __name: "memberDepartment" };
  const agentStatus = { __name: "agentStatus" };
  const conversationQueue = { __name: "conversationQueue" };
  const conversation = { __name: "conversation" };
  const contact = { __name: "contact" };
  const member = { __name: "member" };
  const user = { __name: "user" };

  return {
    getDb: () => ({
      select: (shape: Record<string, unknown>) => ({
        from: (table: { __name: string }) => {
          const keys = Object.keys(shape).sort().join(",");
          // eligibleAgents(): select({ memberId, status, currentConversations, lastAssignedAt })
          if (keys === "currentConversations,lastAssignedAt,memberId,status") {
            return chain(() => eligibleAgentRows);
          }
          // distributeConversation(): select({ queue, conversation, contact })
          if (keys === "contact,conversation,queue") {
            return chain(() => (queueDistributeRow ? [queueDistributeRow] : []));
          }
          // getDepartmentQueueConfig(): select direto de department, sem join.
          if (table.__name === "department") {
            return chain(() => departmentRows);
          }
          // claimQueuedConversation(): checagem de vínculo ao depto.
          if (table.__name === "memberDepartment") {
            return chain(() => memberDepartmentRows);
          }
          // findActiveQueueEntry(): select({ id, status })
          if (keys === "id,status") {
            return chain(() => activeQueueEntryRows);
          }
          return chain(() => []);
        },
      }),
      insert: (table: { __name: string }) => ({
        values: (v: Row) => ({
          returning: () => {
            const row = { ...v };
            if (table.__name === "conversationQueue") conversationQueueRows = [row];
            return Promise.resolve([row]);
          },
        }),
      }),
      update: (table: { __name: string }) => ({
        set: (v: Row) => ({
          // `.where()` executa a mutação na hora — precisa ser tanto
          // "awaitable" direto (chamadas sem `.returning()`, ex.: update de
          // agent_status/conversation) quanto encadeável com `.returning()`
          // (update de conversation_queue, que sempre lê o retorno).
          where: () => {
            let result: Row[] = [];
            if (table.__name === "conversationQueue") {
              const current = conversationQueueRows[0];
              if (current) {
                const merged = { ...current, ...v };
                conversationQueueRows = [merged];
                result = [merged];
              }
            } else if (table.__name === "agentStatus") {
              agentStatusUpdates.push(v);
            } else if (table.__name === "conversation") {
              conversationUpdates.push(v);
            }
            return Object.assign(Promise.resolve(result), {
              returning: () => Promise.resolve(result),
            });
          },
        }),
      }),
    }),
    schema: { department, memberDepartment, agentStatus, conversationQueue, conversation, contact, member, user },
  };
});

vi.mock("@/server/queue/notifier", () => ({
  notifyAgentAssigned: (organizationId: string, params: Row) => {
    notifyCalls.push({ organizationId, ...params });
    return Promise.resolve();
  },
}));

vi.mock("@/server/inbox/send", () => ({
  sendText: (input: Row) => {
    sendTextCalls.push(input);
    return Promise.resolve({ messageId: "msg_1" });
  },
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  departmentRows = [];
  eligibleAgentRows = [];
  queueDistributeRow = null;
  conversationQueueRows = [];
  memberDepartmentRows = [];
  activeQueueEntryRows = [];
  agentStatusUpdates = [];
  conversationUpdates = [];
  notifyCalls = [];
  sendTextCalls = [];
});

import {
  acceptQueuedConversation,
  claimQueuedConversation,
  declineQueuedConversation,
  distributeConversation,
  routeConversationToQueue,
} from "@/server/queue/manager";

const DEPT = {
  id: "dep_1",
  queueEnabled: true,
  routingMode: "automatic",
  distributionMode: "round-robin",
  acceptTimeoutSeconds: 120,
  acceptTimeoutAction: "next-agent",
  maxConversationsPerAgent: 5,
  noAgentsMessage: null,
};

function setQueueRow(status: string, overrides: Row = {}) {
  const queue = {
    id: "cq_1",
    conversationId: "cv_1",
    departmentId: "dep_1",
    status,
    assignedTo: null,
    assignedAt: null,
    timeoutAt: null,
    attempt: 1,
    ...overrides,
  };
  conversationQueueRows = [queue];
  queueDistributeRow = {
    queue,
    conversation: { id: "cv_1", organizationId: "org_1", contactId: "ct_1" },
    contact: { id: "ct_1", name: "Ana Cliente", phone: "5511999990000" },
  };
}

describe("distributeConversation", () => {
  it("sem agente elegível: não designa ninguém", async () => {
    departmentRows = [DEPT];
    setQueueRow("waiting");
    eligibleAgentRows = [];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
    expect(notifyCalls).toHaveLength(0);
  });

  it("round-robin: escolhe quem nunca recebeu (lastAssignedAt null) antes de quem já recebeu", async () => {
    departmentRows = [DEPT];
    setQueueRow("waiting");
    eligibleAgentRows = [
      { memberId: "mb_ja_recebeu", status: "online", currentConversations: 1, lastAssignedAt: new Date() },
      { memberId: "mb_nunca_recebeu", status: "online", currentConversations: 0, lastAssignedAt: null },
    ];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(true);
    expect(result.memberId).toBe("mb_nunca_recebeu");
    expect(notifyCalls[0]?.targetMemberId).toBe("mb_nunca_recebeu");
    expect(agentStatusUpdates[0]?.lastAssignedAt).toBeInstanceOf(Date);
  });

  it("first-available: pega o primeiro elegível, ignora lastAssignedAt", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "first-available" }];
    setQueueRow("waiting");
    eligibleAgentRows = [
      { memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: new Date() },
      { memberId: "mb_2", status: "online", currentConversations: 0, lastAssignedAt: null },
    ];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(true);
    expect(result.memberId).toBe("mb_1");
  });

  it("agente offline não é elegível", async () => {
    departmentRows = [DEPT];
    setQueueRow("waiting");
    eligibleAgentRows = [{ memberId: "mb_1", status: "offline", currentConversations: 0, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
  });

  it("agente no teto de conversas (maxConversationsPerAgent) não é elegível", async () => {
    departmentRows = [{ ...DEPT, maxConversationsPerAgent: 2 }];
    setQueueRow("waiting");
    eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 2, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
  });

  it("linha já não está mais 'waiting': não faz nada (claim perdido)", async () => {
    departmentRows = [DEPT];
    setQueueRow("assigned");
    eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
    expect(notifyCalls).toHaveLength(0);
  });

  it("departamento sem fila ativa: não distribui", async () => {
    departmentRows = [{ ...DEPT, queueEnabled: false }];
    setQueueRow("waiting");
    eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
  });

  it("Cenário 6: fora do horário de funcionamento, não distribui mesmo com agente elegível", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-08T23:00:00Z")); // segunda, 20:00 em SP
    try {
      departmentRows = [
        {
          ...DEPT,
          businessHours: { mon: { enabled: true, start: "08:00", end: "18:00" } },
          timezone: "America/Sao_Paulo",
        },
      ];
      setQueueRow("waiting");
      eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
      const result = await distributeConversation("cq_1");
      expect(result.assigned).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Cenário 6: dentro do horário de funcionamento, distribui normalmente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-08T13:00:00Z")); // segunda, 10:00 em SP
    try {
      departmentRows = [
        {
          ...DEPT,
          businessHours: { mon: { enabled: true, start: "08:00", end: "18:00" } },
          timezone: "America/Sao_Paulo",
        },
      ];
      setQueueRow("waiting");
      eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
      const result = await distributeConversation("cq_1");
      expect(result.assigned).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("designa com sucesso: incrementa lastAssignedAt e notifica o agente com os dados do contato", async () => {
    departmentRows = [DEPT];
    setQueueRow("waiting");
    eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(true);
    expect(conversationQueueRows[0]?.status).toBe("assigned");
    expect(conversationQueueRows[0]?.assignedTo).toBe("mb_1");
    expect(notifyCalls[0]).toMatchObject({
      targetMemberId: "mb_1",
      queueId: "cq_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      contactName: "Ana Cliente",
    });
  });

  it("least-busy: escolhe quem tem menos conversas em andamento", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "least-busy" }];
    setQueueRow("waiting");
    eligibleAgentRows = [
      { memberId: "mb_ocupado", status: "online", currentConversations: 3, lastAssignedAt: null },
      { memberId: "mb_livre", status: "online", currentConversations: 1, lastAssignedAt: new Date() },
    ];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(true);
    expect(result.memberId).toBe("mb_livre");
  });

  it("least-busy: empate resolvido por round-robin (lastAssignedAt mais antigo)", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "least-busy" }];
    setQueueRow("waiting");
    eligibleAgentRows = [
      { memberId: "mb_recente", status: "online", currentConversations: 1, lastAssignedAt: new Date() },
      { memberId: "mb_antigo", status: "online", currentConversations: 1, lastAssignedAt: null },
    ];
    const result = await distributeConversation("cq_1");
    expect(result.memberId).toBe("mb_antigo");
  });

  it("manual: nunca auto-designa, mesmo com agentes elegíveis", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "manual" }];
    setQueueRow("waiting");
    eligibleAgentRows = [{ memberId: "mb_1", status: "online", currentConversations: 0, lastAssignedAt: null }];
    const result = await distributeConversation("cq_1");
    expect(result.assigned).toBe(false);
    expect(notifyCalls).toHaveLength(0);
  });
});

describe("claimQueuedConversation", () => {
  it("membro do depto pega uma conversa 'waiting': designa E já confirma o aceite (sem passo extra)", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "manual" }];
    setQueueRow("waiting");
    memberDepartmentRows = [{ memberId: "mb_1" }];
    const result = await claimQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(true);
    expect(conversationQueueRows[0]?.status).toBe("accepted");
    expect(conversationQueueRows[0]?.assignedTo).toBe("mb_1");
    // Claim é uma decisão do próprio agente — não dispara o toast "Nova
    // conversa" que faz sentido só quando o SISTEMA escolheu por ele.
    expect(notifyCalls).toHaveLength(0);
  });

  it("quem não pertence ao departamento não consegue pegar", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "manual" }];
    setQueueRow("waiting");
    memberDepartmentRows = [];
    const result = await claimQueuedConversation("cq_1", "mb_intruso");
    expect(result.ok).toBe(false);
  });

  it("conversa não está mais 'waiting' (outro já pegou): recusado", async () => {
    departmentRows = [{ ...DEPT, distributionMode: "manual" }];
    setQueueRow("assigned", { assignedTo: "mb_outro" });
    memberDepartmentRows = [{ memberId: "mb_1" }];
    const result = await claimQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(false);
  });
});

describe("acceptQueuedConversation", () => {
  it("agente designado aceita: grava department_id + assigned_to na conversa", async () => {
    setQueueRow("assigned", { assignedTo: "mb_1" });
    const result = await acceptQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(true);
    expect(conversationUpdates[0]?.departmentId).toBe("dep_1");
    expect(conversationUpdates[0]?.assignedTo).toBe("mb_1");
  });

  it("sem linha ativa (ex.: já expirou/foi repassada): recusado sem lançar", async () => {
    conversationQueueRows = [];
    const result = await acceptQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(false);
    expect(conversationUpdates).toHaveLength(0);
  });
});

describe("declineQueuedConversation", () => {
  it("repasse: devolve a fila pra 'waiting' e decrementa o agente", async () => {
    setQueueRow("assigned", { assignedTo: "mb_1" });
    eligibleAgentRows = []; // ninguém mais pra redistribuir de imediato — só valida o decremento
    const result = await declineQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(true);
    expect(conversationQueueRows[0]?.status).toBe("waiting");
    expect(agentStatusUpdates.some((u) => "currentConversations" in u)).toBe(true);
  });

  it("linha inexistente: recusado sem lançar", async () => {
    conversationQueueRows = [];
    const result = await declineQueuedConversation("cq_1", "mb_1");
    expect(result.ok).toBe(false);
  });
});

describe("routeConversationToQueue", () => {
  it("cria a entrada 'waiting' quando não há nenhuma ativa", async () => {
    departmentRows = [DEPT];
    activeQueueEntryRows = [];
    const result = await routeConversationToQueue("cv_1", "dep_1");
    expect(result).not.toBeNull();
    expect(conversationQueueRows[0]?.status).toBe("waiting");
    expect(sendTextCalls).toHaveLength(0); // dentro do horário (sem business_hours configurado)
  });

  it("já existe entrada ativa: idempotente, não cria outra", async () => {
    departmentRows = [DEPT];
    activeQueueEntryRows = [{ id: "cq_existente", status: "assigned" }];
    const result = await routeConversationToQueue("cv_1", "dep_1");
    expect(result).toBeNull();
  });

  it("departamento sem fila ativa: não cria nada", async () => {
    departmentRows = [{ ...DEPT, queueEnabled: false }];
    const result = await routeConversationToQueue("cv_1", "dep_1");
    expect(result).toBeNull();
  });

  it("Cenário 6: fora do horário, cria a entrada mas avisa o cliente com offline_message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-08T23:00:00Z")); // segunda, 20:00 em SP
    try {
      departmentRows = [
        {
          ...DEPT,
          businessHours: { mon: { enabled: true, start: "08:00", end: "18:00" } },
          timezone: "America/Sao_Paulo",
          offlineMessage: "Estamos fechados agora.",
        },
      ];
      activeQueueEntryRows = [];
      // loadQueueRow (chamado pra montar o aviso) usa o fixture de join —
      // simula a entrada recém-criada já combinada com conversa/contato.
      queueDistributeRow = {
        queue: { id: "cq_new", conversationId: "cv_1", departmentId: "dep_1", status: "waiting" },
        conversation: { id: "cv_1", organizationId: "org_1", contactId: "ct_1" },
        contact: { id: "ct_1", name: "Ana Cliente", phone: "5511999990000" },
      };
      const result = await routeConversationToQueue("cv_1", "dep_1");
      expect(result?.withinBusinessHours).toBe(false);
      expect(sendTextCalls).toHaveLength(1);
      expect(sendTextCalls[0]?.text).toBe("Estamos fechados agora.");
    } finally {
      vi.useRealTimers();
    }
  });
});
