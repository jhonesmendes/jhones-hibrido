"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Inbox, Kanban, ListOrdered, LogOut } from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { StatusSelector } from "@/components/status-selector";
import { QueueToast } from "@/components/queue-toast";
import { useNavSignals } from "@/components/use-nav-signals";

const TABS = [
  { href: "/inbox", label: "Caixa de entrada", icon: Inbox, badge: true },
  { href: "/queue", label: "Fila", icon: ListOrdered, badge: false },
  { href: "/pipeline", label: "Pipeline", icon: Kanban, badge: false },
] as const;

/**
 * Barra do modo embutido (spec 010) — substitui a barra lateral quando o
 * Vocero está dentro de um iframe (ex.: aba do painel do Sankhya). Só as
 * três telas de atendimento; o resto abre no Vocero em nova aba.
 */
export function EmbedNav({ branding, userName }: { branding: Branding; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unread, queueAssignment, dismissQueue } = useNavSignals();

  return (
    <>
      <header
        data-testid="embed-nav"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-subtle px-2 py-1.5"
      >
        <span
          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-brand text-[12px] font-bold text-white"
          title={branding.name}
          aria-hidden
        >
          {branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            branding.name.charAt(0).toUpperCase()
          )}
        </span>
        <nav className="flex items-center gap-0.5">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "bg-brand-tint font-semibold text-brand-text" : "text-text-2 hover:bg-accent"
                )}
              >
                <tab.icon
                  className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "text-text-3")}
                  strokeWidth={1.7}
                />
                {tab.label}
                {tab.badge && unread > 0 && (
                  <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <span className="hidden min-w-0 items-center gap-1 text-[12px] text-text-3 sm:flex">
          <span className="truncate font-medium text-text-2">{userName}</span>
          <span>·</span>
          <StatusSelector />
        </span>
        <a
          href={pathname}
          target="_blank"
          rel="noopener"
          title="Abrir no Vocero (nova aba)"
          aria-label="Abrir no Vocero"
          className="rounded p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.7} />
        </a>
        <button
          aria-label="Sair"
          title="Sair"
          className="rounded p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </header>

      {queueAssignment && <QueueToast assignment={queueAssignment} onDismiss={dismissQueue} />}
    </>
  );
}
