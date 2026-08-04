"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type QueueAssignment = {
  queueId: string;
  conversationId: string;
  contactId: string;
  contactName: string;
  timeoutAt: string | null;
};

/**
 * Toast de "nova conversa na fila" (Sprint Q2) — aparece pra quem foi
 * designado via `onQueueAssigned` (já filtrado pelo servidor, só o
 * destinatário recebe o evento). Timer regressivo até `timeoutAt`; some
 * sozinho quando expira (o scheduler já devolveu a conversa pra fila do
 * lado do servidor nesse momento).
 */
export function QueueToast({
  assignment,
  onDismiss,
}: {
  assignment: QueueAssignment;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!assignment.timeoutAt) {
      setRemainingMs(null);
      return;
    }
    const target = new Date(assignment.timeoutAt).getTime();
    const tick = () => {
      const left = target - Date.now();
      setRemainingMs(left);
      if (left <= 0) onDismiss();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [assignment.timeoutAt, onDismiss]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/queue/${assignment.queueId}/assign`, { method: "POST" }).catch(
      () => null
    );
    setBusy(false);
    if (res?.ok) {
      onDismiss();
      router.push(`/inbox?contact=${assignment.contactId}`);
    }
  }

  async function transfer() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/queue/${assignment.queueId}/transfer`, { method: "POST" }).catch(() => null);
    setBusy(false);
    onDismiss();
  }

  const seconds = remainingMs !== null ? Math.max(0, Math.ceil(remainingMs / 1000)) : null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-lg border bg-card p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">Nova conversa</p>
        <button
          aria-label="Fechar"
          className="text-text-3 hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 truncate text-sm text-text-2">{assignment.contactName}</p>
      {seconds !== null && (
        <p className="mt-1 text-xs text-text-3">Expira em {seconds}s</p>
      )}
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void accept()}>
          Aceitar
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void transfer()}>
          Repassar
        </Button>
      </div>
    </div>
  );
}
