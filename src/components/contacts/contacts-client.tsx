"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Download,
  MessageSquareText,
  Search,
  UserPlus,
  Upload,
} from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpLink } from "@/components/docs/help-link";
import {
  ContactFormDialog,
  type ContactFormValues,
} from "@/components/contacts/contact-form-dialog";

export function ContactsClient() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refetch = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (showArchived) params.set("archived", "true");
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { contacts: ContactDto[] };
    setContacts(data.contacts);
  }, [query, showArchived]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  /**
   * Contatos sem nenhuma mensagem trocada ainda (ex.: importados via CSV)
   * não têm conversa — o Link direto pra /inbox?contact=X caía numa tela
   * vazia porque o inbox só seleciona conversas que já existem. Garante a
   * conversa antes de navegar (reusa o mesmo endpoint do "Iniciar conversa").
   */
  async function openConversation(contactId: string) {
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId }),
    }).catch(() => null);
    router.push(`/inbox?contact=${contactId}`);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    void refetch();
  }

  async function createContact(values: ContactFormValues): Promise<string | null> {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        phone: values.phone,
        reference: values.reference || undefined,
        comment: values.comment || undefined,
        notes: values.notes || undefined,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return data?.error?.message ?? "Não foi possível criar o contato";
    }
    void refetch();
    return null;
  }

  async function importCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/contacts/import-csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csvText }),
      }).catch(() => null);
      if (!res?.ok) {
        setImportResult("Não foi possível importar o arquivo");
        return;
      }
      const data = (await res.json()) as {
        imported: number;
        invalidRows: { line: number; reason: string }[];
      };
      setImportResult(
        `${data.imported} contato(s) importado(s)` +
          (data.invalidRows.length > 0
            ? ` · ${data.invalidRows.length} linha(s) ignorada(s) (telefone inválido)`
            : "")
      );
      void refetch();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">Contatos</h2>
          <HelpLink slug="contatos" />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Ver arquivados
          </label>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 sm:w-56 md:w-72"
            />
          </div>
          <a href="/modelo-contatos.csv" download>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4" />
              Baixar modelo
            </Button>
          </a>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importCsv(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {importing ? "Importando…" : "Importar CSV"}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" />
            Novo contato
          </Button>
        </div>
      </header>

      {importResult && (
        <div className="flex items-center justify-between border-b bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
          <span>{importResult}</span>
          <button
            onClick={() => setImportResult(null)}
            className="text-xs underline underline-offset-2"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Nenhum contato</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cada pessoa que escrever para o seu WhatsApp fica registrada
              aqui automaticamente.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3"
              >
                <ContactAvatar name={c.name} seed={c.id} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                    </span>
                    {c.archivedAt && (
                      <Badge variant="secondary">Arquivado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(c.phone)}
                    {c.notes ? ` · ${c.notes.slice(0, 60)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(c)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Abrir conversa"
                    onClick={() => void openConversation(c.id)}
                  >
                    <MessageSquareText className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={c.archivedAt ? "Desarquivar" : "Arquivar"}
                    onClick={() => void patch(c.id, { archived: !c.archivedAt })}
                  >
                    {c.archivedAt ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <ContactFormDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={createContact}
        />
      )}

      {editing && (
        <ContactFormDialog
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await patch(editing.id, {
              name: values.name,
              reference: values.reference || null,
              comment: values.comment || null,
              notes: values.notes || null,
            });
            return null;
          }}
        />
      )}
    </div>
  );
}
