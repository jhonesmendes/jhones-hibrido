import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CHAT_BG_PRESETS, isValidHex } from "@/lib/branding";

export const dynamic = "force-dynamic";

/**
 * Aparência pessoal (por membro, não por organização) — cor de destaque e
 * fundo do painel de conversa. Mesmo padrão de `inbox-preferences`: cada
 * membro lê/grava a sua própria, sem checagem extra de papel.
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      accentHex: schema.member.accentHex,
      accentIntensity: schema.member.accentIntensity,
      chatBg: schema.member.chatBg,
      chatBgIntensity: schema.member.chatBgIntensity,
    })
    .from(schema.member)
    .where(eq(schema.member.id, session.memberId))
    .limit(1);
  return Response.json(
    rows[0] ?? { accentHex: null, accentIntensity: null, chatBg: null, chatBgIntensity: null }
  );
});

function isValidChatBg(value: string): boolean {
  return value === "default" || value in CHAT_BG_PRESETS || isValidHex(value);
}

const putSchema = z.object({
  accentHex: z
    .string()
    .refine(isValidHex, "Cor de destaque inválida")
    .nullable(),
  accentIntensity: z.number().int().min(30).max(100).nullable(),
  chatBg: z.string().refine(isValidChatBg, "Fundo inválido").nullable(),
  chatBgIntensity: z.number().int().min(0).max(100).nullable(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  await db
    .update(schema.member)
    .set({
      accentHex: body.data.accentHex,
      accentIntensity: body.data.accentIntensity,
      // "default" é só o estado inicial do seletor (nenhum preset/custom
      // escolhido) — equivale a null (sem override) pra quem lê depois.
      chatBg: body.data.chatBg === "default" ? null : body.data.chatBg,
      chatBgIntensity: body.data.chatBgIntensity,
    })
    .where(eq(schema.member.id, session.memberId));
  return Response.json({ ok: true });
});
