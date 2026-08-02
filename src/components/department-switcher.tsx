"use client";

import { useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Department = { id: string; name: string };

/**
 * Seletor de departamento — só aparece quando a organização já tem ao
 * menos 1 departamento cadastrado (v0.1). Owner sempre tem a opção "Visão
 * consolidada" (null = sem filtro); os demais só veem os departamentos aos
 * quais pertencem (`GET /api/settings/departments` já escopa isso).
 */
export function DepartmentSwitcher({ role }: { role: string }) {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/departments").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/active-department").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, a]: [{ departments: Department[] } | null, { activeDepartmentId: string | null } | null]) => {
        setDepartments(d?.departments ?? []);
        setActive(a?.activeDepartmentId ?? null);
      })
      .catch(() => {
        setDepartments([]);
      });
  }, []);

  async function choose(departmentId: string | null) {
    setOpen(false);
    if (departmentId === active) return;
    setBusy(true);
    const res = await fetch("/api/settings/active-department", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      // Recarga completa: garante que Caixa de Entrada, Pipeline e
      // Contatos (todos client components com fetch próprio) refaçam suas
      // buscas já filtradas pelo novo departamento — mais simples e
      // confiável do que amarrar um canal de invalidação entre eles.
      window.location.reload();
    }
  }

  if (!departments || departments.length === 0) return null;

  const activeName =
    departments.find((d) => d.id === active)?.name ??
    (role === "owner" ? "Visão consolidada" : "Selecione o departamento");

  return (
    <div className="relative mb-2 px-0.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left text-sm hover:bg-accent"
      >
        <Building2 className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate font-medium">{activeName}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-card p-1 shadow-lg">
            {role === "owner" && (
              <Option
                label="Visão consolidada"
                selected={active === null}
                onClick={() => void choose(null)}
              />
            )}
            {departments.map((d) => (
              <Option
                key={d.id}
                label={d.name}
                selected={active === d.id}
                onClick={() => void choose(d.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent",
        selected && "font-semibold text-brand-text"
      )}
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{label}</span>
    </button>
  );
}
