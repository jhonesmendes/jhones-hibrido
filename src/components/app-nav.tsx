"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  FlaskConical,
  Inbox,
  Kanban,
  ListChecks,
  LogOut,
  Megaphone,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensurePushSubscription, getNotificationPermission } from "@/lib/notifications";

const NAV = [
  { href: "/inbox", label: "Caixa de entrada", icon: Inbox, badge: true },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/agent", label: "Agente", icon: Sparkles },
  { href: "/lab", label: "Laboratório", icon: FlaskConical },
  { href: "/n8n-panel", label: "Painel N8N", icon: Workflow },
] as const;

export function AppNav({
  branding,
  userName,
  role,
}: {
  branding: Branding;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
    // Reforça a inscrição de push em qualquer tela (não só na Caixa de
    // entrada) sempre que a permissão já foi concedida antes — cobre o
    // caso de o navegador ter perdido a inscrição (ex.: SW atualizado).
    if (getNotificationPermission() === "granted") void ensurePushSubscription();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-subtle px-3 pb-3.5 pt-4">
      {/* Brand white-label — o ícone do cliente substitui a inicial; o
          crédito "Vocero CRM" embaixo fica sempre visível. */}
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-brand text-[15px] font-bold text-white"
          aria-hidden
        >
          {branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            branding.name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-[650] leading-tight tracking-tight">
            {branding.name}
          </span>
          <span className="block text-[11px] text-text-3">Vocero CRM · WhatsApp</span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-tint font-semibold text-brand-text"
                  : "text-text-2 hover:bg-accent"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-text-3")}
                strokeWidth={1.7}
              />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && unread > 0 && (
                <span
                  className={cn(
                    "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold",
                    active ? "bg-brand text-white" : "bg-border-strong text-text-2"
                  )}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="mb-1.5 px-0.5">
        <ThemeToggle />
      </div>

      {(role === "owner" || role === "admin") && (
        <Link
          href="/audit"
          className={cn(
            "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/audit")
              ? "bg-brand-tint font-semibold text-brand-text"
              : "text-text-2 hover:bg-accent"
          )}
        >
          <ListChecks
            className={cn(
              "h-[18px] w-[18px]",
              pathname.startsWith("/audit") ? "text-brand" : "text-text-3"
            )}
            strokeWidth={1.7}
          />
          Auditoria
        </Link>
      )}

      <Link
        href="/documentacao"
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/documentacao")
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent"
        )}
      >
        <BookOpen
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith("/documentacao") ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        Documentação
      </Link>

      <Link
        href="/settings"
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/settings")
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent"
        )}
      >
        <Settings
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith("/settings") ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        Configurações
      </Link>

      <div className="mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block text-[11px] text-text-3">
            {role === "owner" ? "Proprietário" : "Equipe"} · Online
          </span>
        </span>
        <button
          aria-label="Sair"
          title="Sair"
          className="rounded p-1 text-text-3 hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}
