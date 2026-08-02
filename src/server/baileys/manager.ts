import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type Contact,
  type WASocket,
} from "@whiskeysockets/baileys";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import {
  listPairedChannels,
  loadAuthState,
  resetAuthState,
} from "@/server/baileys/auth-state";
import { baileysMessageId, handleIncomingMessages } from "@/server/baileys/inbound";
import { syncContactNames } from "@/server/baileys/contacts";
import { applyStatusUpdate } from "@/server/inbox/status";

/**
 * Motor WhatsApp não oficial nativo — v0.1: N sockets Baileys em memória por
 * organização, um por canal (`unofficial_channel.id` = chave dos Maps, não
 * mais `organizationId`). Mesmo padrão `globalThis` de antes (sobrevive ao
 * HMR em dev). Conexão direta com o protocolo, sem gateway nem webhook: os
 * eventos chegam por callbacks do próprio socket.
 */

type LiveStatus = {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  phoneNumber: string | null;
};

const globalForBaileys = globalThis as unknown as {
  __voceroBaileysSockets?: Map<string, WASocket>;
  __voceroBaileysStatus?: Map<string, LiveStatus>;
  __voceroBaileysReconnectAttempts?: Map<string, number>;
};

function sockets(): Map<string, WASocket> {
  if (!globalForBaileys.__voceroBaileysSockets) {
    globalForBaileys.__voceroBaileysSockets = new Map();
  }
  return globalForBaileys.__voceroBaileysSockets;
}

function statuses(): Map<string, LiveStatus> {
  if (!globalForBaileys.__voceroBaileysStatus) {
    globalForBaileys.__voceroBaileysStatus = new Map();
  }
  return globalForBaileys.__voceroBaileysStatus;
}

function reconnectAttempts(): Map<string, number> {
  if (!globalForBaileys.__voceroBaileysReconnectAttempts) {
    globalForBaileys.__voceroBaileysReconnectAttempts = new Map();
  }
  return globalForBaileys.__voceroBaileysReconnectAttempts;
}

/** Falhas seguidas (rede instável, handshake do WhatsApp) antes de desistir
 * e devolver o controle pro usuário — sem isso, o loop de reconexão batia
 * de novo a cada poucos segundos e nunca dava tempo do QR ser escaneado. */
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 4000;
const RECONNECT_MAX_DELAY_MS = 30000;

/** Cache em memória por boot — evita buscar a versão do protocolo do
 * WhatsApp Web a cada tentativa de conexão. Sem isso, o Baileys usa a
 * versão embutida no pacote, que o WhatsApp pode já ter descontinuado
 * (handshake falha logo no registro, antes de emitir o QR). */
let cachedWaVersion: [number, number, number] | undefined;

async function resolveWaVersion(): Promise<[number, number, number] | undefined> {
  if (cachedWaVersion) return cachedWaVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedWaVersion = version;
    return version;
  } catch (err) {
    console.error(
      "[baileys] falha ao buscar versão do protocolo, usando padrão da lib:",
      err
    );
    return undefined;
  }
}

function jidToPhoneNumber(jid: string): string {
  return jid.replace(/:\d+/, "").replace(/@.*$/, "");
}

async function getChannelOrganizationId(channelId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ organizationId: schema.unofficialChannel.organizationId })
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.id, channelId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

