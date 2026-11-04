import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInboundPayload,
  isDeliveryDue,
  postToWebhook,
  RETRY_DELAYS_MS,
} from "@/server/n8n/inbound-events";
import type { schema } from "@/lib/db";

const baseMessage = {
  id: "msg_1",
  waMessageId: "wamid.1",
  type: "text",
  text: "oi",
  mediaUrl: null,
  replyToMessageId: null,
  waTimestamp: new Date("2026-11-04T12:00:00Z"),
  createdAt: new Date("2026-11-04T12:00:05Z"),
} as unknown as typeof schema.message.$inferSelect;

const context = {
  baseUrl: "https://sankhya.vocero.com.br/",
  conversation: { id: "cv_1", channel: "official" },
  contact: { id: "ct_1", phone: "5566999990000", name: "Maria" },
};

describe("buildInboundPayload", () => {
  it("mensagem de texto vai sem mídia e com a hora do WhatsApp", () => {
    const p = buildInboundPayload({ ...context, message: baseMessage, media: null });
    expect(p.event).toBe("message.received");
    expect(p.eventId).toBe("msg_1");
    expect(p.occurredAt).toBe("2026-11-04T12:00:00.000Z");
    expect(p.contact.phone).toBe("5566999990000");
    expect(p.message.media).toBeNull();
  });

  it("mídia baixada traz URL interna e metadados", () => {
    const p = buildInboundPayload({
      ...context,
      message: { ...baseMessage, type: "image", mediaUrl: "local" },
      media: { mimeType: "image/png", filename: null, sizeBytes: 10 },
    });
    expect(p.message.media).toEqual({
      url: "https://sankhya.vocero.com.br/api/internal/messages/msg_1/media",
      available: true,
      mimeType: "image/png",
      filename: null,
      sizeBytes: 10,
    });
  });

  it("mídia ainda em recuperação sai como indisponível", () => {
    const p = buildInboundPayload({
      ...context,
      message: { ...baseMessage, type: "audio", mediaUrl: "local" },
      media: null,
    });
    expect(p.message.media?.available).toBe(false);
  });
});

describe("isDeliveryDue", () => {
  const now = new Date("2026-11-04T12:00:00Z");

  it("primeira tentativa é imediata", () => {
    expect(isDeliveryDue(0, null, now)).toBe(true);
  });

  it("respeita a espera antes de tentar de novo", () => {
    expect(isDeliveryDue(1, new Date(now.getTime() - 10_000), now)).toBe(false);
    expect(isDeliveryDue(1, new Date(now.getTime() - 30_000), now)).toBe(true);
  });

  it("para depois da última tentativa", () => {
    expect(isDeliveryDue(RETRY_DELAYS_MS.length, new Date(0), now)).toBe(false);
  });
});

describe("postToWebhook", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda o token no header quando existe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await postToWebhook({ url: "https://n8n.test/webhook/x", token: "segredo" }, { a: 1 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-vocero-token"]).toBe("segredo");
    expect(init.body).toBe('{"a":1}');
  });

  it("não manda header de token sem token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await postToWebhook({ url: "https://n8n.test/webhook/x", token: null }, {});
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers as Record<string, string>).not.toHaveProperty("x-vocero-token");
  });

  it("resposta não 2xx é falha, com dica no 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(postToWebhook({ url: "https://n8n.test/x", token: null }, {})).rejects.toThrow(
      /ativo no n8n/
    );
  });
});
