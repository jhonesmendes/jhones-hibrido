import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { runAgentTurn } from "@/server/ai/pipeline";
import { resolveAgentProfile } from "@/server/ai/agent-profile";
import { resolveAiConfig } from "@/server/ai/config";
import { renderKb } from "@/server/ai/prompts";
import { computeScore, judgeCase } from "@/server/lab/judge";

/**
 * Runner do Laboratório (FR-030/FR-034): execução em segundo plano DENTRO do
 * processo (sem fila externa), turnos sequenciais com debounce 0, timeout
 * global de 10 minutos, e lock de concorrência por índice parcial UNIQUE no
 * BD (máx. 1 execução `running` por organização).
 *
 * Sandbox (FR-031): as conversas são criadas com is_test=true; o pipeline
 * do agente persiste as respostas sem tocar a API, e o sender real lança
 * exceção se algo tentar enviá-las.
 *
 * As personas de teste são cadastradas pelo cliente (lab_persona, ver
 * server/lab/persona-generator.ts) — não existe mais um elenco genérico
 * fixo. `departmentId` escopa quais personas entram na rodada: "geral"
 * (sem departamento) + as do departamento testado, mesmo filtro usado na
 * knowledge base (ver server/ai/pipeline.ts).
 */

const RUN_TIMEOUT_MS = 10 * 60 * 1000;

export class RunConflictError extends Error {}
export class NoPersonasError extends Error {}

export async function startRun(
  organizationId: string,
  departmentId: string | null = null
): Promise<string> {
  const db = getDb();

  const allPersonas = await db
    .select()
    .from(schema.labPersona)
    .where(eq(schema.labPersona.organizationId, organizationId));
  const personas = allPersonas.filter(
    (p) => !p.departmentId || p.departmentId === departmentId
  );
  if (personas.length === 0) {
    throw new NoPersonasError(
      "Nenhuma persona cadastrada para este escopo — cadastre em Laboratório → Personas"
    );
  }

  let runId: string;
  try {
    const inserted = await db
      .insert(schema.agentTestRun)
      .values({ id: newId("testRun"), organizationId, departmentId, status: "running" })
      .returning();
    runId = inserted[0]!.id;
  } catch (err) {
    // Violação do índice parcial UNIQUE → já há uma execução ativa.
    if (isUniqueViolation(err)) {
      throw new RunConflictError("Já há uma rodada em andamento");
    }
    throw err;
  }

  await db.insert(schema.agentTestCase).values(
    personas.map((p) => ({
      id: newId("testCase"),
      organizationId,
      runId,
      persona: p.name,
      // Congela o roteiro USADO nesta rodada — sobrevive a uma edição ou
      // exclusão posterior da persona original.
      script: p.script,
      status: "pending" as const,
    }))
  );

  // Fire-and-forget in-process: o POST já retorna; o progresso vai por SSE.
  void executeRun(runId, organizationId, departmentId, personas.length).catch(async (err) => {
    console.error("[lab] execução falhou:", err);
    await failRun(runId, organizationId, String(err), personas.length);
  });

  return runId;
}

async function executeRun(
  runId: string,
  organizationId: string,
  departmentId: string | null,
  total: number
): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("tempo limite de 10 minutos excedido")),
      RUN_TIMEOUT_MS
    )
  );
  try {
    await Promise.race([runAllCases(runId, organizationId, departmentId), timeout]);
  } catch (err) {
    await failRun(runId, organizationId, String(err), total);
  }
}

