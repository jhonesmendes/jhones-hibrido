/** DTOs que trafegam pela API interna (lado cliente). */

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string; kind: "individual" | "group" };
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
  aiGenerated: boolean;
  createdAt: string;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
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
