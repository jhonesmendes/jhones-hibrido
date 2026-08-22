import { CheckCircle2, XCircle } from "lucide-react";
import { getEnv } from "@/lib/env";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export const dynamic = "force-dynamic";

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#141826] py-2.5 text-sm last:border-0">
      <div>
        <p className="text-[#c0c8e8]">{label}</p>
        {hint && <p className="text-xs text-[#4a5070]">{hint}</p>}
      </div>
      {ok ? (
        <span className="flex items-center gap-1.5 text-xs text-[#4ecb8d]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Configurado
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-[#4a5070]">
          <XCircle className="h-3.5 w-3.5" /> Não configurado
        </span>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const env = getEnv();

  return (
    <>
      <AdminTopbar title="Configurações" subtitle="Variáveis de ambiente que controlam este painel" />
      <div className="space-y-4 p-5">
        <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#3a4060]">
            Acesso do operador
          </p>
          <StatusRow
            label="ADMIN_OPERATOR_EMAIL / ADMIN_OPERATOR_PASSWORD"
            ok={Boolean(env.ADMIN_OPERATOR_EMAIL && env.ADMIN_OPERATOR_PASSWORD)}
            hint="Credencial única do operador — sem isso ninguém consegue logar em /admin/login."
          />
          <StatusRow
            label="ADMIN_SESSION_SECRET"
            ok={Boolean(env.ADMIN_SESSION_SECRET)}
            hint="Assina o cookie de sessão do painel (12h de validade)."
          />
          <StatusRow
            label="ADMIN_PANEL_HOST"
            ok={Boolean(env.ADMIN_PANEL_HOST)}
            hint="Domínio que ativa o modo painel central nesta imagem (ex.: admin.vocero.com.br)."
          />
        </div>

        <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#3a4060]">
            Relatório diário por e-mail
          </p>
          <StatusRow
            label="ADMIN_REPORT_EMAIL"
            ok={Boolean(env.ADMIN_REPORT_EMAIL)}
            hint="Sem isso o relatório diário de licenças (trials expirando etc.) fica desativado."
          />
          <StatusRow
            label="ADMIN_SMTP_HOST / ADMIN_SMTP_USER / ADMIN_SMTP_PASSWORD"
            ok={Boolean(env.ADMIN_SMTP_HOST && env.ADMIN_SMTP_USER && env.ADMIN_SMTP_PASSWORD)}
          />
        </div>

        <div className="rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#3a4060]">
            Segredo por cliente
          </p>
          <p className="text-sm text-[#8890b0]">
            <code className="rounded bg-black/30 px-1 text-xs">LICENSE_CONTROL_SECRET</code> não é global — é
            gerado individualmente ao registrar cada cliente (botão &ldquo;Registrar cliente&rdquo; em
            Instâncias) e colado na env dessa instância. Não há nada pra configurar aqui.
          </p>
        </div>
      </div>
    </>
  );
}
