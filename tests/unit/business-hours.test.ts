import { describe, expect, it } from "vitest";
import { isWithinBusinessHours } from "@/server/queue/business-hours";

/** Sprint Q4 (gap #6 resolvido): horário de funcionamento por departamento. */

describe("isWithinBusinessHours", () => {
  it("sem configuração: sempre aberto (não trava quem nunca configurou)", () => {
    expect(isWithinBusinessHours(null, "America/Sao_Paulo", new Date())).toBe(true);
    expect(isWithinBusinessHours(undefined, "America/Sao_Paulo", new Date())).toBe(true);
  });

  it("dentro do horário configurado: aberto", () => {
    // Segunda-feira, 10:00 UTC-3 (São Paulo) → 2024-01-08 é uma segunda.
    const monday10am = new Date("2024-01-08T13:00:00Z"); // 10:00 em America/Sao_Paulo (UTC-3)
    const hours = { mon: { enabled: true, start: "08:00", end: "18:00" } };
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", monday10am)).toBe(true);
  });

  it("fora do horário (antes de abrir): fechado", () => {
    const monday6am = new Date("2024-01-08T09:00:00Z"); // 06:00 em America/Sao_Paulo
    const hours = { mon: { enabled: true, start: "08:00", end: "18:00" } };
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", monday6am)).toBe(false);
  });

  it("fora do horário (depois de fechar): fechado", () => {
    const mondayNight = new Date("2024-01-08T23:00:00Z"); // 20:00 em America/Sao_Paulo
    const hours = { mon: { enabled: true, start: "08:00", end: "18:00" } };
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", mondayNight)).toBe(false);
  });

  it("dia sem configuração (ex.: domingo não definido): fechado", () => {
    const sunday = new Date("2024-01-07T13:00:00Z"); // domingo, 10:00 em SP
    const hours = { mon: { enabled: true, start: "08:00", end: "18:00" } };
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", sunday)).toBe(false);
  });

  it("dia configurado mas enabled:false: fechado", () => {
    const monday10am = new Date("2024-01-08T13:00:00Z");
    const hours = { mon: { enabled: false, start: "08:00", end: "18:00" } };
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", monday10am)).toBe(false);
  });

  it("respeita o fuso horário — mesmo instante, fusos diferentes podem dar resultados diferentes", () => {
    // 2024-01-08T23:30:00Z → 20:30 em São Paulo (UTC-3, fechado às 18h)
    // mas só 19:30 em Rio Branco (UTC-4, ainda fechado às 18h também) —
    // vamos comparar com um fuso bem adiantado: Noronha (UTC-2) → 21:30.
    const instant = new Date("2024-01-08T20:30:00Z");
    const hours = { mon: { enabled: true, start: "08:00", end: "18:00" } };
    // São Paulo (UTC-3): 17:30 → dentro do horário (antes das 18h)
    expect(isWithinBusinessHours(hours, "America/Sao_Paulo", instant)).toBe(true);
    // Noronha (UTC-2): 18:30 → fora do horário (depois das 18h)
    expect(isWithinBusinessHours(hours, "America/Noronha", instant)).toBe(false);
  });
});
