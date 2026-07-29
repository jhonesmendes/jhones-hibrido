import Link from "next/link";
import { HelpCircle } from "lucide-react";
import type { DocSection } from "@/lib/docs/content";

/**
 * Ícone "?" que leva direto pra seção correspondente em /documentacao —
 * atalho contextual sem duplicar o conteúdo (só a Documentação central tem).
 */
export function HelpLink({ slug, label }: { slug: DocSection["slug"] | string; label?: string }) {
  return (
    <Link
      href={`/documentacao#${slug}`}
      title={label ?? "Como usar esta tela"}
      aria-label={label ?? "Como usar esta tela"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.7} />
    </Link>
  );
}