async function runAllCases(
  runId: string,
  organizationId: string,
  departmentId: string | null
): Promise<void> {
  const db = getDb();
  const cases = await db
    .select()
    .from(schema.agentTestCase)
    .where(eq(schema.agentTestCase.runId, runId))
    .orderBy(asc(schema.agentTestCase.createdAt));

  const aiConfig = await resolveAiConfig(organizationId);
  if (!aiConfig) throw new Error("Sem provedor de IA configurado");

  // Mesmo recorte que uma conversa real deste departamento usaria (ver
  // filtro equivalente em server/ai/pipeline.ts): entrada "geral" +
  // entradas do departamento testado. O agente REAL (chamado dentro de
  // runConversation) já aplica esse filtro sozinho porque a conversa
  // sintética é criada com esse mesmo departamento — isto aqui é só a
  // cópia que o JUIZ usa pra saber o que era "correto" alegar.
  const allKbEntries = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId));
  const kbEntries = allKbEntries.filter(
    (e) => !e.departmentId || e.departmentId === departmentId
  );
  const kbText = renderKb(kbEntries);

  // Texto descritivo pro juiz: o mesmo perfil que `runAgentTurn` vai
  // resolver pras conversas de teste desta rodada — com departamento,
  // resolve o perfil PADRÃO DESSE departamento (mesma cadeia de uma
  // conversa real); sem departamento, cai no perfil mais antigo ativo da
  // org (comportamento de antes da v0.1, quando só existia 1 perfil).
  const profile = await resolveAgentProfile(
    organizationId,
    { agentProfileId: null, assignedTo: null, departmentId },
    { includeDisabled: true }
  );
  const behaviorText = profile
    ? [
        `Nome: ${profile.name}`,
        profile.tone ? `Tom: ${profile.tone}` : null,
        profile.instructions ? `Instruções: ${profile.instructions}` : null,
        profile.escalationRules ? `Escalonamento: ${profile.escalationRules}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  let done = 0;
  const total = cases.length;
  publishProgress(organizationId, runId, "running", done, total);

  for (const testCase of cases) {
    const script = (testCase.script as string[] | null) ?? [];
    if (script.length === 0) continue;

    await db
      .update(schema.agentTestCase)
      .set({ status: "running" })
      .where(eq(schema.agentTestCase.id, testCase.id));

    const { transcript, conversationId } = await runConversation(
      organizationId,
      testCase.id,
      testCase.persona,
      script,
      departmentId
    );

    const outcome = await judgeCase({
      personaKey: testCase.persona,
      transcript,
      kbText,
      behaviorText,
      aiConfig,
    });

    await db
      .update(schema.agentTestCase)
      .set({
        conversationId,
        transcript,
        status: outcome.status,
        veredicto: outcome.status === "done" ? outcome.verdict.veredicto : null,
        hallazgos: outcome.status === "done" ? outcome.verdict.hallazgos : null,
      })
      .where(eq(schema.agentTestCase.id, testCase.id));

    done += 1;
    publishProgress(organizationId, runId, "running", done, total);
  }

  const finalCases = await db
    .select({
      status: schema.agentTestCase.status,
      veredicto: schema.agentTestCase.veredicto,
    })
    .from(schema.agentTestCase)
    .where(eq(schema.agentTestCase.runId, runId));
  const score = computeScore(finalCases);

  await getDb()
    .update(schema.agentTestRun)
    .set({ status: "done", score, finishedAt: new Date() })
    .where(eq(schema.agentTestRun.id, runId));
  publishProgress(organizationId, runId, "done", done, total, score);
}

/** Conversa o roteiro completo com o agente real; corta no primeiro handoff. */
async function runConversation(
  organizationId: string,
  testCaseId: string,
  personaName: string,
  script: string[],
  departmentId: string | null
): Promise<{
  transcript: { role: "cliente" | "agente"; text: string }[];
  conversationId: string;
}> {
  const db = getDb();

  // Contato sintético ARQUIVADO (não aparece na lista nem gera leads) — o
  // telefone é derivado do próprio id do caso de teste, então cada rodada
  // usa um contato novo (evita colidir/reaproveitar histórico entre
  // personas diferentes ou rodadas antigas).
  const contactId = await upsertTestContact(organizationId, testCaseId, personaName);

  // Departamento da conversa sintética = o testado nesta rodada — é isso
  // que faz o agente REAL (chamado logo abaixo) resolver sozinho o MESMO
  // perfil e o MESMO recorte de KB que uma conversa real desse
  // departamento usaria (resolveAgentProfile + filtro em ai/pipeline.ts),
  // sem precisar duplicar essa lógica aqui.
  const convId = newId("conversation");
  await db.insert(schema.conversation).values({
    id: convId,
    organizationId,
    departmentId,
    contactId,
    isTest: true,
    aiEnabled: true,
  });

  for (const line of script) {
    const now = new Date();
    await db.insert(schema.message).values({
      id: newId("message"),
      organizationId,
      conversationId: convId,
      direction: "in",
      type: "text",
      text: line,
      status: "delivered",
      waTimestamp: now,
    });
    await db
      .update(schema.conversation)
      .set({ lastInboundAt: now, lastMessageAt: now, updatedAt: now })
      .where(eq(schema.conversation.id, convId));

    // Turno REAL do agente, sequencial e sem debounce (FR-030).
    await runAgentTurn(convId);

    const convRows = await db
      .select({ handoffAt: schema.conversation.handoffAt })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, convId))
      .limit(1);
    if (convRows[0]?.handoffAt) break; // primeiro handoff → fim do roteiro
  }

  const messages = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, convId))
    .orderBy(asc(schema.message.createdAt));

  return {
    conversationId: convId,
    transcript: messages
      .filter((m) => m.text)
      .map((m) => ({
        role: m.direction === "in" ? ("cliente" as const) : ("agente" as const),
        text: m.text!,
      })),
  };
}

/** Telefone sintético estável derivado do id do caso de teste — jamais um
 * número real; só precisa ser único o bastante pra não colidir dentro da
 * mesma organização. */
function syntheticPhoneFor(testCaseId: string): string {
  let sum = 0;
  for (const ch of testCaseId) sum = (sum * 31 + ch.charCodeAt(0)) % 10_000_000_000;
  return `555${String(sum).padStart(10, "0")}`;
}

async function upsertTestContact(
  organizationId: string,
  testCaseId: string,
  personaName: string
): Promise<string> {
  const db = getDb();
  const phone = syntheticPhoneFor(testCaseId);
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      phone,
      name: `[Teste] ${personaName}`,
      archivedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (inserted[0]) return inserted[0].id;
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.phone, phone)
      )
    )
    .limit(1);
  return rows[0]!.id;
}

async function failRun(
  runId: string,
  organizationId: string,
  error: string,
  total: number
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.agentTestRun)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(schema.agentTestRun.id, runId));
  publishProgress(organizationId, runId, "failed", 0, total);
}

function publishProgress(
  organizationId: string,
  runId: string,
  status: string,
  done: number,
  total: number,
  score?: number | null
): void {
  publish(organizationId, {
    type: "lab.run",
    data: { runId, status, progress: { done, total }, score },
  });
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}
