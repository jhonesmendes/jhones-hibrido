"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/channels", label: "Canais" },
  { href: "/settings/departments", label: "Departamentos" },
  { href: "/settings/ai", label: "Inteligência IA" },
  { href: "/settings/branding", label: "Marca" },
  { href: "/settings/templates", label: "Modelos" },
  { href: "/settings/team", label: "Equipe" },
  { href: "/settings/email", label: "Email" },
  { href: "/settings/preferences", label: "Preferências" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-44 md:flex-col md:space-y-1 md:overflow-visible md:border-b-0 md:border-r md:p-3">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith(t.href)
              ? "bg-brand-tint text-brand-text"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
