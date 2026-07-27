import { describe, expect, it } from "vitest";
import { parseRecipientsCsv } from "@/lib/campaigns/csv";

describe("parseRecipientsCsv", () => {
  it("linhas válidas com variáveis nomeadas", () => {
    const csv =
      "telefone,nome,empresa\n5511999999999,João,XYZ\n5521888888888,Maria,ABC";
    const result = parseRecipientsCsv(csv);
    expect(result.validRows).toHaveLength(2);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.variableNames).toEqual(["nome", "empresa"]);
    expect(result.validRows[0]).toEqual({
      phone: "5511999999999",
      variables: { nome: "João", empresa: "XYZ" },
      variablesOrdered: ["João", "XYZ"],
    });
  });

  it("telefone inválido vira linha inválida sem bloquear as demais", () => {
    const csv = "telefone,nome\nabc,João\n5511999999999,Maria";
    const result = parseRecipientsCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]?.line).toBe(2);
  });

  it("CSV vazio → sem linhas válidas nem inválidas", () => {
    expect(parseRecipientsCsv("")).toEqual({
      validRows: [],
      invalidRows: [],
      variableNames: [],
    });
  });

  it("só cabeçalho, sem linhas de dados", () => {
    const result = parseRecipientsCsv("telefone,nome");
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(0);
  });

  it("telefone de 10-11 dígitos ganha o prefixo 55 (normalização compartilhada)", () => {
    const result = parseRecipientsCsv("telefone\n11987654321");
    expect(result.validRows[0]?.phone).toBe("5511987654321");
  });

  it("célula entre aspas com vírgula não quebra o parse", () => {
    const csv = 'telefone,empresa\n5511999999999,"Transportes, XYZ"';
    const result = parseRecipientsCsv(csv);
    expect(result.validRows[0]?.variables.empresa).toBe("Transportes, XYZ");
  });
});
