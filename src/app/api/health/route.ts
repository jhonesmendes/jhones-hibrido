import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: { code: "db_unavailable", message: "Banco de dados indisponível" } },
      { status: 503 }
    );
  }
}
