import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Bug: canal de saída incorreto ao responder conversa — corrigido trocando
 * o modelo de "1 conversa por contato, canal sticky" por "1 conversa por
 * contato POR canal", com o canal fixado na criação (nunca mais mudado).
 * Aqui o mock simula as duas colunas parciais únicas
 * (conversation_org_contact_meta_cred_uq / ..._unofficial_uq) o suficiente
 * pra provar que dois canais do mesmo contato nunca colidem na mesma
 * linha, e que o mesmo canal reusa a linha existente (idempotência). */

type Row = Record<string, unknown>;

let conversationRows: Row[] = [];
let nextId = 1;

function findExisting(row: Row): Row | undefined {
  return conversationRows.find(
    (r) =>
      r.organizationId === row.organizationId &&
      r.contactId === row.contactId &&
      r.isTest === false &&
      r.channel === row.channel &&
      (row.channel === "official"
        ? r.metaCredentialId === row.metaCredentialId
        : r.unofficialChannelId === row.unofficialChannelId)
  );
}

vi.mock("@/lib/db", () => {
  const conversation = { __name: "conversation" };
  return {
    getDb: () => ({
      insert: (table: { __name: string }) => ({
        values: (v: Row) => ({
          onConflictDoNothing: () => ({
            returning: () => {
              if (table.__name !== "conversation") return Promise.resolve([]);
              const row = { isTest: false, ...v };
              if (findExisting(row)) return Promise.resolve([]); // "conflito" — não insere
              conversationRows.push(row);
              return Promise.resolve([row]);
            },
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () =>
            Object.assign(Promise.resolve(conversationRows), {
              limit: () => Promise.resolve(conversationRows.slice(0, 1)),
              orderBy: () => ({
                limit: () => {
                  const sorted = [...conversationRows].sort((a, b) => {
                    const at = ((a.lastMessageAt as Date) ?? (a.createdAt as Date)).getTime();
                    const bt = ((b.lastMessageAt as Date) ?? (b.createdAt as Date)).getTime();
                    return bt - at;
                  });
                  return Promise.resolve(sorted.slice(0, 1));
                },
              }),
            }),
        }),
      }),
    }),
    schema: { conversation },
  };
});

vi.mock("@/lib/db/ids", () => ({
  newId: () => `cv_${nextId++}`,
}));

const getCredentialsByOrgMock = vi.fn();
const resolveDefaultUnofficialChannelIdMock = vi.fn();

vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByOrg: (...args: unknown[]) => getCredentialsByOrgMock(...args),
  getCredentialsByPhoneNumberId: vi.fn(),
}));

vi.mock("@/server/settings/unofficial-channels", () => ({
  resolveDefaultUnofficialChannelId: (...args: unknown[]) =>
    resolveDefaultUnofficialChannelIdMock(...args),
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  conversationRows = [];
  nextId = 1;
  getCredentialsByOrgMock.mockReset();
  resolveDefaultUnofficialChannelIdMock.mockReset();
});

import { getOrCreateConversation, resolveDefaultChannelForNewConversation } from "@/server/inbox/ingest";
import { getMostRecentConversationForContact } from "@/server/inbox/queries";

describe("getOrCreateConversation — 1 conversa por contato POR canal", () => {
  it("dois canais diferentes do mesmo contato geram DUAS conversas distintas", async () => {
    const official = await getOrCreateConversation("org_1", "ct_1", {
      type: "official",
      metaCredentialId: "meta_ccd",
    });
    const unofficial = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_suporte_ti",
    });

    expect(official.id).not.toBe(unofficial.id);
    expect(official.channel).toBe("official");
    expect(official.metaCredentialId).toBe("meta_ccd");
    expect(unofficial.channel).toBe("unofficial");
    expect(unofficial.unofficialChannelId).toBe("uch_suporte_ti");
    expect(conversationRows).toHaveLength(2);
  });

  it("o mesmo canal do mesmo contato reusa a conversa existente (idempotente)", async () => {
    const first = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_ccd",
    });
    const second = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_ccd",
    });
    expect(second.id).toBe(first.id);
    expect(conversationRows).toHaveLength(1);
  });

  it("dois canais não oficiais diferentes (CCD vs Suporte TI) do mesmo contato não se misturam", async () => {
    const ccd = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_ccd",
    });
    const suporte = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_suporte_ti",
    });
    expect(ccd.id).not.toBe(suporte.id);
    expect(ccd.unofficialChannelId).toBe("uch_ccd");
    expect(suporte.unofficialChannelId).toBe("uch_suporte_ti");
  });
});

describe("getMostRecentConversationForContact", () => {
  it("escolhe a conversa com lastMessageAt mais recente entre os canais do contato", async () => {
    const older = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_ccd",
    });
    older.lastMessageAt = new Date("2024-01-01T10:00:00Z");
    older.createdAt = new Date("2024-01-01T10:00:00Z");

    const newer = await getOrCreateConversation("org_1", "ct_1", {
      type: "unofficial",
      unofficialChannelId: "uch_suporte_ti",
    });
    newer.lastMessageAt = new Date("2024-01-02T10:00:00Z");
    newer.createdAt = new Date("2024-01-02T10:00:00Z");

    const mostRecent = await getMostRecentConversationForContact("org_1", "ct_1");
    expect(mostRecent?.id).toBe(newer.id);
  });
});

describe("resolveDefaultChannelForNewConversation", () => {
  it("prefere o número oficial quando conectado", async () => {
    getCredentialsByOrgMock.mockResolvedValue({ id: "meta_1" });
    const channel = await resolveDefaultChannelForNewConversation("org_1");
    expect(channel).toEqual({ type: "official", metaCredentialId: "meta_1" });
  });

  it("cai pro canal não oficial padrão sem número oficial conectado", async () => {
    getCredentialsByOrgMock.mockResolvedValue(null);
    resolveDefaultUnofficialChannelIdMock.mockResolvedValue("uch_1");
    const channel = await resolveDefaultChannelForNewConversation("org_1");
    expect(channel).toEqual({ type: "unofficial", unofficialChannelId: "uch_1" });
  });

  it("sem nenhum canal conectado: null", async () => {
    getCredentialsByOrgMock.mockResolvedValue(null);
    resolveDefaultUnofficialChannelIdMock.mockResolvedValue(null);
    const channel = await resolveDefaultChannelForNewConversation("org_1");
    expect(channel).toBeNull();
  });
});
