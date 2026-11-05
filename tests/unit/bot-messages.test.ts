import { describe, expect, it } from "vitest";
import { normalizeBotMessageValue } from "@/server/bot-messages/store";

describe("normalizeBotMessageValue", () => {
  it("troca o \\n literal da migração por quebra de linha real", () => {
    expect(normalizeBotMessageValue("Escolha:\\n01 - A\\n02 - B")).toBe("Escolha:\n01 - A\n02 - B");
  });

  it("mantém o texto que já tem quebra real", () => {
    expect(normalizeBotMessageValue("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  });
});
