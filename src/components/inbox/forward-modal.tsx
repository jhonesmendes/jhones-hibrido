"use client";

import { useEffect, useState } from "react";
import { Forward, Search, X } from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/utils";

type ForwardResult = { contactId: string; ok: boolean; error?: string };

export function ForwardModal({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ForwardResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/contacts?${params}`)
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((d: { contacts?: ContactDto[] }) => setContacts((d.contacts ?? []).slice(0, 20)))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (selected.size === 0) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/messages/${messageId}/forward`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetContactIds: [...selected],
        caption: caption.trim() || undefined,
      }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível encaminhar");
      return;
    }
    const data = (await res.json()) as { results: ForwardResult[] };
    setResults(data.results);
    if (data.results.every((r) => r.ok)) {
      setTimeout(onClose, 1200);
    }
  }

  const allOk = results && results.every((r) => r.ok);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3.5">
          <p className="flex items-center gap-2 font-medium">
            <Forward className="h-4 w-4" /> Encaminhar
          </p>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou telefone…"
              className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
            />
          </div>

          <div className="max-h-52 space-y-1 overflow-y-auto">
            {contacts.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Nenhum contato encontrado.
              </p>
            )}
            {contacts.map((c) => {
              const result = results?.find((r) => r.contactId === c.id);
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 ${
                    selected.has(c.id)
                      ? "border-brand bg-brand-tint"
                      : "border-transparent hover:bg-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="shrink-0"
                  />
                  <ContactAvatar name={c.name} seed={c.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
                  </div>
                  {result && (
                    <span className={`text-xs ${result.ok ? "text-success" : "text-destructive"}`}>
                      {result.ok ? "✓" : result.error}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Adicionar mensagem <span className="font-normal">(opcional)</span>
            </label>
            <Textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Segue o comprovante…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t bg-secondary/30 px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={selected.size === 0 || sending} onClick={() => void send()}>
              <Forward className="h-3.5 w-3.5" />
              {sending ? "Encaminhando…" : allOk ? "Encaminhado!" : "Encaminhar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
