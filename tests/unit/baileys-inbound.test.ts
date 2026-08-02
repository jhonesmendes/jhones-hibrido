import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";

const ingestInboundMessage = vi.fn();
vi.mock("@/server/inbox/ingest", () => ({ ingestInboundMessage }));

const { handleIncomingMessages, baileysMessageId } = await import(
  "@/server/baileys/inbound"
);

const getPNForLID = vi.fn(async () => null as string | null);
const fakeSock = {
  signalRepository: { lidMapping: { getPNForLID } },
} as unknown as WASocket;

function makeMsg(overrides: Record<string, unknown> = {}): WAMessage {
  return {
    key: {
      remoteJid: "5511999999999@s.whatsapp.net",
      fromMe: false,
      id: "ABC123",
    },
    message: { conversation: "oi" },
    messageTimestamp: 1785000000,
    pushName: "Cliente Teste",
    ...overrides,
  } as WAMessage;
}

describe("baileysMessageId", () => {
  it("prefija con unof:baileys: para no colisionar con wamid. de Meta", () => {
    expect(baileysMessageId("ABC")).toBe("unof:baileys:ABC");
  });
});

describe("handleIncomingMessages", () => {
  beforeEach(() => {
    ingestInboundMessage.mockReset();
    getPNForLID.mockReset();
    getPNForLID.mockResolvedValue(null);
  });

  it("mensaje de texto simple se ingesta normalizado", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [makeMsg()]);
    expect(ingestInboundMessage).toHaveBeenCalledTimes(1);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg).toMatchObject({
      organizationId: "org_1",
      from: "5511999999999",
      type: "text",
      text: "oi",
      channel: "unofficial",
      fromMe: false,
      waMessageId: "unof:baileys:ABC123",
      mediaUrl: null,
    });
  });

  it("mensaje de grupo (@g.us) se ingesta con contactKind group", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        key: { remoteJid: "123456789-987@g.us", fromMe: false, id: "X" },
      }),
    ]);
    expect(ingestInboundMessage).toHaveBeenCalledTimes(1);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg).toMatchObject({
      from: "123456789-987",
      contactKind: "group",
    });
  });

  it("ignora difusión de status (status@broadcast)", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({ key: { remoteJid: "status@broadcast", fromMe: false, id: "X" } }),
    ]);
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("mensaje sin contenido (notificación de protocolo) se ignora", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [makeMsg({ message: null })]);
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("imagen sin caption: type image, sin preview en esta iteración (mediaUrl null)", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({ message: { imageMessage: {} } }),
    ]);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg.type).toBe("image");
    expect(arg.text).toBeNull();
    expect(arg.mediaUrl).toBeNull();
  });

  it("documento con caption extrae el texto del caption", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        message: { documentMessage: { caption: "Nota fiscal", fileName: "nf.pdf" } },
      }),
    ]);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg.type).toBe("document");
    expect(arg.text).toBe("Nota fiscal");
  });

  it("eco propio (fromMe) se marca correctamente y sin profileName", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: true,
          id: "Y",
        },
      }),
    ]);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg.fromMe).toBe(true);
    expect(arg.profileName).toBeNull();
  });

  it("tipo no soportado (sin campos de contenido reconocidos) se ignora", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({ message: { reactionMessage: { text: "👍" } } }),
    ]);
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("JID @lid con mapeo conocido se resuelve al teléfono real antes de ingestar", async () => {
    getPNForLID.mockResolvedValue("5511999999999:5@s.whatsapp.net");
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        key: { remoteJid: "86543641391354@lid", fromMe: false, id: "Z" },
      }),
    ]);
    expect(getPNForLID).toHaveBeenCalledWith("86543641391354@lid");
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg.from).toBe("5511999999999");
  });

  it("JID @lid sin mapeo conocido todavía se descarta (no crea contacto fantasma)", async () => {
    getPNForLID.mockResolvedValue(null);
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        key: { remoteJid: "86543641391354@lid", fromMe: false, id: "Z" },
      }),
    ]);
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("JID BR sin el 9º dígito (WhatsApp es inconsistente sobre el formato) se normaliza al ingestar", async () => {
    await handleIncomingMessages("org_1", "uch_1", fakeSock, [
      makeMsg({
        key: {
          remoteJid: "556699679169@s.whatsapp.net",
          fromMe: false,
          id: "W",
        },
      }),
    ]);
    const arg = ingestInboundMessage.mock.calls[0]![0];
    expect(arg.from).toBe("5566999679169");
  });
});
