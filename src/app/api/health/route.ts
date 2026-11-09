import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getBuildInfo } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  const build = getBuildInfo();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, ...build });
  } catch {
    return Response.json(
      {
        ok: false,
        ...build,
        error: { code: "db_unavailable", message: "Banco de dados indisponível" },
      },
      { status: 503 }
    );
  }
}
