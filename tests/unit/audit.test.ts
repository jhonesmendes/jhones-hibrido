import { beforeEach, describe, expect, it, vi } from "vitest";

/** FR-019: logAudit grava os campos corretos e nunca lança. */

let insertedRows: Record<string, unknown>[] = [];
let shouldThrow = false;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        if (shouldThrow) throw new Error("db indisponível");
        insertedRows.push(v);
        return Promise.resolve();
      },
    }),
  }),
  schema: { auditLog: {} },
}));

beforeEach(() => {
  insertedRows = [];
  shouldThrow = false;
});

import { logAudit } from "@/server/auth/audit";

describe("logAudit", () => {
  it("grava organizationId/memberId/action/resource corretos", async () => {
    await logAudit({
      organizationId: "org_1",
      memberId: "mb_1",
      action: "invite.created",
      resource: "invite_token",
      resourceId: "inv_1",
    });
    expect(insertedRows[0]).toMatchObject({
      organizationId: "org_1",
      memberId: "mb_1",
      action: "invite.created",
      resource: "invite_token",
      resourceId: "inv_1",
    });
  });

  it("extrai IP e user-agent de um Request quando fornecido", async () => {
    const req = new Request("http://localhost/api/x", {
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "SelfTest/1.0",
      },
    });
    await logAudit({
      organizationId: "org_1",
      memberId: "mb_1",
      action: "user.login",
      req,
    });
    expect(insertedRows[0]?.ipAddress).toBe("203.0.113.7");
    expect(insertedRows[0]?.userAgent).toBe("SelfTest/1.0");
  });

  it("memberId nulo é aceito (ação do sistema)", async () => {
    await logAudit({ organizationId: "org_1", memberId: null, action: "user.login" });
    expect(insertedRows[0]?.memberId).toBeNull();
  });

  it("nunca lança mesmo se o insert falhar", async () => {
    shouldThrow = true;
    await expect(
      logAudit({ organizationId: "org_1", memberId: "mb_1", action: "user.login" })
    ).resolves.toBeUndefined();
  });
});
