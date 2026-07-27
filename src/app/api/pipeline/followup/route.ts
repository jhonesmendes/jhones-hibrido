import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  FollowupConfigError,
  getFollowupConfig,
  saveFollowupConfig,
} from "@/server/pipeline/followup";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const config = await getFollowupConfig(session.organizationId);
  return Response.json(config);
});

const putSchema = z.object({
  enabled: z.boolean(),
  triggerStageId: z.string().min(1).nullable(),
  intervalValue: z.number().int().min(1).max(720),
  intervalUnit: z.enum(["hours", "days"]),
  message: z.string().trim().max(1024).nullable(),
  successStageId: z.string().min(1).nullable(),
  expiredStageId: z.string().min(1).nullable(),
  requiresDocument: z.boolean(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  try {
    const config = await saveFollowupConfig(session.organizationId, body.data);
    return Response.json(config);
  } catch (err) {
    if (err instanceof FollowupConfigError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
});
