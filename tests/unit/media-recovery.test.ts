import { describe, expect, it } from "vitest";
import { isRetryDue, RETRY_DELAYS_MS } from "@/server/inbox/media-recovery";

describe("isRetryDue (backoff da recuperação de mídia)", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("nunca tentou: tenta já", () => {
    expect(isRetryDue(0, null, now)).toBe(true);
  });

  it("respeita a espera da próxima tentativa", () => {
    expect(isRetryDue(1, ago(30_000), now)).toBe(false);
    expect(isRetryDue(1, ago(60_000), now)).toBe(true);
    expect(isRetryDue(3, ago(29 * 60_000), now)).toBe(false);
    expect(isRetryDue(3, ago(30 * 60_000), now)).toBe(true);
  });

  it("esgotou as tentativas automáticas: só sob demanda", () => {
    expect(isRetryDue(RETRY_DELAYS_MS.length, ago(365 * 24 * 60 * 60_000), now)).toBe(false);
  });
});
