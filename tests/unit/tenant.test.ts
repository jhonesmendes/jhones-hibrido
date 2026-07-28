import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { scoped } from "@/lib/db/tenant";
import { schema } from "@/lib/db";

/**
 * FR-085: nenhuma query de domínio sem escopo de tenant. O helper `scoped`
 * é a única via de WHERE no código de domínio; aqui se verifica seu
 * contrato. O isolamento ao vivo é exercitado no E2E (uma única org por
 * instância + queries sempre scoped).
 */
describe("scoped (isolamento por organização)", () => {
  it("organizationId vazio lança — impossível uma query sem tenant", () => {
    expect(() => scoped(schema.contact.organizationId, "")).toThrow(
      /sem tenant/
    );
  });

  it("produz o filtro de organização sozinho", () => {
    const condition = scoped(schema.contact.organizationId, "org_a");
    expect(condition).toBeDefined();
  });

  it("combina a organização com condições extras (AND)", () => {
    const condition = scoped(
      schema.contact.organizationId,
      "org_a",
      eq(schema.contact.phone, "521551111"),
      undefined // condições opcionais são filtradas
    );
    expect(condition).toBeDefined();
    // o SQL gerado contém ambas as colunas unidas por AND
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain("organization_id");
    expect(query.sql).toContain("phone");
    expect(query.sql.toLowerCase()).toContain("and");
    expect(query.params).toContain("org_a");
  });
});
