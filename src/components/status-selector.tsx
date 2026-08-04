"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "offline" | "online" | "busy" | "away";

const STATUS_LABEL: Record<Status, string> = {
  online: "Online",
  busy: "Ocupado",
  away: "Ausente",
  offline: "Offline",
};

const STATUS_DOT: Record<Status, string> = {
  online: "#22c55e",
  busy: "#eab308",
  away: "#9ca3af",
  offline: "#6b7280",
};

const OPTIONS: Status[] = ["online", "busy", "away", "offline"];

/**
 * Seletor de presença (Sprint Q1) — sem lógica de fila ainda: só grava o
 * status escolhido em `agent_status` via `/api/presence`. A distribuição
 * de conversas por status entra no Sprint Q2 (ver ROADMAP_queue_routing.md).
 */
export function StatusSelector() {
  const [status, setStatus] = useState<Status>("offline");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/presence")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status: Status } | null) => {
        if (data) setStatus(data.status);
      })
      .catch(() => {});
  }, []);

  async function choose(next: Status) {
    setOpen(false);
    if (next === status) return;
    setBusy(true);
    const res = await fetch("/api/presence", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setStatus(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-accent"
      >
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: STATUS_DOT[status] }}
        />
        {STATUS_LABEL[status]}
        <ChevronsUpDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-36 rounded-md border bg-card p-1 shadow-lg">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => void choose(opt)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent",
                  status === opt && "font-semibold"
                )}
              >
                <Check className={cn("h-3 w-3 shrink-0", status === opt ? "opacity-100" : "opacity-0")} />
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: STATUS_DOT[opt] }}
                />
                {STATUS_LABEL[opt]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
