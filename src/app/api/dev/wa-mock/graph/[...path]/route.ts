import { mockGuard } from "@/lib/dev-guard";
import {
  getWaMockState,
  nextN,
  type MockTemplate,
} from "@/server/dev/wa-mock-state";

/**
 * Imitação da Graph API (contrato mocks.md). O cliente real aponta para cá
 * quando META_GRAPH_BASE_URL = <app>/api/dev/wa-mock/graph — o código de
 * produção não sabe que está falando com um mock.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function bearerToken(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function invalidTokenResponse(): Response {
  return Response.json(
    {
      error: {
        message: "Invalid OAuth access token - Cannot parse access token",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "mock",
      },
    },
    { status: 401 }
  );
}

/** Remove o segmento de versão (v25.0/...) se vier na rota. */
function normalizePath(path: string[]): string[] {
  return path[0] && /^v\d+/.test(path[0]) ? path.slice(1) : path;
}

/** Espelha a exigência real da Meta: todo `{{n}}` no corpo precisa de um
 * exemplo em `example.body_text` — senão ela recusa com code 100 "Invalid
 * parameter" (não é erro de token, mas o tipo devolvido é OAuthException). */
function invalidExampleResponse(
  bodyComponent: { text?: string; example?: { body_text?: unknown[][] } } | undefined
): Response | null {
  const variableCount = new Set(
    [...(bodyComponent?.text ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])
  ).size;
  if (variableCount === 0) return null;
  const exampleCount = bodyComponent?.example?.body_text?.[0]?.length ?? 0;
  if (exampleCount >= variableCount) return null;
  return Response.json(
    {
      error: {
        message: "Invalid parameter",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "mock",
      },
    },
    { status: 400 }
  );
}

export async function GET(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  // GET {wabaId}/message_templates → lista para o sync
  if (path.length === 2 && path[1] === "message_templates") {
    const state = getWaMockState();
    return Response.json({
      data: state.templates.map((t) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: [{ type: "BODY", text: t.body }],
      })),
    });
  }

  // GET {phoneNumberId}?fields=... → validação do wizard
  if (path.length === 1) {
    return Response.json({
      display_phone_number: "+52 55 0000 0000",
      verified_name: "Número de teste Vocero",
      id: path[0],
    });
  }

  return Response.json({});
}

export async function POST(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // POST {phoneNumberId}/messages → registra no outbox
  if (path.length === 2 && path[1] === "messages") {
    const state = getWaMockState();
    const n = nextN();
    state.outbox.push({
      n,
      phoneNumberId: path[0]!,
      to: String(body.to ?? ""),
      type: String(body.type ?? "text"),
      body,
      at: new Date().toISOString(),
    });
    return Response.json({
      messaging_product: "whatsapp",
      contacts: [{ input: body.to, wa_id: body.to }],
      messages: [{ id: `wamid.mock.out.${n}` }],
    });
  }

  // POST {wabaId}/message_templates → criação de template (fica PENDING)
  if (path.length === 2 && path[1] === "message_templates") {
    const state = getWaMockState();
    const bodyComponent = (
      body.components as
        | { type?: string; text?: string; example?: { body_text?: unknown[][] } }[]
        | undefined
    )?.find((c) => (c.type ?? "").toUpperCase() === "BODY");
    const invalidExample = invalidExampleResponse(bodyComponent);
    if (invalidExample) return invalidExample;
    const tpl: MockTemplate = {
      id: `tplmock_${nextN()}`,
      name: String(body.name ?? ""),
      language: String(body.language ?? "es_MX"),
      category: String(body.category ?? "UTILITY"),
      status: "PENDING",
      body: bodyComponent?.text ?? "",
    };
    state.templates.push(tpl);
    return Response.json({ id: tpl.id, status: "PENDING", category: tpl.category });
  }

  // POST {wabaId}/subscribed_apps → inscrição (com ou sem override)
  if (path.length === 2 && path[1] === "subscribed_apps") {
    return Response.json({ success: true });
  }

  // POST {templateId} → edição de modelo existente (rejeitado → tentar de
  // novo): volta pra PENDING, mesmo comportamento da Meta de verdade.
  if (path.length === 1) {
    const state = getWaMockState();
    const tpl = state.templates.find((t) => t.id === path[0]);
    if (!tpl) {
      return Response.json(
        { error: { message: "Modelo não encontrado", code: 100 } },
        { status: 404 }
      );
    }
    const bodyComponent = (
      body.components as
        | { type?: string; text?: string; example?: { body_text?: unknown[][] } }[]
        | undefined
    )?.find((c) => (c.type ?? "").toUpperCase() === "BODY");
    const invalidExample = invalidExampleResponse(bodyComponent);
    if (invalidExample) return invalidExample;
    if (body.category) tpl.category = String(body.category);
    if (bodyComponent?.text) tpl.body = bodyComponent.text;
    tpl.status = "PENDING";
    return Response.json({ success: true });
  }

  return Response.json({});
}

export async function DELETE(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();
  await ctx.params;

  // DELETE {wabaId}/message_templates?name=...&hsm_id=... → remove do
  // estado do mock de verdade (senão o Sincronizar continuaria achando o
  // modelo "apagado" de volta).
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const hsmId = url.searchParams.get("hsm_id");
  if (name) {
    const state = getWaMockState();
    state.templates = state.templates.filter(
      (t) => !(t.name === name && (!hsmId || t.id === hsmId))
    );
  }
  return Response.json({ success: true });
}
