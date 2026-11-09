"use client";

import { useEffect, useRef, useState } from "react";
import { useEvents } from "@/components/use-events";
import { fetchGroupsInInbox } from "@/lib/inbox-preferences";
import type { QueueAssignment } from "@/components/queue-toast";

/**
 * Sinais comuns às duas navegações (barra lateral e barra do modo embutido):
 * total de não lidas da Caixa de entrada e o aviso "nova conversa na fila".
 */
export function useNavSignals() {
  const [unread, setUnread] = useState(0);
  const [queueAssignment, setQueueAssignment] = useState<QueueAssignment | null>(null);
  // Preferência pessoal: se grupos estão fora da Caixa de Entrada, o badge
  // também não deve contar as não lidas deles.
  const groupsInInboxRef = useRef(true);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number; contact: { kind: string } }[];
    };
    const relevant = groupsInInboxRef.current
      ? data.conversations
      : data.conversations.filter((c) => c.contact.kind !== "group");
    setUnread(relevant.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void fetchGroupsInInbox().then((v) => {
      groupsInInboxRef.current = v;
      void refetchUnread();
    });
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
    onQueueAssigned: (d) =>
      setQueueAssignment({
        queueId: d.queueId,
        conversationId: d.conversationId,
        contactId: d.contactId,
        contactName: d.contactName,
        timeoutAt: d.timeoutAt,
      }),
  });

  return { unread, queueAssignment, dismissQueue: () => setQueueAssignment(null) };
}
