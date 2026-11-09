import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de multi-tenancy (Constituição III, spec 009 · US6).
 *
 * Toda query `.from/.update/.delete(schema.X)` numa tabela com
 * `organization_id` precisa filtrar a organização — por `scoped(...)` ou por
 * `X.organizationId` no WHERE. As exceções abaixo são justificadas por
 * categoria e CONTADAS: uma query nova sem escopo, ou uma exceção que deixou
 * de existir, faz este teste falhar. Ao corrigir/remover uma query, atualize
 * a contagem; ao precisar de uma exceção nova, justifique-a aqui.
 */
const R = {
  JOB: "job da instância: percorre todas as organizações ou continua trabalho já disparado por uma",
  ENTRY: "entrada externa: a organização é descoberta por chave única (hash de token, número, e-mail)",
  LOADED: "id de linha já carregada com escopo de organização no mesmo fluxo",
  SESSION: "linha do próprio membro da sessão (session.memberId)",
  DEV: "mock de desenvolvimento (404 em produção)",
} as const;

const ALLOWED: Record<string, [number, string]> = {
  "src/app/api/conversations/route.ts:from:department": [1, R.LOADED],
  "src/app/api/dev/wa-mock/status/route.ts:from:message": [1, R.DEV],
  "src/app/api/lab/runs/[id]/route.ts:from:agentTestCase": [1, R.LOADED],
  "src/app/api/lab/runs/[id]/route.ts:from:department": [1, R.LOADED],
  "src/app/api/media/[id]/route.ts:from:messageMedia": [1, R.LOADED],
  "src/app/api/settings/active-department/route.ts:update:member": [1, R.SESSION],
  "src/app/api/settings/appearance/route.ts:from:member": [1, R.SESSION],
  "src/app/api/settings/appearance/route.ts:update:member": [1, R.SESSION],
  "src/app/api/settings/inbox-preferences/route.ts:from:member": [1, R.SESSION],
  "src/app/api/settings/inbox-preferences/route.ts:update:member": [1, R.SESSION],
  "src/app/api/settings/smtp/route.ts:from:member": [1, R.SESSION],
  "src/app/api/settings/smtp/route.ts:update:smtpConfig": [1, R.LOADED],
  "src/instrumentation-node.ts:update:agentTestRun": [1, R.JOB],
  "src/server/ai/agent-profile.ts:from:department": [1, R.LOADED],
  "src/server/ai/agent-profile.ts:from:member": [1, R.LOADED],
  "src/server/ai/config.ts:update:aiConfig": [1, R.LOADED],
  "src/server/ai/pipeline.ts:from:conversation": [1, R.JOB],
  "src/server/ai/pipeline.ts:from:message": [1, R.JOB],
  "src/server/ai/pipeline.ts:update:contact": [1, R.LOADED],
  "src/server/auth/invite-tokens.ts:from:inviteToken": [2, R.ENTRY],
  "src/server/auth/invite-tokens.ts:update:inviteToken": [1, R.ENTRY],
  "src/server/auth/invite-tokens.ts:update:member": [1, R.ENTRY],
  "src/server/auth/member-management.ts:delete:inviteToken": [1, R.LOADED],
  "src/server/auth/member-management.ts:update:inviteToken": [1, R.LOADED],
  "src/server/auth/member-management.ts:update:member": [1, R.LOADED],
  "src/server/auth/on-signup.ts:from:member": [1, R.ENTRY],
  "src/server/auth/password-reset.ts:from:member": [2, R.ENTRY],
  "src/server/baileys/auth-state.ts:from:unofficialChannel": [2, R.JOB],
  "src/server/baileys/auth-state.ts:update:unofficialChannel": [2, R.JOB],
  "src/server/baileys/avatar.ts:update:contact": [3, R.LOADED],
  "src/server/baileys/manager.ts:from:unofficialChannel": [2, R.JOB],
  "src/server/baileys/manager.ts:update:unofficialChannel": [1, R.JOB],
  "src/server/branding.ts:from:member": [1, R.SESSION],
  "src/server/campaigns/create.ts:from:campaign": [1, R.LOADED],
  "src/server/campaigns/create.ts:from:contact": [1, R.LOADED],
  "src/server/campaigns/queries.ts:from:campaignRecipient": [1, R.LOADED],
  "src/server/campaigns/scheduler.ts:from:campaign": [1, R.JOB],
  "src/server/campaigns/send.ts:delete:campaign": [1, R.JOB],
  "src/server/campaigns/send.ts:from:campaignRecipient": [1, R.JOB],
  "src/server/campaigns/send.ts:from:template": [2, R.JOB],
  "src/server/campaigns/send.ts:update:campaign": [5, R.JOB],
  "src/server/campaigns/send.ts:update:campaignRecipient": [2, R.JOB],
  "src/server/contacts.ts:update:contact": [1, R.LOADED],
  "src/server/inbox/ingest.ts:from:metaCredentials": [1, R.ENTRY],
  "src/server/inbox/ingest.ts:from:unofficialChannel": [1, R.ENTRY],
  "src/server/inbox/ingest.ts:update:contact": [2, R.LOADED],
  "src/server/inbox/ingest.ts:update:conversation": [2, R.LOADED],
  "src/server/inbox/lead-activity.ts:update:lead": [2, R.LOADED],
  "src/server/inbox/media-recovery.ts:delete:messageMediaPending": [1, R.JOB],
  "src/server/inbox/media-recovery.ts:from:message": [1, R.JOB],
  "src/server/inbox/media-recovery.ts:from:messageMediaPending": [2, R.JOB],
  "src/server/inbox/media-recovery.ts:update:messageMediaPending": [1, R.JOB],
  "src/server/inbox/queries.ts:from:member": [1, R.LOADED],
  "src/server/inbox/send.ts:update:conversation": [4, R.LOADED],
  "src/server/inbox/status.ts:update:message": [1, R.LOADED],
  "src/server/integrations/api-keys.ts:from:apiKey": [1, R.ENTRY],
  "src/server/integrations/api-keys.ts:update:apiKey": [1, R.ENTRY],
  "src/server/lab/runner.ts:from:agentTestCase": [2, R.JOB],
  "src/server/lab/runner.ts:from:conversation": [1, R.JOB],
  "src/server/lab/runner.ts:from:message": [1, R.JOB],
  "src/server/lab/runner.ts:update:agentTestCase": [2, R.JOB],
  "src/server/lab/runner.ts:update:agentTestRun": [2, R.JOB],
  "src/server/lab/runner.ts:update:conversation": [1, R.JOB],
  "src/server/media/maintenance.ts:from:mediaConfig": [1, R.JOB],
  "src/server/media/maintenance.ts:from:messageMedia": [1, R.JOB],
  "src/server/n8n/config.ts:update:n8nConfig": [1, R.LOADED],
  "src/server/n8n/inbound-events.ts:delete:n8nInboundEvent": [1, R.JOB],
  "src/server/n8n/inbound-events.ts:from:n8nInboundEvent": [1, R.JOB],
  "src/server/n8n/inbound-events.ts:update:n8nInboundEvent": [1, R.JOB],
  "src/server/pipeline/followup-document.ts:update:followupSend": [1, R.LOADED],
  "src/server/pipeline/followup-document.ts:update:lead": [1, R.LOADED],
  "src/server/pipeline/followup-scheduler.ts:from:contact": [1, R.JOB],
  "src/server/pipeline/followup-scheduler.ts:from:followupSend": [2, R.JOB],
  "src/server/pipeline/followup-scheduler.ts:from:pipelineFollowup": [1, R.JOB],
  "src/server/pipeline/followup-scheduler.ts:from:template": [1, R.JOB],
  "src/server/pipeline/followup-scheduler.ts:update:followupSend": [2, R.JOB],
  "src/server/pipeline/followup-scheduler.ts:update:lead": [2, R.JOB],
  "src/server/pipeline/followup.ts:from:template": [1, R.LOADED],
  "src/server/pipeline/followup.ts:update:pipelineFollowup": [1, R.LOADED],
  "src/server/push/send.ts:delete:pushSubscription": [2, R.JOB],
  "src/server/push/send.ts:from:pushSubscription": [1, R.JOB],
  "src/server/queue/business-hours.ts:from:department": [1, R.JOB],
  "src/server/queue/critical-alert.ts:from:department": [1, R.JOB],
  "src/server/queue/manager.ts:from:conversation": [2, R.JOB],
  "src/server/queue/manager.ts:from:department": [1, R.JOB],
  "src/server/queue/manager.ts:update:conversation": [2, R.JOB],
  "src/server/seed/demo.ts:delete:contact": [1, R.LOADED],
  "src/server/seed/demo.ts:delete:conversation": [1, R.LOADED],
  "src/server/seed/demo.ts:delete:lead": [1, R.LOADED],
  "src/server/seed/demo.ts:delete:message": [1, R.LOADED],
  "src/server/seed/demo.ts:from:conversation": [1, R.LOADED],
  "src/server/settings/unofficial-channels.ts:from:unofficialChannel": [1, R.LOADED],
  "src/server/whatsapp/credentials.ts:from:metaCredentials": [2, R.ENTRY],
  "src/server/whatsapp/credentials.ts:update:metaCredentials": [1, R.ENTRY],
  "src/server/whatsapp/templates.ts:delete:template": [1, R.LOADED],
  "src/server/whatsapp/templates.ts:update:conversation": [1, R.LOADED],
  "src/server/whatsapp/templates.ts:update:template": [2, R.LOADED],
};

