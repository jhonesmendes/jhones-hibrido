import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { sendText } from "@/server/inbox/send";
import { getMostRecentConversationForContact } from "@/server/inbox/queries";
import { isWindowOpen } from "@/server/inbox/window";
import { getDepartmentBusinessHours, isWithinBusinessHours } from "@/server/queue/business-hours";
import { countVariables, renderBody, sendTemplate, TemplateError } from "@/server/whatsapp/templates";
import {
  intervalToMs,
  isEligibleForExpiry,
  isEligibleForReminder,
  respondedAfterSend,
} from "@/server/pipeline/followup-eligibility";

/**
 * Ciclo de revisão do follow-up automático — roda no mesmo processo
 * (Constituição II), disparado por um `setInterval` a nível de módulo (ver
 * `startFollowupScheduler`). Percorre TODAS as organizações habilitadas;
 * uma falha pontual em um lead não interrompe o restante (FR-009).
 *
 * Duas rotas de lembrete, escolhidas pelo estado da janela de 24h (a Meta
 * recusa texto livre com a janela fechada — não é frescura do produto):
 * janela ABERTA manda `config.message` (texto livre); janela FECHADA (ex.:
 * modelo inicial nunca respondido) manda `config.templateId` (modelo
 * aprovado, com o nome do contato em {{1}} se o modelo tiver variável).
 */
