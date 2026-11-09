import { getRegistrationState } from "@/server/auth/registration";

export const dynamic = "force-dynamic";

/** Estado público do cadastro (usado pelo /register para escolher a tela). */
export async function GET() {
  return Response.json({ state: await getRegistrationState() });
}
