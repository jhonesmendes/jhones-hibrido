import { describe, expect, it } from "vitest";
import { extractVariables, renderMessage } from "@/lib/campaigns/render";

describe("extractVariables", () => {
  it("extrai nomes únicos, na ordem de aparição", () => {
    expect(extractVariables("Olá {{nome}}, da {{empresa}}!")).toEqual([
      "nome",
      "empresa",
    ]);
  });

  it("sem variáveis → lista vazia", () => {
    expect(extractVariables("Olá, tudo bem?")).toEqual([]);
  });

  it("variável repetida aparece uma única vez", () => {
    expect(extractVariables("{{nome}}, {{nome}}!")).toEqual(["nome"]);
  });
});

describe("renderMessage", () => {
  it("substitui todas as variáveis pelos valores", () => {
    expect(
      renderMessage("Olá {{nome}}, da {{empresa}}!", {
        nome: "João",
        empresa: "XYZ",
      })
    ).toBe("Olá João, da XYZ!");
  });

  it("variável sem valor mantém o placeholder", () => {
    expect(renderMessage("Olá {{nome}}!", {})).toBe("Olá {{nome}}!");
  });
});
