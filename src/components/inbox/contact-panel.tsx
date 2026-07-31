"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Sparkles, UserPlus, UserRound } from "lucide-react";
import type { ContactDto, ConversationDto, StageDto } from "@/lib/types";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";

const HANDOFF_LABELS: Record<string, string> = {
  cliente: "O cliente pediu um humano",
  modelo: "O agente decidiu escalar",
  error: "Erro do provedor de IA",
  ventana: "Janela de 24h fechada",
};

export function ContactPanel({
  conversation,
  refreshKey = 0,
  onPatchConversation,
  onClose,
}: {
  conversation: ConversationDto;
  /** Aumenta a cada evento SSE relevante: dispara um refetch ao vivo. */
  refreshKey?: number;
  onPatchConversation: (patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
    channel?: "official" | "unofficial";
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [contactDetail, setContactDetail] = useState<ContactDto | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  // Estado global do agente: sem isso, o toggle "Respondendo" mentiria
  // quando o agente ainda não tiver sido configurado/ativado.
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  const contactId = conversation.contact.id;

  const agentReady = aiConfigured && agentEnabled;
  const aiActive =
    agentReady && conversation.aiEnabled && !conversation.handoffAt;

  // Carregamento inicial (inclui notas): reexecuta ao trocar de contato.
  const refetch = useCallback(async () => {
    const [detail, stagesRes, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pipeline/stages").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null]);
    if (detail) {
      setNotes(detail.contact?.notes ?? "");
      setContactDetail(detail.contact ?? null);
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (stagesRes) setStages(stagesRes.stages);
    setAgentEnabled(Boolean(agentRes?.profile?.enabled));
    setAiConfigured(Boolean(agentRes?.aiConfigured));
    setNotesLoaded(true);
  }, [contactId]);

  // Refetch ao vivo (etapa/lead + estado do agente) SEM tocar nas notas, para
  // não sobrescrever o que o operador estiver digitando. Disparado pelo SSE.
  const refreshLive = useCallback(async () => {
    const [detail, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (detail) {
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (agentRes) {
      setAgentEnabled(Boolean(agentRes.profile?.enabled));
      setAiConfigured(Boolean(agentRes.aiConfigured));
    }
  }, [contactId]);

  useEffect(() => {
    setNotesLoaded(false);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!notesLoaded) return; // o carregamento inicial já traz o estado atualizado
    void refreshLive();
  }, [refreshKey, notesLoaded, refreshLive]);

  async function moveToStage(stageId: string) {
    if (!leadId || stageId === currentStageId) return;
    setCurrentStageId(stageId); // optimista
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId, position: 0 }),
    }).catch(() => null);
    void refreshLive();
  }

  async function saveNotes() {
    setSavingNotes(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    }).catch(() => null);
    setSavingNotes(false);
  }

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 flex items-center justify-between border-b bg-background px-4 py-3">
        <h3 className="text-[13px] font-[650] uppercase tracking-wide text-text-2">
          Detalhes
        </h3>
        <button
          onClick={onClose}
          aria-label="Ocultar painel"
          className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Contato */}
        <section className="border-b p-4">
          <div className="flex items-center gap-3">
            <ContactAvatar
              name={conversation.contact.name}
              seed={conversation.contact.id}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-[650]">
                {conversation.contact.name}
              </p>
              <p className="text-xs text-text-3">
                {conversation.contact.kind === "group"
                  ? "Grupo"
                  : formatPhone(conversation.contact.phone)}
              </p>
            </div>
            {conversation.contact.kind !== "group" && (
              <button
                onClick={() => setEditingContact(true)}
                aria-label="Cadastrar/editar contato"
                title="Cadastrar/editar contato"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-3 hover:bg-accent hover:text-brand-text"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.7} />
              </button>
            )}
          </div>

          {conversation.handoffAt && (
            <div className="mt-3 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#8a6d3b]">
                <UserRound className="h-4 w-4" strokeWidth={1.7} /> Atendimento humano
              </p>
              <p className="mt-1 text-xs text-[#8a6d3b]/80">
                {HANDOFF_LABELS[conversation.handoffReason ?? ""] ??
                  "A IA está pausada nesta conversa."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                disabled={!agentReady}
                onClick={() => void onPatchConversation({ reactivate: true })}
              >
                Reativar IA
              </Button>
            </div>
          )}

          <div className="mt-3 rounded-md border bg-secondary/50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">IA nesta conversa</p>
                <p className="text-[11px] text-text-3">
                  {!agentReady
                    ? "Agente não ativado"
                    : conversation.handoffAt
                      ? "Pausada · atendimento humano"
                      : conversation.aiEnabled
                        ? "Respondendo"
                        : "Pausada"}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={aiActive}
                aria-label="IA nesta conversa"
                disabled={!agentReady}
                onClick={() => {
                  if (!agentReady) return;
                  void onPatchConversation({
                    aiEnabled: !conversation.aiEnabled,
                  });
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
                  aiActive ? "bg-brand" : "bg-border-strong",
                  !agentReady && "cursor-not-allowed opacity-60"
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    aiActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {!agentReady && (
              <div className="mt-2.5 flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-2.5">
                <Sparkles
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6d3b]"
                  strokeWidth={1.7}
                />
                <p className="text-[11px] leading-relaxed text-[#8a6d3b]">
                  {aiConfigured
                    ? "A IA ainda não responde sozinha. Configure o básico do agente e ative-o."
                    : "Falta a chave de IA da instância (OPENROUTER_API_TOKEN) para o agente poder responder."}
                  {aiConfigured && (
                    <Link
                      href="/agent"
                      className="ml-1 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
                    >
                      Configurar agente →
                    </Link>
                  )}
                </p>
              </div>
            )}
          </div>
          {/* Canal de saída (modelo híbrido oficial / não oficial) */}
          <div className="mt-3 rounded-md border bg-secondary/50 px-3 py-2.5">
            <p className="text-[13px] font-medium">Canal de envio</p>
            <p className="text-[11px] text-text-3">
              {conversation.channel === "unofficial"
                ? "WhatsApp Web · sem janela de 24h"
                : "WhatsApp Cloud API oficial"}
            </p>
            <div className="mt-2 flex gap-1.5">
              {(
                [
                  { id: "official", label: "Oficial" },
                  { id: "unofficial", label: "WhatsApp Web" },
                ] as const
              ).map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    if (ch.id === conversation.channel) return;
                    void onPatchConversation({ channel: ch.id });
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    conversation.channel === ch.id
                      ? "border-brand bg-brand text-white"
                      : "bg-background text-text-2 hover:bg-accent"
                  )}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Stepper de etapa */}
        {stages.length > 0 && leadId && (
          <section className="border-b p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Etapa do pipeline
            </p>
            <ol>
              {stages.map((s, i) => {
                const done = currentIndex >= 0 && i < currentIndex;
                const current = s.id === currentStageId;
                return (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < stages.length - 1 && (
                      <span
                        className={cn(
                          "absolute left-[7px] top-4 h-full w-px",
                          done ? "bg-brand" : "bg-border-strong"
                        )}
                      />
                    )}
                    <button
                      onClick={() => void moveToStage(s.id)}
                      aria-label={`Mover para ${s.name}`}
                      className={cn(
                        "relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full transition-colors",
                        done && "bg-brand text-white",
                        current && "bg-brand ring-4 ring-brand-soft",
                        !done && !current && "border border-border-strong bg-background hover:border-brand"
                      )}
                    >
                      {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </button>
                    <button
                      onClick={() => void moveToStage(s.id)}
                      className={cn(
                        "text-left text-[13px]",
                        current ? "font-[650] text-brand-text" : "text-text-2 hover:text-foreground"
                      )}
                    >
                      {s.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Notas */}
        <section className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Notas
          </p>
          <Textarea
            rows={5}
            placeholder="Notas internas sobre este contato…"
            value={notes}
            disabled={!notesLoaded}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={savingNotes || !notesLoaded}
            onClick={() => void saveNotes()}
          >
            {savingNotes ? "Salvando…" : "Salvar notas"}
          </Button>
        </section>
      </div>

      {editingContact && (
        <ContactFormDialog
          mode="edit"
          initial={contactDetail ?? { name: conversation.contact.name, phone: conversation.contact.phone }}
          onClose={() => setEditingContact(false)}
          onSubmit={async (values) => {
            await fetch(`/api/contacts/${contactId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: values.name,
                reference: values.reference || null,
                comment: values.comment || null,
                notes: values.notes || null,
              }),
            }).catch(() => null);
            setNotes(values.notes);
            void refetch();
            return null;
          }}
        />
      )}
    </div>
  );
}
