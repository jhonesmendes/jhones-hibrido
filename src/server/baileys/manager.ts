import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  type Contact,
  type WASocket,
} from "@whiskeysockets/baileys";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import {
  deleteAuthState,
  listPairedOrganizations,
  loadAuthState,
} from "@/server/baileys/auth-state";
import { baileysMessageId, handleIncomingMessages } from "@/server/baileys/inbound";
import { syncContactNames } from "@/server/baileys/contacts";
import { applyStatusUpdate } from "@/server/inbox/status";

/**
 * Motor WhatsApp no oficial nativo — un socket Baileys en memoria por
 * organización (mismo patrón `globalThis` que Campañas/Follow-up, para
 * sobrevivir HMR en dev). Conexión directa al protocolo, sin gateway ni
 * webhook: los eventos llegan por callbacks del propio socket.
 */

type LiveStatus = {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  phoneNumber: string | null;
};

const globalForBaileys = globalThis as unknown as {
  __voceroBaileysSockets?: Map<string, WASocket>;
  __voceroBaileysStatus?: Map<string, LiveStatus>;
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

function jidToPhoneNumber(jid: string): string {
  return jid.replace(/:\d+/, "").replace(/@.*$/, "");
}

async function setStatus(
  organizationId: string,
  patch: Partial<LiveStatus>
): Promise<void> {
  const current = statuses().get(organizationId) ?? {
    status: "disconnected" as const,
    qrCode: null,
    phoneNumber: null,
  };
  const next = { ...current, ...patch };
  statuses().set(organizationId, next);
  publish(organizationId, { type: "channel.status", data: next });

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
    .where(eq(schema.unofficialChannel.organizationId, organizationId));
}

export async function connect(organizationId: string): Promise<void> {
  if (sockets().has(organizationId)) return;

  await setStatus(organizationId, { status: "connecting", qrCode: null });

  const { state, saveState } = await loadAuthState(organizationId);
  const sock = makeWASocket({ auth: state, syncFullHistory: false });
  sockets().set(organizationId, sock);

  sock.ev.on("creds.update", () => {
    void saveState();
  });

  sock.ev.on("connection.update", (update) => {
    void (async () => {
      if (update.qr) {
        const qrCode = await QRCode.toDataURL(update.qr);
        await setStatus(organizationId, { status: "connecting", qrCode });
      }

      if (update.connection === "open") {
        const phoneNumber = sock.user?.id
          ? jidToPhoneNumber(sock.user.id)
          : null;
        await setStatus(organizationId, {
          status: "connected",
          qrCode: null,
          phoneNumber,
        });
      }

      if (update.connection === "close") {
        sockets().delete(organizationId);
        const statusCode = (
          update.lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          await deleteAuthState(organizationId);
          await setStatus(organizationId, {
            status: "disconnected",
            qrCode: null,
            phoneNumber: null,
          });
        } else {
          // Corte de red/reinicio del lado de WhatsApp: reintenta la sesión.
          await setStatus(organizationId, {
            status: "connecting",
            qrCode: null,
          });
          void connect(organizationId);
        }
      }
    })();
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    void handleIncomingMessages(organizationId, sock, messages).catch((err) =>
      console.error("[baileys] erro ao processar mensagens recebidas:", err)
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

  // Confirma la entrega real (o el fallo real) de lo que enviamos — sin
  // esto, un mensaje "sent" en la UI podía nunca haber llegado de verdad
  // (ver ACK_STATUS abajo) y nadie se enteraba.
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
 * DELIVERY_ACK=3, READ=4, PLAYED=5. PENDING no mapea — ya insertamos el
 * mensaje como "sent" al crearlo, y `applyStatusUpdate` nunca degrada. */
const ACK_STATUS: Record<number, "sent" | "delivered" | "read" | "failed"> = {
  0: "failed",
  2: "sent",
  3: "delivered",
  4: "read",
  5: "read",
};

export async function disconnect(organizationId: string): Promise<void> {
  const sock = sockets().get(organizationId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ya puede estar desconectado del lado de WhatsApp
    }
    sockets().delete(organizationId);
  }
  await deleteAuthState(organizationId);
  statuses().delete(organizationId);
  publish(organizationId, {
    type: "channel.status",
    data: { status: "disconnected", qrCode: null, phoneNumber: null },
  });
}

export function getSocket(organizationId: string): WASocket | undefined {
  return sockets().get(organizationId);
}

export async function getLiveStatus(
  organizationId: string
): Promise<LiveStatus> {
  const cached = statuses().get(organizationId);
  if (cached) return cached;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.unofficialChannel)
    .where(eq(schema.unofficialChannel.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "disconnected", qrCode: null, phoneNumber: null };
  return {
    status: row.status,
    qrCode: null,
    phoneNumber: row.displayPhoneNumber,
  };
}

/** Reconecta toda organización con una sesión ya pareada (US3, al arrancar). */
export async function reconnectAllOnBoot(): Promise<void> {
  const organizationIds = await listPairedOrganizations();
  for (const organizationId of organizationIds) {
    void connect(organizationId).catch((err) =>
      console.error(
        `[baileys] falha ao reconectar organização ${organizationId}:`,
        err
      )
    );
  }
}
