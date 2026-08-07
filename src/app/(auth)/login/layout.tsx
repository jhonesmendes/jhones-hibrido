import { MessageCircle, Sparkles, Workflow } from "lucide-react";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Inbox unificado do WhatsApp",
    desc: "Todas as conversas da equipe em um só lugar, com fila e distribuição automática.",
  },
  {
    icon: Sparkles,
    title: "Agente de IA embutido",
    desc: "Respostas rápidas e ações automáticas treinadas no seu Laboratório de autoavaliação.",
  },
  {
    icon: Workflow,
    title: "Pipeline e campanhas",
    desc: "Acompanhe leads e dispare campanhas sem sair do painel.",
  },
];

export default async function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen bg-subtle">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#0b1220] p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, var(--accent) 0%, transparent 45%), radial-gradient(circle at 80% 80%, var(--accent) 0%, transparent 40%)",
          }}
        />
        <div className="relative flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-brand text-base font-bold text-white">
            {branding.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              branding.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="text-lg font-semibold">{branding.name}</span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Bem-vindo à sua central de atendimento
            </h1>
            <p className="max-w-md text-sm text-white/70">
              Entre para continuar atendendo seus clientes no WhatsApp com sua
              equipe, em tempo real.
            </p>
          </div>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-[var(--accent)]">
                  <f.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-sm text-white/60">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          © {year} {branding.name}. Todos os direitos reservados.
        </p>
      </div>

      <div className="flex w-full items-center justify-center p-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-brand text-lg font-bold text-white">
              {branding.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                branding.name.charAt(0).toUpperCase()
              )}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{branding.name}</h1>
              <p className="text-sm text-text-3">CRM de WhatsApp com agente de IA</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
