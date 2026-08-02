import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type Credentials = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  name: string;
  description: string | null;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  isActive: boolean;
  token: string;
};

type Row = typeof schema.metaCredentials.$inferSelect;

function toCredentials(row: Row): Credentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    departmentId: row.departmentId,
    name: row.name,
    description: row.description,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    status: row.status,
    isActive: row.isActive,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

/** Resolve a conexão por phone_number_id (roteamento do webhook). */
export async function getCredentialsByPhoneNumberId(
  phoneNumberId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.phoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Resolve a conexão por WABA ID (eventos em nível WABA, ex. modelos). */
export async function getCredentialsByWabaId(
  wabaId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.wabaId, wabaId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/**
 * Resolve o número oficial "padrão" da organização: o mais antigo ainda
 * ativo. Correto sem ambiguidade quando só existe 1 número (caso comum);
 * com N números (v0.1), serve de fallback para fluxos que não amarram a
 * uma conversa específica (sync de templates, checagem de disponibilidade
 * do canal) — quem precisa do número certo de uma conversa usa
 * `conversation.metaCredentialId` via `getCredentialsById`.
 */
export async function getCredentialsByOrg(
  organizationId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(
      and(
        scoped(schema.metaCredentials.organizationId, organizationId),
        eq(schema.metaCredentials.isActive, true)
      )
    )
    .orderBy(asc(schema.metaCredentials.createdAt))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Todos os números oficiais da organização (v0.1: lista, não mais 1). */
export async function listCredentialsByOrg(
  organizationId: string
): Promise<Credentials[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .orderBy(asc(schema.metaCredentials.createdAt));
  return rows.map(toCredentials);
}

/** Resolve um número específico — usado para enviar pelo número amarrado
 * à conversa (`conversation.metaCredentialId`), escopado à organização. */
export async function getCredentialsById(
  id: string,
  organizationId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(
      and(
        eq(schema.metaCredentials.id, id),
        scoped(schema.metaCredentials.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Renomeia/edita descrição/ativa-desativa um número sem tocar no token. */
export async function updateCredentialsMeta(
  id: string,
  organizationId: string,
  patch: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    departmentId?: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.metaCredentials.id, id),
        scoped(schema.metaCredentials.organizationId, organizationId)
      )
    );
}

/** Remove um número. Conversas presas a ele voltam a `metaCredentialId =
 * null` (FK `ON DELETE SET NULL`) e caem no fallback de `getCredentialsByOrg`. */
export async function deleteCredentialsById(
  id: string,
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.metaCredentials)
    .where(
      and(
        eq(schema.metaCredentials.id, id),
        scoped(schema.metaCredentials.organizationId, organizationId)
      )
    );
}

/** Checagem leve (sem decifrar o token) se existe ao menos 1 número oficial
 * conectado — usado por gates que só precisam saber "tem canal oficial
 * disponível", não qual número específico (ex.: liberar Campanhas). */
export async function isOfficialChannelConnected(
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ status: schema.metaCredentials.status })
    .from(schema.metaCredentials)
    .where(
      and(
        scoped(schema.metaCredentials.organizationId, organizationId),
        eq(schema.metaCredentials.isActive, true),
        eq(schema.metaCredentials.status, "connected")
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Cria um número novo ou reconecta um já existente (mesmo `phoneNumberId`
 * = mesma linha). `name`/`description` só valem na criação — reconectar não
 * deve apagar o nome que o operador já deu ao número. */
export async function saveCredentials(input: {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  name?: string;
  description?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
}): Promise<{ id: string }> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const rows = await db
    .insert(schema.metaCredentials)
    .values({
      id: newId("credentials"),
      organizationId: input.organizationId,
      name: input.name?.trim() || "Principal",
      description: input.description ?? null,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      verifiedName: input.verifiedName ?? null,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      status: "connected",
    })
    .onConflictDoUpdate({
      // v0.1: várias linhas por organização são permitidas — o alvo de
      // conflito agora é o número (único na instância), não mais a org.
      target: [schema.metaCredentials.phoneNumberId],
      set: {
        wabaId: input.wabaId,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        verifiedName: input.verifiedName ?? null,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.metaCredentials.id });
  return { id: rows[0]!.id };
}

/** Marca UM número como vencido (token inválido detectado em runtime).
 * v0.1: por id, não mais por org inteira — senão um token vencido de um
 * número derrubava todos os outros números da mesma organização. */
export async function markReconnectRequired(
  credentialId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.metaCredentials.id, credentialId));
}

/** Últimos 4 caracteres do token para exibir na UI (jamais o token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}
