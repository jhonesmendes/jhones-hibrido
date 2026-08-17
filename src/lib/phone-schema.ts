import { z } from "zod";
import { normalizePhoneInput } from "@/lib/utils";

/**
 * Schema Zod compartilhado para telefone digitado pelo usuário — usado por
 * toda rota que cria contato/conversa a partir de um número livre (evita a
 * duplicação que causou o bug real: cada rota tinha sua própria regex fraca
 * `/^\d{7,15}$/`, que aceitava número BR sem DDD). Sempre normaliza via
 * `normalizePhoneInput` (mesma função usada pela busca do inbox e pelo
 * import de CSV de campanhas) e rejeita com 422 se não parecer telefone
 * válido — nunca grava o dígito cru do usuário.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    const normalized = normalizePhoneInput(val);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Telefone inválido — inclua o DDD (ex.: 66996746147) ou o código do país (5566996746147)",
      });
      return z.NEVER;
    }
    return normalized;
  });
