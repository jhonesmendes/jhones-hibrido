import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export class CampaignMediaError extends Error {}

/** Mesmo teto do backend de mídia do inbox (composer, media/route.ts). */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export type FetchedCampaignMedia = {
  dataBase64: string;
  mimeType: string;
  filename: string | null;
};

/**
 * Baixa e valida a imagem da URL fornecida — SEM tocar no banco (só rede).
 * Feito ANTES de criar a campanha, pra uma URL quebrada falhar na criação
 * (o operador corrige e tenta de novo) em vez de travar um disparo já em
 * andamento. Quem chama insere o resultado em `campaign_media` na MESMA
 * transação que cria a campanha (a linha tem FK pra `campaign.id`, que só
 * passa a existir ali). Só imagem por ora (jpeg/png/webp/gif), igual ao
 * pedido original; documento/vídeo ficam pra quando alguém precisar.
 */
export async function fetchCampaignMediaFromUrl(mediaUrl: string): Promise<FetchedCampaignMedia> {
  let res: Response;
  try {
    res = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (cause) {
    throw new CampaignMediaError(
      `Não foi possível baixar a imagem da URL informada: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
  }
  if (!res.ok) {
    throw new CampaignMediaError(`A URL da imagem respondeu ${res.status}`);
  }

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!mimeType.startsWith("image/")) {
    throw new CampaignMediaError(
      `A URL não retornou uma imagem (content-type: ${mimeType || "desconhecido"})`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new CampaignMediaError("A imagem baixada está vazia");
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new CampaignMediaError(
      `Imagem muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB) — limite de ${MAX_MEDIA_BYTES / 1024 / 1024}MB`
    );
  }

  const filename = mediaUrl.split("/").pop()?.split("?")[0] || null;
  return { dataBase64: buffer.toString("base64"), mimeType, filename };
}

export async function getCampaignMedia(
  campaignId: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string | null } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.campaignMedia)
    .where(eq(schema.campaignMedia.campaignId, campaignId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { buffer: Buffer.from(row.dataBase64, "base64"), mimeType: row.mimeType, filename: row.filename };
}
