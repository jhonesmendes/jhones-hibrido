import { beforeEach, describe, expect, it, vi } from "vitest";

/** FR-002/FR-008: nunca ficar sem owner ativo; PATCH aplica papel/status/permissões/canais. */

let memberRow: { role: string; isActive: boolean } | undefined;
let activeOwnerCount = 0;
type TxCall = { kind: string; args: unknown[] };
let txCalls: TxCall[] = [];

function makeTx() {
  return {
    update: (...a: unknown[]) => {
      txCalls.push({ kind: "update", args: a });
      return {
        set: (...b: unknown[]) => {
          txCalls.push({ kind: "update.set", args: b });
          return { where: () => Promise.resolve() };
        },
      };
    },
    delete: (...a: unknown[]) => {
      txCalls.push({ kind: "delete", args: a });
      return { where: () => Promise.resolve() };
    },
    insert: (...a: unknown[]) => {
      txCalls.push({ kind: "insert", args: a });
      return {
        values: (v: unknown) => {
          txCalls.push({ kind: "insert.values", args: [v] });
          return { onConflictDoUpdate: () => Promise.resolve() };
        },
      };
    },
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ n: activeOwnerCount }]), {
            limit: () => Promise.resolve(memberRow ? [memberRow] : []),
          }),
      }),
    }),
    transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) =>
      fn(makeTx()),
  }),
  schema: {
    member: { organizationId: "organization_id", id: "id", role: "role", isActive: "is_active" },
    memberPermission: { memberId: "member_id", permission: "permission" },
    memberChannel: { memberId: "member_id", channelType: "channel_type" },
  },
}));

import { MemberUpdateError, updateMember } from "@/server/auth/member-management";

beforeEach(() => {
  txCalls = [];
});

describe("updateMember — bloqueio de último owner", () => {
  it("rebaixar o único owner ativo é recusado", async () => {
    memberRow = { role: "owner", isActive: true };
    activeOwnerCount = 0;
    await expect(
      updateMember("org_1", "mb_1", "owner", { role: "admin" })
    ).rejects.toMatchObject({ code: "last_owner" } satisfies Partial<MemberUpdateError>);
  });

  it("desativar o único owner ativo é recusado", async () => {
    memberRow = { role: "owner", isActive: true };
    activeOwnerCount = 0;
    await expect(
      updateMember("org_1", "mb_1", "owner", { isActive: false })
    ).rejects.toMatchObject({ code: "last_owner" });
  });

  it("rebaixar um owner quando há outro owner ativo funciona", async () => {
    memberRow = { role: "owner", isActive: true };
    activeOwnerCount = 1;
    await expect(
      updateMember("org_1", "mb_1", "owner", { role: "admin" })
    ).resolves.toBeUndefined();
  });

  it("editar um agent nunca dispara a checagem de último owner", async () => {
    memberRow = { role: "agent", isActive: true };
    activeOwnerCount = 0;
    await expect(
      updateMember("org_1", "mb_1", "owner", { isActive: false })
    ).resolves.toBeUndefined();
  });
});

describe("updateMember — só owner mexe em owner", () => {
  it("admin não pode editar um owner existente", async () => {
    memberRow = { role: "owner", isActive: true };
    activeOwnerCount = 1;
    await expect(
      updateMember("org_1", "mb_1", "admin", { isActive: false })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("admin não pode promover alguém a owner", async () => {
    memberRow = { role: "agent", isActive: true };
    await expect(
      updateMember("org_1", "mb_1", "admin", { role: "owner" })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("membro inexistente retorna not_found", async () => {
    memberRow = undefined;
    await expect(
      updateMember("org_1", "mb_ghost", "owner", { role: "admin" })
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateMember — permissões e canais", () => {
  it("concede uma permissão fora do default do agent via insert", async () => {
    memberRow = { role: "agent", isActive: true };
    await updateMember("org_1", "mb_1", "owner", {
      permissions: { "campaigns:send": true },
    });
    const insertValues = txCalls.find((c) => c.kind === "insert.values");
    expect(insertValues?.args[0]).toMatchObject({
      permission: "campaigns:send",
      granted: true,
    });
  });

  it("valor igual ao default remove o override (delete)", async () => {
    memberRow = { role: "agent", isActive: true };
    await updateMember("org_1", "mb_1", "owner", {
      permissions: { "conversations:reply": true }, // já é default do agent
    });
    expect(txCalls.some((c) => c.kind === "delete")).toBe(true);
    expect(txCalls.some((c) => c.kind === "insert.values")).toBe(false);
  });

  it("canal com view+send verdadeiros (default) remove a restrição", async () => {
    memberRow = { role: "agent", isActive: true };
    await updateMember("org_1", "mb_1", "owner", {
      channels: { unofficial: { canView: true, canSend: true } },
    });
    expect(txCalls.some((c) => c.kind === "delete")).toBe(true);
  });

  it("canal restrito grava a linha via insert", async () => {
    memberRow = { role: "agent", isActive: true };
    await updateMember("org_1", "mb_1", "owner", {
      channels: { unofficial: { canView: true, canSend: false } },
    });
    const insertValues = txCalls.find((c) => c.kind === "insert.values");
    expect(insertValues?.args[0]).toMatchObject({
      channelType: "unofficial",
      canView: true,
      canSend: false,
    });
  });
});
