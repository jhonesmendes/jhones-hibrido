import { describe, expect, it } from "vitest";
import { formatLocationText, normalizeLocation } from "@/server/inbox/location";
import { appendContactNote, MAX_CONTACT_NOTES_LENGTH } from "@/server/inbox/transfer";
import { buildInboundPayload } from "@/server/n8n/inbound-events";
import type { schema } from "@/lib/db";

describe("normalizeLocation", () => {
  it("aceita coordenadas e limpa os rótulos", () => {
    expect(
      normalizeLocation({ latitude: -15.6, longitude: -56.1, name: " Posto ", address: "" })
    ).toEqual({ latitude: -15.6, longitude: -56.1, name: "Posto", address: null });
  });

  it("recusa coordenada ausente ou fora da faixa", () => {
    expect(normalizeLocation(null)).toBeNull();
    expect(normalizeLocation({ longitude: 1 })).toBeNull();
    expect(normalizeLocation({ latitude: 91, longitude: 1 })).toBeNull();
    expect(normalizeLocation({ latitude: 1, longitude: Number.NaN })).toBeNull();
  });
});

describe("formatLocationText", () => {
  it("mostra lugar e coordenadas, ou só as coordenadas", () => {
    expect(
      formatLocationText({ latitude: -15.6, longitude: -56.1, name: "Posto", address: "BR-163" })
    ).toBe("📍 Posto - BR-163 (-15.6, -56.1)");
    expect(formatLocationText({ latitude: 1, longitude: 2, name: null, address: null })).toBe(
      "📍 1, 2"
    );
  });
});

describe("appendContactNote", () => {
  const at = new Date("2026-11-05T12:30:00Z");

  it("preserva o que já existe e carimba a nota", () => {
    expect(appendContactNote(null, "nova", at)).toBe("[2026-11-05 12:30 UTC] nova");
    expect(appendContactNote("antiga", "nova", at)).toBe("antiga\n[2026-11-05 12:30 UTC] nova");
  });

  it("passando do limite, descarta o trecho mais antigo", () => {
    const result = appendContactNote("x".repeat(MAX_CONTACT_NOTES_LENGTH), "nova", at);
    expect(result).toHaveLength(MAX_CONTACT_NOTES_LENGTH);
    expect(result.endsWith("nova")).toBe(true);
  });
});

describe("evento do n8n", () => {
  it("leva as coordenadas da mensagem de localização", () => {
    const location = { latitude: -15.6, longitude: -56.1, name: null, address: null };
    const payload = buildInboundPayload({
      baseUrl: "https://sankhya.vocero.com.br",
      conversation: { id: "cv_1", channel: "official" },
      contact: { id: "ct_1", phone: "5566999990000", name: null },
      media: null,
      message: {
        id: "msg_1",
        waMessageId: "wamid.1",
        type: "location",
        text: "📍 -15.6, -56.1",
        location,
        mediaUrl: null,
        replyToMessageId: null,
        waTimestamp: new Date("2026-11-05T12:00:00Z"),
        createdAt: new Date("2026-11-05T12:00:00Z"),
      } as unknown as typeof schema.message.$inferSelect,
    });
    expect(payload.message.location).toEqual(location);
  });
});
