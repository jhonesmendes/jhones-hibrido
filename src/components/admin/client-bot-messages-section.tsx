"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Message = { key: string; value: string; updatedAt: string };

const GROUPS: { title: string; items: Record<string, string> }[] = [
  {
    title: "Início",
    items: {
      msg_saudacao: "Saudação",
      msg_menu: "Menu de opções",
      msg_opcao_invalida: "Opção não entendida",
      msg_ia_como_enviar: "IA: como enviar o documento",
      msg_ia_fora_escopo: "IA: assunto fora do atendimento",
    },
  },
  {
    title: "Encerrar MDF-e",
    items: {
      msg_pedir_damdfe: "Pedir o DAMDFE",
      msg_pedir_arquivo: "Pedir arquivo em foto ou PDF",
      msg_conferindo: "Conferindo o documento",
      msg_aguarde: "Ainda conferindo",
      msg_encerrado: "Confirmação de encerramento",
      msg_pos_encerrado: "Depois de encerrar",
      msg_reenviar: "Pedir novo envio",
      msg_em_processamento: "Encerramento em processamento",
      msg_arquivo_grande: "Arquivo grande demais",
      msg_arquivo_ilegivel: "Arquivo ilegível",
    },
  },
  {
    title: "Cargas na região",
    items: {
      msg_cargas_em_breve: "Consulta ainda indisponível",
      msg_pedir_localizacao: "Pedir a localização",
      msg_cargas_recebido: "Localização recebida",
    },
  },
  {
    title: "Operação e erros",
    items: {
      msg_operacao: "Passar para a operação",
      msg_transbordo: "Não conseguiu concluir",
      msg_indisponivel: "Conferência indisponível",
      msg_erro_tecnico: "Problema técnico",
    },
  },
];

const KNOWN_KEYS = new Set(GROUPS.flatMap((g) => Object.keys(g.items)));

export function ClientBotMessagesSection({ clientId }: { clientId: string }) {
  const [saved, setSaved] = useState<Message[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((messages: Message[]) => {
    setSaved(messages);
    setDrafts(Object.fromEntries(messages.map((m) => [m.key, m.value])));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/bot-messages`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { available?: boolean; messages?: Message[]; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.messages) {
      setLoadError(data?.error?.message ?? "Não foi possível carregar as mensagens");
      return;
    }
    setAvailable(data.available === true);
    apply(data.messages);
  }, [apply, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(
    () => Object.fromEntries((saved ?? []).filter((m) => drafts[m.key] !== m.value).map((m) => [m.key, drafts[m.key] ?? ""])),
    [drafts, saved]
  );
  const changedCount = Object.keys(changed).length;
  const hasBlank = Object.values(changed).some((v) => !v.trim());

  async function save() {
    setSaving(true);
    setResult(null);
    const res = await fetch(`/api/admin/clients/${clientId}/bot-messages`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: changed }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => null)) as
      | { messages?: Message[]; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.messages) {
      setResult({ ok: false, text: data?.error?.message ?? "Não foi possível salvar" });
      return;
    }
    apply(data.messages);
    setResult({ ok: true, text: "Salvo. Vale a partir da próxima mensagem recebida." });
  }

  const others = (saved ?? []).filter((m) => !KNOWN_KEYS.has(m.key));
  const groups = [
    ...GROUPS,
    ...(others.length > 0
      ? [{ title: "Outras", items: Object.fromEntries(others.map((m) => [m.key, m.key])) }]
      : []),
  ];

  return (
    <div className="space-y-4 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
      <div>
        <p className="text-sm font-medium text-[#c0c8e8]">Mensagens do bot</p>
        <p className="text-xs text-[#6070a0]">Textos que o bot MDF-e envia aos motoristas.</p>
      </div>

      {loadError && <p className="text-sm text-[#f07070]">{loadError}</p>}
      {!loadError && !saved && <p className="text-sm text-[#6070a0]">Carregando…</p>}
      {!loadError && saved && !available && (
        <p className="text-sm text-[#6070a0]">O bot não está instalado nesta instância.</p>
      )}

      {!loadError && saved && available && (
        <>
          {groups.map((group) => {
            const keys = Object.keys(group.items).filter((key) => key in drafts);
            if (keys.length === 0) return null;
            return (
              <details key={group.title} className="rounded-md border border-[#1e2130] p-3">
                <summary className="cursor-pointer text-sm text-[#8890b0]">{group.title}</summary>
                <div className="mt-3 space-y-3">
                  {keys.map((key) => (
                    <div key={key} className="space-y-1">
                      <label htmlFor={`bot-${key}`} className="text-sm text-[#8890b0]">
                        {group.items[key]}
                      </label>
                      <textarea
                        id={`bot-${key}`}
                        rows={Math.min(6, Math.max(2, (drafts[key] ?? "").split("\n").length))}
                        maxLength={4096}
                        value={drafts[key] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
                      />
                    </div>
                  ))}
                </div>
              </details>
            );
          })}

          {hasBlank && <p className="text-sm text-[#f07070]">Uma mensagem não pode ficar vazia.</p>}
          {result && (
            <p className={`text-sm ${result.ok ? "text-[#4ecb8d]" : "text-[#f07070]"}`}>{result.text}</p>
          )}
          <button
            disabled={saving || changedCount === 0 || hasBlank}
            onClick={() => void save()}
            className="rounded-md border border-[#2a4090] bg-[#1e3080] px-4 py-2 text-sm font-medium text-[#7c9ff5] transition-colors hover:bg-[#243898] disabled:opacity-50"
          >
            {saving
              ? "Salvando…"
              : changedCount > 0
                ? `Salvar ${changedCount} ${changedCount === 1 ? "mensagem" : "mensagens"}`
                : "Salvar mensagens"}
          </button>
        </>
      )}
    </div>
  );
}