const ROOT = join(import.meta.dirname, "..", "..");

function tenantTables(): Set<string> {
  const src = readFileSync(join(ROOT, "src/lib/db/schema.ts"), "utf8");
  const found = new Set<string>();
  const re = /export const (\w+) = pgTable\(\s*"\w+",\s*\{/g;
  for (const m of src.matchAll(re)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 1;
    const start = i;
    while (depth > 0 && i < src.length) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    if (/\borganizationId\s*:/.test(src.slice(start, i))) found.add(m[1]!);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

function unscopedQueries(): Map<string, number> {
  const tables = tenantTables();
  const counts = new Map<string, number>();
  const re = /\.(from|update|delete)\(\s*schema\.(\w+)\s*\)/g;
  for (const file of sourceFiles("src")) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const m of text.matchAll(re)) {
      if (!tables.has(m[2]!)) continue;
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1500);
      const end = after.indexOf(";");
      const stmt = end >= 0 ? after.slice(0, end) : after;
      if (stmt.includes("scoped(") || /\.organizationId\b/.test(stmt)) continue;
      const key = `${file}:${m[1]}:${m[2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

describe("isolamento por organização", () => {
  const actual = unscopedQueries();

  it("encontra as tabelas de domínio no schema", () => {
    expect(tenantTables().size).toBeGreaterThan(20);
    expect(tenantTables().has("conversation")).toBe(true);
  });

  it("nenhuma query nova sem escopo de organização", () => {
    const novas = [...actual.entries()]
      .filter(([key, n]) => n > (ALLOWED[key]?.[0] ?? 0))
      .map(([key, n]) => `${key} (${n}x, permitido ${ALLOWED[key]?.[0] ?? 0}) — use scoped() ou justifique em ALLOWED`);
    expect(novas).toEqual([]);
  });

  it("a lista de exceções não tem entradas que sobraram", () => {
    const sobras = Object.entries(ALLOWED)
      .filter(([key, [n]]) => (actual.get(key) ?? 0) < n)
      .map(([key, [n]]) => `${key}: permitido ${n}, existe ${actual.get(key) ?? 0} — reduza a contagem`);
    expect(sobras).toEqual([]);
  });
});
