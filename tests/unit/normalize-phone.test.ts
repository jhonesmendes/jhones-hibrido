import { describe, expect, it } from "vitest";
import { ensureBrNinthDigit, normalizePhoneInput } from "@/lib/utils";

describe("normalizePhoneInput", () => {
  it("DDD + celular com 9 dígitos, sem código do país: adiciona 55", () => {
    expect(normalizePhoneInput("66 99967-9169")).toBe("5566999679169");
  });

  it("DDD + celular sem o 9º dígito, sem código do país: adiciona 55 e o 9", () => {
    expect(normalizePhoneInput("66 9967-9169")).toBe("5566999679169");
  });

  it("com código do país e já com o 9º dígito: devolve como está", () => {
    expect(normalizePhoneInput("55 66 99967-9169")).toBe("5566999679169");
  });

  it("com código do país mas sem o 9º dígito: insere o 9", () => {
    expect(normalizePhoneInput("55 66 9967-9169")).toBe("5566999679169");
  });

  it("número de outro país, formato claramente distinto do BR: devolve os dígitos sem alterar", () => {
    expect(normalizePhoneInput("+54 9 11 2233-4455")).toBe("5491122334455");
  });

  it("texto com letras não vira telefone", () => {
    expect(normalizePhoneInput("João Silva")).toBeNull();
  });

  it("muito curto não vira telefone", () => {
    expect(normalizePhoneInput("12345")).toBeNull();
  });
});

describe("ensureBrNinthDigit", () => {
  it("BR de 12 dígitos sem o 9º: insere o 9", () => {
    expect(ensureBrNinthDigit("556699679169")).toBe("5566999679169");
  });

  it("BR já com os 13 dígitos: devolve como está", () => {
    expect(ensureBrNinthDigit("5566999679169")).toBe("5566999679169");
  });

  it("não-BR (não começa com 55): devolve como está", () => {
    expect(ensureBrNinthDigit("14155552671")).toBe("14155552671");
  });
});