async function setStatus(
  channelId: string,
  organizationId: string,
  patch: Partial<LiveStatus>
): Promise<void> {
  const current = statuses().get(channelId) ?? {
    status: "disconnected" as const,
    qrCode: null,
    phoneNumber: null,
  };
  const next = { ...current, ...patch };
  statuses().set(channelId, next);
  publish(organizationId, { type: "channel.status", data: { channelId, ...next } });

  const db = getDb();
  await db
    .update(schema.unofficialChannel)
    .set({
      status: next.status,
      ...(patch.phoneNumber !== undefined
        ? { displayPhoneNumber: next.phoneNumber }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.unofficialChannel.id, channelId));
}

export async function connect(
  channelId: string,
  opts: { isRetry?: boolean; organizationId?: string } = {}
): Promise<void> {
  if (sockets().has(channelId)) return;
  if (!opts.isRetry) reconnectAttempts().delete(channelId);

  const organizationId = opts.organizationId ?? (await getChannelOrganizationId(channelId));
  if (!organizationId) {
    console.error(`[baileys] canal ${channelId} não encontrado — conexão abortada`);
    return;
  }

  await setStatus(channelId, organizationId, { status: "connecting", qrCode: null });

  const { state, saveState } = await loadAuthState(channelId);
  const version = await resolveWaVersion();
  const sock = makeWASocket({ auth: state, version, syncFullHistory: false });
  sockets().set(channelId, sock);

  sock.ev.on("creds.update", () => {
    void saveState();
  });

  sock.ev.on("connection.update", (update) => {
    void (async () => {
      if (update.qr) {
        const qrCode = await QRCode.toDataURL(update.qr);
        await setStatus(channelId, organizationId, { status: "connecting", qrCode });
      }

      if (update.connection === "open") {
        reconnectAttempts().delete(channelId);
        const phoneNumber = sock.user?.id ? jidToPhoneNumber(sock.user.id) : null;
        await setStatus(channelId, organizationId, {
          status: "connected",
          qrCode: null,
          phoneNumber,
        });
      }

      if (update.connection === "close") {
        sockets().delete(channelId);
        const statusCode = (
          update.lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          reconnectAttempts().delete(channelId);
          await resetAuthState(channelId);
          await setStatus(channelId, organizationId, {
            status: "disconnected",
            qrCode: null,
            phoneNumber: null,
          });
        } else {
          const attempts = (reconnectAttempts().get(channelId) ?? 0) + 1;
          reconnectAttempts().set(channelId, attempts);

          if (attempts > MAX_RECONNECT_ATTEMPTS) {
            // Rede instável demais pra fechar o pareamento (ex.: handshake
            // falhando repetido em segundos) — desiste e devolve o controle
            // pro usuário em vez de martelar reconexões pra sempre.
            reconnectAttempts().delete(channelId);
            await setStatus(channelId, organizationId, {
              status: "disconnected",
              qrCode: null,
              phoneNumber: null,
            });
            return;
          }

          // Corte de rede/reinício do lado do WhatsApp: reinicia a sessão,
          // com espera crescente pra não martelar o servidor do WhatsApp.
          await setStatus(channelId, organizationId, {
            status: "connecting",
            qrCode: null,
          });
          const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * attempts,
            RECONNECT_MAX_DELAY_MS
          );
          setTimeout(() => {
            void connect(channelId, { isRetry: true, organizationId });
          }, delay);
        }
      }
    })();
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    void handleIncomingMessages(organizationId, channelId, sock, messages).catch(
      (err) => console.error("[baileys] erro ao processar mensagens recebidas:", err)
    );
  });

  // Nome salvo na agenda do telefone (não o pushName) — enriquece contatos
  // já existentes, nunca cria a partir da agenda inteira (ver contacts.ts).
  const onContacts = (contacts: Partial<Contact>[]) => {
    void syncContactNames(organizationId, sock, contacts).catch((err) =>
      console.error("[baileys] erro ao sincronizar nomes de contatos:", err)
    );
  };
  sock.ev.on("contacts.upsert", onContacts);
  sock.ev.on("contacts.update", onContacts);

  // Confirma a entrega real (ou a falha real) do que enviamos — sem isso,
  // uma mensagem "sent" na UI podia nunca ter chegado de verdade (ver
  // ACK_STATUS abaixo) e ninguém ficava sabendo.
  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (!key.id || !key.fromMe || typeof update.status !== "number") continue;
      const status = ACK_STATUS[update.status];
      if (!status) continue;
      void applyStatusUpdate(organizationId, {
        id: baileysMessageId(key.id),
        status,
        timestamp: String(Math.floor(Date.now() / 1000)),
      }).catch((err) =>
        console.error("[baileys] erro ao aplicar status de entrega:", err)
      );
    }
  });
}

/** `proto.WebMessageInfo.Status`: ERROR=0, PENDING=1, SERVER_ACK=2,
 * DELIVERY_ACK=3, READ=4, PLAYED=5. PENDING não é mapeado — já inserimos a
 * mensagem como "sent" ao criá-la, e `applyStatusUpdate` nunca degrada. */
const ACK_STATUS: Record<number, "sent" | "delivered" | "read" | "failed"> = {
  0: "failed",
  2: "sent",
  3: "delivered",
  4: "read",
  5: "read",
};

/** Desconecta (logout) um canal — mantém a linha (nome/departamento), só
 * reseta o auth-state. Excluir o canal por completo é responsabilidade de
 * `server/settings/unofficial-channels.ts:deleteUnofficialChannel`, chamado
 * depois desta função pela API route. */
export async function disconnect(channelId: string): Promise<void> {
  const sock = sockets().get(channelId);
  const organizationId = await getChannelOrganizationId(channelId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // já pode estar desconectado do lado do WhatsApp
    }
    sockets().delete(channelId);
  }
  await resetAuthState(channelId);
  statuses().delete(channelId);
  reconnectAttempts().delete(channelId);
  if (organizationId) {
    publish(organizationId, {
      type: "channel.status",
      data: { channelId, status: "disconnected", qrCode: null, phoneNumber: null },
    });
  }
}

export function getSocket(channelId: string): WASocket | undefined {
  return sockets().get(channelId);
}

export async function getLiveStatus(channelId: string): Promise<LiveStatus> {
  const cached = statuses().get(channelId);
  if (cached) return cached;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.id, channelId))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "disconnected", qrCode: null, phoneNumber: null };
  return {
    status: row.status,
    qrCode: null,
    phoneNumber: row.displayPhoneNumber,
  };
}

/** Reconecta todo canal com uma sessão já pareada (US3, ao iniciar). */
export async function reconnectAllOnBoot(): Promise<void> {
  const channels = await listPairedChannels();
  for (const { channelId, organizationId } of channels) {
    void connect(channelId, { organizationId }).catch((err) =>
      console.error(`[baileys] falha ao reconectar canal ${channelId}:`, err)
    );
  }
}
