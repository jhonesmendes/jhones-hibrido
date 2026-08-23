/** DTOs que trafegam pela API interna (lado cliente). */

export type ConversationDto = {
  id: string;
  contact: {
    id: string;
    name: string;
    waProfileName: string | null;
    phone: string;
    kind: "individual" | "group";
  };
  assignedTo: string | null;
  departmentId: string | null;
  stageName: string | null;
  channel: "official" | "unofficial";
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  /** Rota do proxy de mídia (/api/media/[id]) quando há mídia exibível. */
  mediaUrl: string | null;
  filename: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  /** Motivo da falha (vindo do status webhook da Meta) — null exceto quando status = "failed". */
  error: string | null;
  aiGenerated: boolean;
  /** Mensagem citada (resposta/quote) — null quando não é resposta a nada. */
  replyToMessageId: string | null;
  /** Assinatura no painel interno (agente humano que mandou) — null pra
   * mensagens do cliente, automação, ou mensagens antigas sem essa info. */
  senderName: string | null;
  createdAt: string;
  /** Não nula = mensagem editada depois de enviada (só canal não oficial). */
  editedAt: string | null;
  /** true = o servidor permite editar esta mensagem agora (texto de saída
   * pelo canal não oficial, dentro da janela de 15min). Recalculada a cada
   * fetch — pode virar `false` sem refetch se o tempo esgotar com a tela
   * aberta; o servidor sempre reforça a checagem de qualquer forma. */
  editable: boolean;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  credentialId: string | null;
  departmentId: string | null;
  isListable: boolean;
};

export type StageDto = {
  id: string;
  name: string;
  position: number;
  kind: "open" | "won" | "lost";
};

export type ContactDto = {
  id: string;
  name: string;
  /** Nome do perfil de WhatsApp do contato (o que ele mesmo definiu no
   * app dele) — informativo, pode divergir do `name` salvo/editado no
   * Vocero. Null quando a Meta nunca mandou (ou o contato não veio do
   * canal oficial). */
  waProfileName: string | null;
  phone: string;
  kind: "individual" | "group";
  reference: string | null;
  comment: string | null;
  notes: string | null;
  archivedAt: string | null;
};

export type CampaignDto = {
  id: string;
  name: string;
  channel: "official" | "unofficial";
  templateId: string | null;
  messageTemplate: string | null;
  sendIntervalMs: number;
  status: "draft" | "sending" | "sent" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type CampaignRecipientDto = {
  id: string;
  phone: string;
  variables: Record<string, string>;
  status: "pending" | "sent" | "failed";
  error: string | null;
};
