import { beforeEach, describe, expect, it, vi } from "vitest";

/** FR-010 a FR-013: convite por token — geração, checagem e consumo atômico. */

type InviteRow = {
  id: string;
  organizationId: string;
  tokenHash: string;
  email: string | null;
  role: string;
  initialPermissions: Record<string, boolean> | null;
  initialChannels: unknown;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
};

let invite: InviteRow | undefined;
let insertedRows: { table: string; values: Record<string, unknown> }[] = [];
let updateClaimSucceeds = true;

vi.mock("@/lib/db", () => {
  const member = { __name: "member" };
  const memberPermission = { __name: "memberPermission" };
  const memberChannel = { __name: "memberChannel" };
  const memberDepartment = { __name: "memberDepartment" };
  const inviteToken = { __name: "inviteToken" };
  const user = { __name: "user", name: "Convite Testador" };
  const department = { __name: "department", name: "Departamento Teste" };

  function tableName(table: unknown): string {
    return (table as { __name: string }).__name;
  }

  /**
   * `joined=false`: linha crua do invite (usado dentro da transação de
   * consumeInviteToken, sem join). `joined=true`: shape
   * `{ invite, inviterName, departmentName }` (checkInviteToken faz
   * innerJoin com member/user + leftJoin com department).
   */
  function makeChain(joined: boolean) {
    const rows = () =>
      invite
        ? [
            joined
              ? { invite, inviterName: user.name, departmentName: null }
              : invite,
          ]
        : [];
    return {
      innerJoin: () => makeChain(true),
      leftJoin: () => makeChain(true),
      where: () =>
        Object.assign(Promise.resolve(rows()), {
          limit: () => Promise.resolve(rows()),
        }),
    };
  }

  function select() {
    return { from: () => makeChain(false) };
  }

  function makeTx() {
    return {
      select,
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          insertedRows.push({ table: tableName(table), values: v });
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () =>
              Promise.resolve(updateClaimSucceeds ? [{ id: "inv_1" }] : []),
          }),
        }),
      }),
    };
  }

  return {
    getDb: () => ({
      select,
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          insertedRows.push({ table: tableName(table), values: v });
          return Promise.resolve();
        },
      }),
      transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
        fn(makeTx()),
    }),
    schema: {
      member,
      memberPermission,
      memberChannel,
      memberDepartment,
      inviteToken,
      user,
      department,
    },
  };
});

beforeEach(() => {
  insertedRows = [];
  updateClaimSucceeds = true;
});

import {
  checkInviteToken,
  consumeInviteToken,
  createInviteToken,
  InviteConsumeError,
} from "@/server/auth/invite-tokens";
import { createHash } from "node:crypto";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN = "plain-token-abc123";

function baseInvite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: "inv_1",
    organizationId: "org_1",
    tokenHash: hash(TOKEN),
    email: null,
    role: "agent",
    initialPermissions: null,
    initialChannels: null,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    usedBy: null,
    ...overrides,
  };
}

describe("createInviteToken", () => {
  it("gera uma URL com token e insere a linha", async () => {
    const result = await createInviteToken({
      organizationId: "org_1",
      role: "agent",
      expiresIn: "7d",
      createdBy: "mb_owner",
    });
    expect(result.url).toMatch(/^\/register\?token=/);
    expect(insertedRows.some((r) => r.table === "inviteToken")).toBe(true);
  });
});

describe("checkInviteToken", () => {
  it("token inexistente → invalid", async () => {
    invite = undefined;
    const result = await checkInviteToken(TOKEN);
    expect(result).toEqual({ ok: false, code: "invalid" });
  });

  it("token expirado → expired", async () => {
    invite = baseInvite({ expiresAt: new Date(Date.now() - 1000) });
    const result = await checkInviteToken(TOKEN);
    expect(result).toEqual({ ok: false, code: "expired" });
  });

  it("token já usado → used", async () => {
    invite = baseInvite({ usedAt: new Date() });
    const result = await checkInviteToken(TOKEN);
    expect(result).toEqual({ ok: false, code: "used" });
  });

  it("token válido → ok com email/role/inviterName/permissions", async () => {
    invite = baseInvite({ email: "a@b.com", role: "admin" });
    const result = await checkInviteToken(TOKEN);
    expect(result).toMatchObject({
      ok: true,
      email: "a@b.com",
      role: "admin",
      inviterName: "Convite Testador",
      permissions: [],
    });
    expect(result.ok && result.expiresAt).toBeInstanceOf(Date);
  });
});

describe("consumeInviteToken", () => {
  it("cria o member e marca o token usado", async () => {
    invite = baseInvite({ role: "agent" });
    const result = await consumeInviteToken(TOKEN, "user_1", "novo@email.com");
    expect(result.organizationId).toBe("org_1");
    expect(insertedRows.some((r) => r.table === "member")).toBe(true);
  });

  it("email restrito e diferente do usado → email_mismatch", async () => {
    invite = baseInvite({ email: "restrito@email.com" });
    await expect(
      consumeInviteToken(TOKEN, "user_1", "outro@email.com")
    ).rejects.toMatchObject({ code: "email_mismatch" });
  });

  it("token já usado → used", async () => {
    invite = baseInvite({ usedAt: new Date() });
    await expect(
      consumeInviteToken(TOKEN, "user_1", "novo@email.com")
    ).rejects.toMatchObject({ code: "used" });
  });

  it("token expirado → expired", async () => {
    invite = baseInvite({ expiresAt: new Date(Date.now() - 1000) });
    await expect(
      consumeInviteToken(TOKEN, "user_1", "novo@email.com")
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("corrida: UPDATE...WHERE used_at IS NULL não afeta nenhuma linha → used", async () => {
    invite = baseInvite();
    updateClaimSucceeds = false;
    await expect(
      consumeInviteToken(TOKEN, "user_1", "novo@email.com")
    ).rejects.toBeInstanceOf(InviteConsumeError);
  });

  it("aplica permissões e canais iniciais do convite", async () => {
    invite = baseInvite({
      initialPermissions: { "campaigns:send": true },
      initialChannels: { unofficial: { canView: true, canSend: false } },
    });
    await consumeInviteToken(TOKEN, "user_1", "novo@email.com");
    expect(
      insertedRows.some(
        (r) =>
          r.table === "memberPermission" &&
          r.values.permission === "campaigns:send" &&
          r.values.granted === true
      )
    ).toBe(true);
    expect(
      insertedRows.some(
        (r) =>
          r.table === "memberChannel" &&
          r.values.channelType === "unofficial" &&
          r.values.canSend === false
      )
    ).toBe(true);
  });
});
