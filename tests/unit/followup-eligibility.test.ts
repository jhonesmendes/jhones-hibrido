import { describe, expect, it } from "vitest";
import {
  intervalToMs,
  isEligibleForExpiry,
  isEligibleForReminder,
  respondedAfterSend,
} from "@/server/pipeline/followup-eligibility";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-07-26T12:00:00Z");

describe("intervalToMs", () => {
  it("horas", () => {
    expect(intervalToMs(4, "hours")).toBe(4 * HOUR);
  });
  it("dias", () => {
    expect(intervalToMs(2, "days")).toBe(2 * 24 * HOUR);
  });
});

describe("isEligibleForReminder", () => {
  it("lead inactivo más del intervalo, sin recordatorio activo → elegible", () => {
    const lead = { lastActivityAt: new Date(now.getTime() - 5 * HOUR) };
    expect(isEligibleForReminder(lead, null, 4 * HOUR, now)).toBe(true);
  });

  it("lead inactivo menos del intervalo → no elegible", () => {
    const lead = { lastActivityAt: new Date(now.getTime() - 2 * HOUR) };
    expect(isEligibleForReminder(lead, null, 4 * HOUR, now)).toBe(false);
  });

  it("ya tiene un recordatorio activo (status sent) → no elegible", () => {
    const lead = { lastActivityAt: new Date(now.getTime() - 5 * HOUR) };
    const lastSend = { status: "sent" as const, sentAt: new Date(now.getTime() - HOUR) };
    expect(isEligibleForReminder(lead, lastSend, 4 * HOUR, now)).toBe(false);
  });

  it("recordatorio anterior ya resuelto (expired/cancelled) → vuelve a ser elegible", () => {
    const lead = { lastActivityAt: new Date(now.getTime() - 5 * HOUR) };
    const lastSend = { status: "expired" as const, sentAt: new Date(now.getTime() - 20 * HOUR) };
    expect(isEligibleForReminder(lead, lastSend, 4 * HOUR, now)).toBe(true);
  });

  it("sin actividad registrada nunca → no elegible", () => {
    expect(isEligibleForReminder({ lastActivityAt: null }, null, 4 * HOUR, now)).toBe(
      false
    );
  });
});

describe("respondedAfterSend", () => {
  it("el cliente respondió después del recordatorio → true", () => {
    const lastSend = { status: "sent" as const, sentAt: new Date(now.getTime() - 3 * HOUR) };
    const lead = { lastActivityAt: new Date(now.getTime() - HOUR) };
    expect(respondedAfterSend(lead, lastSend)).toBe(true);
  });

  it("el cliente no respondió desde el recordatorio → false", () => {
    const lastSend = { status: "sent" as const, sentAt: new Date(now.getTime() - HOUR) };
    const lead = { lastActivityAt: new Date(now.getTime() - 3 * HOUR) };
    expect(respondedAfterSend(lead, lastSend)).toBe(false);
  });

  it("sin recordatorio activo → false", () => {
    expect(respondedAfterSend({ lastActivityAt: now }, null)).toBe(false);
  });
});

describe("isEligibleForExpiry", () => {
  it("recordatorio activo venció el plazo de gracia → elegible para expirar", () => {
    const lastSend = { status: "sent" as const, sentAt: new Date(now.getTime() - 5 * HOUR) };
    expect(isEligibleForExpiry(lastSend, 4 * HOUR, now)).toBe(true);
  });

  it("todavía dentro del plazo de gracia → no elegible", () => {
    const lastSend = { status: "sent" as const, sentAt: new Date(now.getTime() - 2 * HOUR) };
    expect(isEligibleForExpiry(lastSend, 4 * HOUR, now)).toBe(false);
  });

  it("sin recordatorio activo → no elegible", () => {
    expect(isEligibleForExpiry(null, 4 * HOUR, now)).toBe(false);
  });

  it("recordatorio ya resuelto (cancelled) → no elegible", () => {
    const lastSend = { status: "cancelled" as const, sentAt: new Date(now.getTime() - 10 * HOUR) };
    expect(isEligibleForExpiry(lastSend, 4 * HOUR, now)).toBe(false);
  });
});
