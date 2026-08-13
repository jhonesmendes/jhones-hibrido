import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireOperatorSession } from "@/server/admin/require-operator";
import {
  deleteAdminClient,
  getAdminClient,
  updateAdminClient,
} from "@/server/admin/client-registry";
import { fetchRemoteLicense } from "@/server/admin/remote-license";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  let license = null;
  let usage = null;
  let reachable = true;
  let fetchError: string | null = null;
  try {
    const result = await fetchRemoteLicense(client);
    license = result.license;
    usage = result.usage;
  } catch (err) {
    reachable = false;
    fetchError = err instanceof Error ? err.message : "Erro desconhecido";
  }

  return Response.json({
    client: {
      id: client.id,
      name: client.name,
      baseUrl: client.baseUrl,
      contactWhatsapp: client.contactWhatsapp,
      contactEmail: client.contactEmail,
      notes: client.notes,
      createdAt: client.createdAt.toISOString(),
    },
    reachable,
    fetchError,
    license,
    usage,
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().trim().url().optional(),
  contactWhatsapp: z.string().trim().max(30).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  await updateAdminClient(id, body.data);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;

  const { id } = await params;
  await deleteAdminClient(id);
  return Response.json({ ok: true });
}
