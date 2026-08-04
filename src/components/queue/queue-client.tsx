"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/components/use-events";

type QueueEntry = {
  id: string;
  conversationId: string;
  departmentId: string;
  status: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  assignedTo: string | null;
  assignedToName: string | null;
  timeoutAt: string | null;
  attempt: number;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Aguardando",
  selecting: "Cliente escolhendo",
  assigned: "Designada",
};

/**
 * Fila de atendimento (Sprint Q2/Q4) — quem chega aqui já foi escopado
 * pelo servidor (`GET /api/queue`): owner, quem tem `conversations:view_all`,
 * admin do depto, ou agente comum de um depto em modo `manual` (só nesse
 * caso o botão "Pegar" faz sentido — nos outros modos o sistema já
 * distribui sozinho e a lista aqui é só acompanhamento).
 */
export function QueueClient() {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/queue").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { entries: QueueEntry[] };
    setEntries(data.entries);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEvents({
    onQueueAssigned: () => void refetch(),
    onConversationUpdated: () => void refetch(),
  });

  async function claim(entry: QueueEntry) {
    setClaiming(entry.id);
    const res = await fetch(`/api/queue/${entry.id}/claim`, { method: "POST" }).catch(() => null);
    setClaiming(null);
    if (res?.ok) {
      router.push(`/inbox?contact=${entry.contactId}`);
      void refetch();
    } else {
      void refetch(); // alguém pegou antes — atualiza a lista
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-text-3" strokeWidth={1.7} />
        <h1 className="text-[17px] font-[650] tracking-tight">Fila de atendimento</h1>
      </div>

      {entries === null ? (
        <p className="text-sm text-text-3">Carregando…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-3">
          Nenhuma conversa na fila agora. Conversas de departamentos com fila
          ativa aparecem aqui enquanto aguardam roteamento.
        </p>
      ) : (
        <ul className="max-w-2xl space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.contactName}</p>
                  <p className="text-xs text-text-3">{e.contactPhone}</p>
                </div>
                <Badge variant="outline">{STATUS_LABEL[e.status] ?? e.status}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-text-3">
                  {e.status === "assigned" && e.assignedToName
                    ? `Designada a ${e.assignedToName}`
                    : e.attempt > 1
                      ? `Tentativa ${e.attempt}`
                      : null}
                </p>
                {e.status === "waiting" && (
                  <Button
                    size="sm"
                    disabled={claiming === e.id}
                    onClick={() => void claim(e)}
                  >
                    {claiming === e.id ? "Pegando…" : "Pegar"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
