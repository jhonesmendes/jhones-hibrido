import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAdminClient } from "@/server/admin/client-registry";
import {
  fetchRemoteBotMessages,
  RemoteBotMessagesError,
  saveRemoteBotMessages,
} from "@/server/admin/remote-bot-messages";
import { requireOperatorSession } from "@/server/admin/require-operator";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function remoteError(err: unknown): Response {
  if (err instanceof RemoteBotMessagesError) {
    return apiError(err.status, "remote_bot_messages_failed", err.message);
  }
  throw err;
}

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;
  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");
  try {
    return Response.json(await fetchRemoteBotMessages(client));
  } catch (err) {
    return remoteError(err);
  }
}

const putSchema = z.object({ messages: z.record(z.string(), z.string()) });

export async function PUT(req: Request, { params }: Params) {
  const denied = await requireOperatorSession();
  if (denied) return denied;
  const { id } = await params;
  const client = await getAdminClient(id);
  if (!client) return apiError(404, "not_found", "Cliente não encontrado");
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await saveRemoteBotMessages(client, body.data.messages));
  } catch (err) {
    return remoteError(err);
  }
}
