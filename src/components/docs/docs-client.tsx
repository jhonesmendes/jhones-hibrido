"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { DOC_SECTIONS } from "@/lib/docs/content";
import { cn } from "@/lib/utils";

export function DocsClient() {
  const [active, setActive] = useState(DOC_SECTIONS[0]?.slug ?? "");

  // Segue o hash da URL (ex.: /documentacao#campanhas) — scroll + destaque no nav.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setActive(hash);
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    }
  }, []);

  useEffect(() => {
    const sections = DOC_SECTIONS.map((s) => document.getElementById(s.slug)).filter(
      (el): el is HTMLElement => el !== null
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" }
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      <nav className="w-56 shrink-0 space-y-0.5 overflow-y-auto border-r p-3">
        {DOC_SECTIONS.map((s) => (
          <a
            key={s.slug}
            href={`#${s.slug}`}
            className={cn(
              "block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              active === s.slug
                ? "bg-brand-tint text-brand-text"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-10">
          <div>
            <h2 className="text-lg font-semibold">Documentação</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Como usar cada tela e o que cada configuração faz — pra nunca
              ficar na dúvida do que preencher.
            </p>
          </div>

          {DOC_SECTIONS.map((s) => (
            <section key={s.slug} id={s.slug} className="scroll-mt-4">
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
              <div className="mt-3 space-y-3">
                {s.blocks.map((b, i) => {
                  if (b.type === "p") {
                    return (
                      <p key={i} className="text-sm leading-relaxed">
                        {b.text}
                      </p>
                    );
                  }
                  if (b.type === "list") {
                    return (
                      <ul key={i} className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                        {b.items.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  if (b.type === "fields") {
                    return (
                      <dl key={i} className="space-y-2 rounded-md border bg-secondary/30 p-3">
                        {b.items.map((f, j) => (
                          <div key={j} className="text-sm">
                            <dt className="font-medium">{f.name}</dt>
                            <dd className="text-muted-foreground">{f.desc}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  }
                  if (b.type === "warning") {
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-3 text-sm text-[#a2504c]"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {b.text}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md border border-brand-soft bg-brand-tint p-3 text-sm text-brand-text"
                    >
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                      {b.text}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
