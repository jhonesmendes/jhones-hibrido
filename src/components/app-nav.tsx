"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  FlaskConical,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  LogOut,
  Megaphone,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ensurePushSubscription,
  ensureServiceWorker,
  getNotificationPermission,
} from "@/lib/notifications";
import { fetchGroupsInInbox } from "@/lib/inbox-preferences";
import { DepartmentSwitcher } from "@/components/department-switcher";
import { StatusSelector } from "@/components/status-selector";
import { QueueToast, type QueueAssignment } from "@/components/queue-toast";

const NAV = [
  { href: "/inbox", label: "Caixa de entrada", icon: Inbox, badge: true },
  { href: "/queue", label: "Fila", icon: ListOrdered },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/agent", label: "Agente", icon: Sparkles },
  // Configuração/análise de operação, não atendimento do dia a dia — fora
  // da tela do agente comum (ver mesma checagem no server, /lab/page.tsx).
  { href: "/lab", label: "Laboratório", icon: FlaskConical, hideFromAgent: true },
  { href: "/n8n-panel", label: "Painel N8N", icon: Workflow },
] as const;

const NAV_COLLAPSED_KEY = "vocero-nav-collapsed";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [queueAssignment, setQueueAssignment] = useState<QueueAssignment | null>(null);
  // Sidebar recolhível (desktop): começa false pra bater com o SSR (sem
  // acesso a localStorage) — o script anti-flash no layout raiz já cuida da
  // largura/labels certas antes da hidratação via atributo em <html>; isso
  // aqui só sincroniza o estado do React depois de montar, mesmo padrão do
  // ThemeToggle.
  const [navCollapsed, setNavCollapsed] = useState(false);
  // Preferência pessoal: se grupos estão fora da Caixa de Entrada, o badge
  // do menu também não deve contar as não lidas deles.
  const groupsInInboxRef = useRef(true);

  // Fecha o drawer ao trocar de rota (navegação por um link do menu).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number; contact: { kind: string } }[];
    };
    const relevant = groupsInInboxRef.current
      ? data.conversations
      : data.conversations.filter((c) => c.contact.kind !== "group");
    setUnread(relevant.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void fetchGroupsInInbox().then((v) => {
      groupsInInboxRef.current = v;
      void refetchUnread();
    });
    // Registra o SW sempre (habilita "Instalar app" no Chrome mesmo sem
    // notificações ativadas). Reforça a inscrição de push em qualquer tela
    // (não só na Caixa de entrada) sempre que a permissão já foi concedida
    // antes — cobre o caso de o navegador ter perdido a inscrição.
    void ensureServiceWorker();
    if (getNotificationPermission() === "granted") void ensurePushSubscription();

    try {
      setNavCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
    } catch {
      // localStorage indisponível (modo privado restrito etc.) — segue expandido.
    }
  }, []);

  function toggleNavCollapsed() {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // cortesia, não trava a UI se falhar
      }
      document.documentElement.toggleAttribute("data-nav-collapsed", next);
      return next;
    });
  }

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
    onQueueAssigned: (d) =>
      setQueueAssignment({
        queueId: d.queueId,
        conversationId: d.conversationId,
        contactId: d.contactId,
        contactName: d.contactName,
        timeoutAt: d.timeoutAt,
      }),
  });

  return (
    <>
      {/* Barra superior mobile: hambúrguer + marca. Some em md+ (a sidebar
          completa assume). */}
      <header className="flex items-center gap-2.5 border-b bg-subtle px-3 py-2.5 md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="rounded-sm p-1.5 text-text-2 hover:bg-accent"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-brand text-[13px] font-bold text-white"
          aria-hidden
        >
          {branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            branding.name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="truncate text-[15px] font-[650] leading-tight tracking-tight">
          {branding.name}
        </span>
        {unread > 0 && (
          <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-white">
            {unread}
          </span>
        )}
      </header>

      {/* Fundo do drawer mobile */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "app-nav-aside fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-subtle px-3 pb-3.5 pt-4 transition-[width,transform] duration-200",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:shrink-0 md:translate-x-0",
          navCollapsed ? "md:w-[52px] md:px-2" : "md:w-56"
        )}
      >
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Fechar menu"
          className="mb-2 self-end rounded-sm p-1.5 text-text-3 hover:bg-accent md:hidden"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        {/* Brand white-label — o ícone do cliente substitui a inicial; o
          crédito "Vocero CRM" embaixo fica sempre visível (exceto recolhida). */}
      <div className={cn("mb-4 flex items-center gap-2.5 px-2", navCollapsed && "md:justify-center md:px-0")}>
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
        <span className={cn("app-nav-label min-w-0", navCollapsed && "md:hidden")}>
          <span className="block truncate text-[16px] font-[650] leading-tight tracking-tight">
            {branding.name}
          </span>
          <span className="block text-[11px] text-text-3">Vocero CRM · WhatsApp</span>
        </span>
      </div>

      <div className={cn("app-nav-label", navCollapsed && "md:hidden")}>
        <DepartmentSwitcher role={role} />
      </div>

      {(role === "owner" || role === "admin") && (
        <Link
          href="/dashboard"
          title="Dashboard"
          className={cn(
            "mb-1 flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/dashboard")
              ? "bg-brand-tint font-semibold text-brand-text"
              : "text-text-2 hover:bg-accent",
            navCollapsed && "md:justify-center md:px-0"
          )}
        >
          <LayoutDashboard
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              pathname.startsWith("/dashboard") ? "text-brand" : "text-text-3"
            )}
            strokeWidth={1.7}
          />
          <span className={cn("app-nav-label", navCollapsed && "md:hidden")}>Dashboard</span>
        </Link>
      )}

      <nav className="flex flex-col gap-0.5">
        {NAV.filter((item) => !("hideFromAgent" in item && item.hideFromAgent && role === "agent")).map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-tint font-semibold text-brand-text"
                  : "text-text-2 hover:bg-accent",
                navCollapsed && "md:justify-center md:px-0"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand" : "text-text-3")}
                strokeWidth={1.7}
              />
              <span className={cn("app-nav-label flex-1", navCollapsed && "md:hidden")}>
                {item.label}
              </span>
              {"badge" in item && item.badge && unread > 0 && (
                <span
                  className={cn(
                    "app-nav-label flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold",
                    active ? "bg-brand text-white" : "bg-border-strong text-text-2",
                    navCollapsed && "md:hidden"
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

      <div className={cn("app-nav-label mb-1.5 px-0.5", navCollapsed && "md:hidden")}>
        <ThemeToggle />
      </div>

      {(role === "owner" || role === "admin") && (
        <Link
          href="/audit"
          title="Auditoria"
          className={cn(
            "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/audit")
              ? "bg-brand-tint font-semibold text-brand-text"
              : "text-text-2 hover:bg-accent",
            navCollapsed && "md:justify-center md:px-0"
          )}
        >
          <ListChecks
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              pathname.startsWith("/audit") ? "text-brand" : "text-text-3"
            )}
            strokeWidth={1.7}
          />
          <span className={cn("app-nav-label", navCollapsed && "md:hidden")}>Auditoria</span>
        </Link>
      )}

      <Link
        href="/documentacao"
        title="Documentação"
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/documentacao")
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent",
          navCollapsed && "md:justify-center md:px-0"
        )}
      >
        <BookOpen
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            pathname.startsWith("/documentacao") ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        <span className={cn("app-nav-label", navCollapsed && "md:hidden")}>Documentação</span>
      </Link>

      <Link
        href="/settings"
        title="Configurações"
        className={cn(
          "flex items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/settings")
            ? "bg-brand-tint font-semibold text-brand-text"
            : "text-text-2 hover:bg-accent",
          navCollapsed && "md:justify-center md:px-0"
        )}
      >
        <Settings
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            pathname.startsWith("/settings") ? "text-brand" : "text-text-3"
          )}
          strokeWidth={1.7}
        />
        <span className={cn("app-nav-label", navCollapsed && "md:hidden")}>Configurações</span>
      </Link>

      {/* Recolher/expandir (só desktop — no mobile o drawer já cobre isso). */}
      <button
        type="button"
        onClick={toggleNavCollapsed}
        aria-label={navCollapsed ? "Expandir menu" : "Recolher menu"}
        title={navCollapsed ? "Expandir menu" : "Recolher menu"}
        className={cn(
          "mt-1 hidden items-center gap-[11px] rounded-sm px-2.5 py-2 text-sm font-medium text-text-3 transition-colors hover:bg-accent hover:text-foreground md:flex",
          navCollapsed && "md:justify-center md:px-0"
        )}
      >
        {navCollapsed ? (
          <PanelLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
        ) : (
          <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
        )}
        <span className={cn("app-nav-label", navCollapsed && "md:hidden")}>Recolher menu</span>
      </button>

      <div
        className={cn(
          "mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent",
          navCollapsed && "md:flex-col md:justify-center md:gap-1.5 md:px-0 md:hover:bg-transparent"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
          {initials(userName)}
        </span>
        <span className={cn("app-nav-label min-w-0 flex-1", navCollapsed && "md:hidden")}>
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-3">
            <span className="shrink-0">{role === "owner" ? "Proprietário" : "Equipe"} ·</span>
            <StatusSelector />
          </span>
        </span>
        <button
          aria-label="Sair"
          title="Sair"
          className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
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

      {queueAssignment && (
        <QueueToast assignment={queueAssignment} onDismiss={() => setQueueAssignment(null)} />
      )}
    </>
  );
}
