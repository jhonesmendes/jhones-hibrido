import { getEnv } from "@/lib/env";
import { listAdminClients } from "@/server/admin/client-registry";
import { fetchRemoteLicense } from "@/server/admin/remote-license";
import { sendAdminMail } from "@/server/admin/mail";

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function buildAndSendLicenseReport(): Promise<void> {
  const env = getEnv();
  if (!env.ADMIN_REPORT_EMAIL) return;

  const clients = await listAdminClients();
  const rows = await Promise.all(
    clients.map(async (c) => {
      try {
        const { license, usage } = await fetchRemoteLicense(c);
        return { name: c.name, reachable: true, license, usage };
      } catch {
        return { name: c.name, reachable: false, license: null, usage: null };
      }
    })
  );

  const total = rows.length;
  const active = rows.filter((r) => r.license?.status === "active").length;
  const trial = rows.filter((r) => r.license?.type === "trial").length;
  const expiringSoon = rows.filter(
    (r) => r.license?.trialEndsAt && daysUntil(r.license.trialEndsAt) <= 3 && daysUntil(r.license.trialEndsAt) >= 0
  );

  const tableRows = rows
    .map((r) => {
      const plan = r.license ? PLAN_LABEL[r.license.type] ?? r.license.type : "—";
      const agents = r.usage && r.license ? `${r.usage.maxAgents} / ${r.license.maxAgents + r.license.addonAgents}` : "—";
      const status = !r.reachable ? "inacessível" : (r.license?.status ?? "—");
      const isExpiring =
        r.license?.trialEndsAt && daysUntil(r.license.trialEndsAt) <= 3 && daysUntil(r.license.trialEndsAt) >= 0;
      return `<tr style="${isExpiring ? "background:#fef2f2;color:#991b1b" : ""}">
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${plan}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${agents}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${status}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:640px">
      <h2>Relatório diário — licenças Vocero</h2>
      <p>
        <strong>${total}</strong> instância(s) · <strong>${active}</strong> ativa(s) ·
        <strong>${trial}</strong> em trial ·
        <strong style="color:${expiringSoon.length > 0 ? "#dc2626" : "inherit"}">${expiringSoon.length}</strong>
        expirando em ≤3 dias
      </p>
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr style="text-align:left;background:#f8f8f8">
            <th style="padding:6px 10px">Cliente</th>
            <th style="padding:6px 10px">Plano</th>
            <th style="padding:6px 10px">Agentes</th>
            <th style="padding:6px 10px">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  await sendAdminMail({
    to: env.ADMIN_REPORT_EMAIL,
    subject: `Vocero — relatório diário de licenças (${total} instâncias, ${expiringSoon.length} expirando)`,
    text: `${total} instâncias, ${active} ativas, ${trial} em trial, ${expiringSoon.length} expirando em até 3 dias.`,
    html,
  });
}

const globalForReport = globalThis as unknown as {
  __voceroLicenseReportTimer?: ReturnType<typeof setTimeout>;
};

function msUntilNext8hBRT(): number {
  const next = new Date();
  next.setUTCHours(11, 0, 0, 0); // 8h BRT = 11h UTC
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - Date.now();
}

export function scheduleLicenseReport(): void {
  if (globalForReport.__voceroLicenseReportTimer) return;
  const fire = () => {
    void buildAndSendLicenseReport().catch((err) =>
      console.error("[admin] falha ao enviar relatório de licenças:", err)
    );
    globalForReport.__voceroLicenseReportTimer = setTimeout(fire, 24 * 60 * 60 * 1000);
  };
  globalForReport.__voceroLicenseReportTimer = setTimeout(fire, msUntilNext8hBRT());
}