export async function runFollowupCycle(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const configs = await db
    .select()
    .from(schema.pipelineFollowup)
    .where(eq(schema.pipelineFollowup.enabled, true));

  // Cache por departamento dentro do ciclo — evita reconsultar a mesma
  // config de horário pra cada lead. Departamento sem `business_hours`
  // configurado (ou lead sem departamento) nunca trava — mesmo default de
  // "sempre aberto" já usado na Fila (ver business-hours.ts).
  const businessHoursCache = new Map<
    string,
    { businessHours: unknown; timezone: string } | null
  >();
  async function isLeadWithinBusinessHours(departmentId: string | null): Promise<boolean> {
    if (!departmentId) return true;
    if (!businessHoursCache.has(departmentId)) {
      businessHoursCache.set(departmentId, await getDepartmentBusinessHours(departmentId));
    }
    const dept = businessHoursCache.get(departmentId) ?? null;
    return isWithinBusinessHours(dept?.businessHours, dept?.timezone ?? "America/Sao_Paulo", now);
  }

  for (const config of configs) {
    if (!config.triggerStageId) continue;
    if (!config.message && !config.templateId) continue;
    const intervalMs = intervalToMs(config.intervalValue, config.intervalUnit);

    // Modelo é o mesmo pra todo lead desta config — busca uma vez só, fora
    // do loop de leads, em vez de repetir a query por card.
    let template: typeof schema.template.$inferSelect | null = null;
    if (config.templateId) {
      const rows = await db
        .select()
        .from(schema.template)
        .where(eq(schema.template.id, config.templateId))
        .limit(1);
      template = rows[0] ?? null;
    }

    // Só `lead` aqui — um contato pode ter mais de uma conversa (uma por
    // canal, ver ConversationChannel em ingest.ts); resolver "a" conversa
    // pra mandar o lembrete é responsabilidade de dentro do loop (a mais
    // recentemente ativa), não de um JOIN aqui, que duplicaria o lead uma
    // vez por conversa e mandaria o mesmo lembrete várias vezes.
    const leads = await db
      .select()
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, config.organizationId),
          eq(schema.lead.stageId, config.triggerStageId)
        )
      );

    for (const lead of leads) {
      const lastSendRows = await db
        .select()
        .from(schema.followupSend)
        .where(eq(schema.followupSend.leadId, lead.id))
        .orderBy(desc(schema.followupSend.sentAt))
        .limit(1);
      let lastSend = lastSendRows[0] ?? null;

      // O cliente respondeu depois do último lembrete ativo: é resolvido
      // (deixa de contar) antes de avaliar a elegibilidade.
      if (lastSend && respondedAfterSend(lead, lastSend)) {
        await db
          .update(schema.followupSend)
          .set({ status: "cancelled", resolvedAt: now })
          .where(eq(schema.followupSend.id, lastSend.id));
        lastSend = null;
      }

      if (isEligibleForReminder(lead, lastSend, intervalMs, now)) {
        // Fora do horário de funcionamento do departamento do lead: não
        // manda agora nem registra tentativa — só adia (o próximo ciclo
        // reavalia do zero, então dispara assim que o expediente reabrir,
        // sem perder o lembrete nem duplicar quando finalmente enviar).
        if (!(await isLeadWithinBusinessHours(lead.departmentId))) continue;

        const conversation = await getMostRecentConversationForContact(
          config.organizationId,
          lead.contactId,
          lead.departmentId
        );
        if (!conversation) continue; // contato sem nenhuma conversa ainda — nada pra lembrar

        const windowOpen =
          conversation.channel === "unofficial" || isWindowOpen(conversation.lastInboundAt);

        // Janela aberta sem mensagem configurada, ou fechada sem modelo
        // configurado: nada pra mandar nesse estado — não força texto
        // livre com janela fechada (a Meta recusaria) nem deixa de
        // lembrar quem tem janela aberta só porque não achou o outro modo.
        if (windowOpen && !config.message) continue;
        if (!windowOpen && !template) continue;

        let sentMessage: string;
        try {
          if (windowOpen) {
            await sendText({
              conversationId: conversation.id,
              organizationId: config.organizationId,
              text: config.message!,
            });
            sentMessage = config.message!;
          } else {
            const contactRows = await db
              .select({ name: schema.contact.name })
              .from(schema.contact)
              .where(eq(schema.contact.id, lead.contactId))
              .limit(1);
            const contactName = contactRows[0]?.name ?? null;
            const variableCount = countVariables(template!.body);
            await sendTemplate({
              organizationId: config.organizationId,
              conversationId: conversation.id,
              templateId: template!.id,
              variables: variableCount > 0 && contactName ? [contactName] : undefined,
            });
            sentMessage = renderBody(
              template!.body,
              variableCount > 0 && contactName ? [contactName] : []
            );
          }
          await db.insert(schema.followupSend).values({
            id: newId("followupSend"),
            organizationId: config.organizationId,
            leadId: lead.id,
            conversationId: conversation.id,
            message: sentMessage,
            status: "sent",
            sentAt: now,
          });
        } catch (err) {
          await db.insert(schema.followupSend).values({
            id: newId("followupSend"),
            organizationId: config.organizationId,
            leadId: lead.id,
            conversationId: conversation.id,
            message: windowOpen ? (config.message ?? "") : (template?.name ?? ""),
            status: "failed",
            sentAt: now,
          });
          const label = err instanceof TemplateError ? err.message : err;
          console.error(`[followup] falha ao enviar lembrete para lead ${lead.id}:`, label);
        }
        continue;
      }

      if (
        config.expiredStageId &&
        isEligibleForExpiry(lastSend, intervalMs, now)
      ) {
        await db
          .update(schema.lead)
          .set({ stageId: config.expiredStageId, updatedAt: now })
          .where(eq(schema.lead.id, lead.id));
        await db
          .update(schema.followupSend)
          .set({ status: "expired", resolvedAt: now })
          .where(eq(schema.followupSend.id, lastSend!.id));
      }
    }
  }
}

const globalForFollowup = globalThis as unknown as {
  __voceroFollowupTimer?: ReturnType<typeof setInterval>;
};

/** Inicia o scheduler uma única vez por processo (o Next recarrega módulos em dev). */
export function startFollowupScheduler(): void {
  if (globalForFollowup.__voceroFollowupTimer) return;
  const intervalMs = getEnv().FOLLOWUP_SCHEDULER_INTERVAL_MS;
  globalForFollowup.__voceroFollowupTimer = setInterval(() => {
    void runFollowupCycle().catch((err) =>
      console.error("[followup] ciclo falhou:", err)
    );
  }, intervalMs);
}
