import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getBackup } from "@/server/backup/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function requireControlSecret(req: Request): Response | null {
  const env = getEnv();
  if (!env.LICENSE_CONTROL_SECRET) {
    return apiError(503, "license_control_not_configured", "API interna não configurada nesta instância");
  }
  const header = req.headers.get("x-license-control-secret");
  if (header !== env.LICENSE_CONTROL_SECRET) {
    return apiError(401, "unauthorized", "Segredo inválido");
  }
  return null;
}

/** Stream do arquivo do dump direto pro painel admin — o arquivo nunca sai
 * do disco da instância a não ser por essa chamada autenticada e sob
 * demanda (nada de upload automático pra fora). */
export async function GET(req: Request, { params }: Params) {
  const denied = requireControlSecret(req);
  if (denied) return denied;
  const { id } = await params;
  const b = await getBackup(id);
  if (!b || b.status !== "done") return apiError(404, "not_found", "Backup não encontrado");

  const nodeStream = createReadStream(b.filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${b.filename}"`,
      ...(b.sizeBytes ? { "content-length": String(b.sizeBytes) } : {}),
    },
  });
}
