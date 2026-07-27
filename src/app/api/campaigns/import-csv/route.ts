import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { parseRecipientsCsv } from "@/lib/campaigns/csv";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ csvText: z.string().min(1) });

/** Previsualización de un CSV de destinatarios: no persiste nada. */
export const POST = withAuth(async (_session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const { validRows, invalidRows, variableNames } = parseRecipientsCsv(
    body.data.csvText
  );
  return Response.json({
    total: validRows.length,
    preview: validRows.slice(0, 5),
    invalidRows: invalidRows.slice(0, 20),
    variableNames,
  });
});
