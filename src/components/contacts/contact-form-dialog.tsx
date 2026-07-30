"use client";

import { useState } from "react";
import type { ContactDto } from "@/lib/types";
import { formatPhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ContactFormValues = {
  name: string;
  phone?: string;
  reference: string;
  comment: string;
  notes: string;
};

/** Modal único de cadastro/edição de contato — usado tanto pela lista de
 * Contatos (criar) quanto pelo painel de detalhes da conversa (completar um
 * contato que já existe, ver contact-panel.tsx). O telefone só é editável ao
 * criar; a API de edição não permite trocar o telefone de um contato. */
export function ContactFormDialog({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: Partial<ContactDto>;
  onClose: () => void;
  onSubmit: (values: ContactFormValues) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneValid = mode === "edit" || /^\d{7,15}$/.test(phone.trim());
  const canSave = name.trim().length > 0 && phoneValid && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    const err = await onSubmit({
      name: name.trim(),
      phone: mode === "create" ? phone.trim() : undefined,
      reference: reference.trim(),
      comment: comment.trim(),
      notes: notes.trim(),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">
          {mode === "create" ? "Novo contato" : "Editar contato"}
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Nome *</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João Silva"
            />
          </div>

          {mode === "create" ? (
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">
                Telefone * <span className="font-normal text-muted-foreground">(com código do país)</span>
              </Label>
              <Input
                id="contact-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="5511912345678"
              />
            </div>
          ) : (
            initial?.phone && (
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <p className="text-sm text-muted-foreground">
                  {formatPhone(initial.phone)}
                </p>
              </div>
            )
          )}

          <div className="space-y-1.5">
            <Label htmlFor="contact-reference">
              Referência <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="contact-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Indicado por, campanha, origem…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-comment">
              Comentário <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="contact-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Observação curta…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-notes">
              Nota <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="contact-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações internas sobre o contato…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {saving ? "Salvando…" : mode === "create" ? "Criar contato" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
