import { describe, expect, it } from "vitest";
import { vi } from "vitest";

/** FR-001 a FR-007: permissão efetiva por membro (default do papel + overrides). */

let permissionRows: { permission: string; granted: boolean }[] = [];
let channelRow: { canView: boolean; canSend: boolean } | undefined;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(permissionRows), {
            limit: () => Promise.resolve(channelRow ? [channelRow] : []),
          }),
      }),
    }),
  }),
  schema: { memberPermission: {}, memberChannel: {} },
}));

import {
  ForbiddenError,
  requireChannelAccess,
  requireConversationAccess,
  requirePermission,
  resolveChannelAccess,
  resolvePermissions,
} from "@/lib/auth/require-permission";
import type { SessionContext } from "@/lib/auth/session";

function session(role: string, memberId = "mb_1"): SessionContext {
  return { userId: "u_1", memberId, organizationId: "org_1", role };
}

describe("resolvePermissions", () => {
  it("owner tem todas as permissões, sem consultar overrides", async () => {
    permissionRows = [{ permission: "campaigns:send", granted: false }];
    const perms = await resolvePermissions("mb_1", "owner");
    expect(perms.has("campaigns:send")).toBe(true);
  });

  it("admin tem o default de todas as permissões", async () => {
    permissionRows = [];
    const perms = await resolvePermissions("mb_1", "admin");
    expect(perms.has("campaigns:send")).toBe(true);
    expect(perms.has("agent:manage")).toBe(true);
  });

  it("agent tem só o subconjunto operacional por default", async () => {
    permissionRows = [];
    const perms = await resolvePermissions("mb_1", "agent");
    expect(perms.has("conversations:reply")).toBe(true);
    expect(perms.has("campaigns:send")).toBe(false);
  });

  it("override de concessão soma ao default do agent", async () => {
    permissionRows = [{ permission: "campaigns:send", granted: true }];
    const perms = await resolvePermissions("mb_1", "agent");
    expect(perms.has("campaigns:send")).toBe(true);
  });

  it("override de revogação remove uma permissão que era default", async () => {
    permissionRows = [{ permission: "pipeline:move", granted: false }];
    const perms = await resolvePermissions("mb_1", "agent");
    expect(perms.has("pipeline:move")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("owner sempre passa, mesmo sem override", async () => {
    permissionRows = [];
    await expect(
      requirePermission(session("owner"), "campaigns:send")
    ).resolves.toBeUndefined();
  });

  it("agent sem a permissão lança ForbiddenError", async () => {
    permissionRows = [];
    await expect(
      requirePermission(session("agent"), "campaigns:send")
    ).rejects.toThrow(ForbiddenError);
  });

  it("agent com a permissão concedida via override passa", async () => {
    permissionRows = [{ permission: "campaigns:send", granted: true }];
    await expect(
      requirePermission(session("agent"), "campaigns:send")
    ).resolves.toBeUndefined();
  });
});

describe("requireConversationAccess", () => {
  it("owner sempre passa", async () => {
    permissionRows = [];
    await expect(
      requireConversationAccess(session("owner"), "outro_membro")
    ).resolves.toBeUndefined();
  });

  it("agent com conversations:view_all vê qualquer conversa", async () => {
    permissionRows = [
      { permission: "conversations:view_all", granted: true },
    ];
    await expect(
      requireConversationAccess(session("agent"), "outro_membro")
    ).resolves.toBeUndefined();
  });

  it("agent sem view_all só vê a própria conversa atribuída", async () => {
    permissionRows = [];
    await expect(
      requireConversationAccess(session("agent", "mb_1"), "mb_1")
    ).resolves.toBeUndefined();
  });

  it("agent sem view_all e não atribuída a ele é recusado", async () => {
    permissionRows = [];
    await expect(
      requireConversationAccess(session("agent", "mb_1"), "mb_2")
    ).rejects.toThrow(ForbiddenError);
  });

  it("agent sem view_all e conversa não atribuída (null) é recusado", async () => {
    permissionRows = [];
    await expect(
      requireConversationAccess(session("agent", "mb_1"), null)
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("resolveChannelAccess / requireChannelAccess", () => {
  it("owner sempre liberado", async () => {
    channelRow = { canView: false, canSend: false };
    const access = await resolveChannelAccess("mb_1", "owner", "unofficial");
    expect(access).toEqual({ canView: true, canSend: true });
  });

  it("sem linha, acesso liberado por padrão", async () => {
    channelRow = undefined;
    const access = await resolveChannelAccess("mb_1", "agent", "official");
    expect(access).toEqual({ canView: true, canSend: true });
  });

  it("com linha bloqueando envio, requireChannelAccess recusa 'send' mas libera 'view'", async () => {
    channelRow = { canView: true, canSend: false };
    await expect(
      requireChannelAccess(session("agent"), "unofficial", "send")
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireChannelAccess(session("agent"), "unofficial", "view")
    ).resolves.toBeUndefined();
  });
});
