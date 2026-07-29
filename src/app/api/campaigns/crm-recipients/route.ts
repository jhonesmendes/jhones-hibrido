import { withAuth } from "@/lib/api";
import { resolveCrmContacts } from "@/server/campaigns/create";

export const dynamic = "force-dynamic";

/** Contagem + amostra de contatos do CRM para a aba "Contatos do CRM" (não persiste nada). */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const stageId = url.searchParams.get("stageId");
  const originChannel = url.searchParams.get("originChannel") as
    | "official"
    | "unofficial"
    | null;

  const contacts = await resolveCrmContacts(session.organizationId, {
    stageId: stageId || null,
    channel: originChannel || null,
  });

  return Response.json({
    count: contacts.length,
    sample: contacts.slice(0, 3),
  });
});
