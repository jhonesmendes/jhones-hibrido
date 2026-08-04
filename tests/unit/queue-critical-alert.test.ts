import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Sprint Q4: aviso de fila crítica — dispara quando 'waiting' >=
 * max_queue_size, pra admins do depto + owners da org, com cooldown. */

type Row = Record<string, unknown>;

let departmentRows: Row[] = [];
let waitingCount = 0;
let adminRows: Row[] = [];
let ownerRows: Row[] = [];
const pushCalls: Row[] = [];

const sendPushToMemberMock = vi.fn((memberId: string, payload: Row) => {
  pushCalls.push({ memberId, ...payload });
  return Promise.resolve();
});

vi.mock("@/server/push/send", () => ({
  sendPushToMember: (...args: [string, Row]) => sendPushToMemberMock(...args),
}));

vi.mock("@/lib/db", () => {
  const department = { __name: "department" };
  const conversationQueue = { __name: "conversationQueue" };
  const memberDepartment = { __name: "memberDepartment" };
  const member = { __name: "member" };
  return {
    getDb: () => ({
      select: (shape: Record<string, unknown>) => ({
        from: (table: { __name: string }) => ({
          where: () => {
            if ("n" in shape) return Promise.resolve([{ n: waitingCount }]);
            if (table.__name === "department") return Promise.resolve(departmentRows);
            if (table.__name === "memberDepartment") return Promise.resolve(adminRows);
            if (table.__name === "member") return Promise.resolve(ownerRows);
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    schema: { department, conversationQueue, memberDepartment, member },
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
  departmentRows = [];
  waitingCount = 0;
  adminRows = [];
  ownerRows = [];
  pushCalls.length = 0;
  sendPushToMemberMock.mockClear();
});

import { checkCriticalQueues } from "@/server/queue/critical-alert";

// Cooldown é estado de módulo (em memória, por departmentId) — cada teste
// usa um id de depto diferente pra não vazar estado entre casos.
function dept(id: string, overrides: Row = {}) {
  return { id, organizationId: "org_1", name: "Comercial", maxQueueSize: 5, ...overrides };
}

describe("checkCriticalQueues", () => {
  it("abaixo do limite: não notifica ninguém", async () => {
    departmentRows = [dept("dep_below")];
    waitingCount = 4;
    adminRows = [{ memberId: "mb_admin" }];
    await checkCriticalQueues(new Date());
    expect(sendPushToMemberMock).not.toHaveBeenCalled();
  });

  it("no limite: notifica admins do depto e owners da org", async () => {
    departmentRows = [dept("dep_at_limit")];
    waitingCount = 5;
    adminRows = [{ memberId: "mb_admin" }];
    ownerRows = [{ memberId: "mb_owner" }];
    await checkCriticalQueues(new Date());
    const notified = pushCalls.map((c) => c.memberId).sort();
    expect(notified).toEqual(["mb_admin", "mb_owner"]);
    expect(pushCalls[0]?.body).toContain("Comercial");
    expect(pushCalls[0]?.body).toContain("5");
  });

  it("cooldown: segunda checagem logo em seguida não notifica de novo", async () => {
    departmentRows = [dept("dep_cooldown_active")];
    waitingCount = 10;
    adminRows = [{ memberId: "mb_admin" }];
    const now = new Date();
    await checkCriticalQueues(now);
    expect(sendPushToMemberMock).toHaveBeenCalledTimes(1);

    await checkCriticalQueues(new Date(now.getTime() + 60_000)); // 1 min depois
    expect(sendPushToMemberMock).toHaveBeenCalledTimes(1); // ainda em cooldown
  });

  it("cooldown expirado: notifica de novo", async () => {
    departmentRows = [dept("dep_cooldown_expired")];
    waitingCount = 10;
    adminRows = [{ memberId: "mb_admin" }];
    const now = new Date();
    await checkCriticalQueues(now);
    expect(sendPushToMemberMock).toHaveBeenCalledTimes(1);

    await checkCriticalQueues(new Date(now.getTime() + 11 * 60_000)); // 11 min depois
    expect(sendPushToMemberMock).toHaveBeenCalledTimes(2);
  });
});
