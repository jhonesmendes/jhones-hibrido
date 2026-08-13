import { z } from "zod";
import { parseBody } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import {
  generateClientSecret,
  listAdminClients,
  registerAdminClient,
} from "@/server/admin/client-registry";
import { fetchRemoteLicense } from "@/server/admin/remote-license";

export const dynamic = "force-dynamic";

/** Lista todos os clientes registrados, com uso/licença ao vivo (best-effort
 * — uma instância fora do ar não derruba a lista das outras). */
export async function GET() {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const clients = await listAdminClients();
  const withStatus = await Promise.all(
    clients.map(async (c) => {
      try {
        const { license, usage } = await fetchRemoteLicense(c);
        return {
          id: c.id,
          name: c.name,
          baseUrl: c.baseUrl,
          contactWhatsapp: c.contactWhatsapp,
          contactEmail: c.contactEmail,
          reachable: true,
          license,
          usage,
        };
      } catch {
        return {
          id: c.id,
          name: c.name,
          baseUrl: c.baseUrl,
          contactWhatsapp: c.contactWhatsapp,
          contactEmail: c.contactEmail,
          reachable: false,
          license: null,
          usage: null,
        };
      }
    })
  );

  return Response.json({ clients: withStatus });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url(),
  contactWhatsapp: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().email().optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Registra um cliente novo e gera o segredo que vai pra env
 * `LICENSE_CONTROL_SECRET` da instância dele — devolvido só desta vez (não
 * fica reexibível depois, igual token/senha em qualquer outro lugar do produto). */
export async function POST(req: Request) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const internalSecret = generateClientSecret();
  const client = await registerAdminClient({
    name: body.data.name,
    baseUrl: body.data.baseUrl,
    internalSecret,
    contactWhatsapp: body.data.contactWhatsapp ?? null,
    contactEmail: body.data.contactEmail ?? null,
    notes: body.data.notes ?? null,
  });

  return Response.json(
    { client: { id: client.id, name: client.name, baseUrl: client.baseUrl }, internalSecret },
    { status: 201 }
  );
}
