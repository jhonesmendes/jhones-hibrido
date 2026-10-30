import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMetaMedia } from "@/lib/meta/client";

function stubFetch(body: string | Buffer, contentType: string, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(new Uint8Array(Buffer.from(body)), {
      status,
      headers: { "Content-Type": contentType },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("downloadMetaMedia", () => {
  it("devolve os bytes da mídia e manda User-Agent + Bearer", async () => {
    const fetchMock = stubFetch(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg");
    const buf = await downloadMetaMedia("https://lookaside.example/m", "tok");
    expect([...buf]).toEqual([0xff, 0xd8, 0xff]);
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["User-Agent"]).toBeTruthy();
  });

  it("página de erro HTML com status 200 NÃO é aceita como mídia", async () => {
    stubFetch("<!DOCTYPE html><html>Sorry, something went wrong</html>", "text/html; charset=utf-8");
    await expect(downloadMetaMedia("https://lookaside.example/m", "tok")).rejects.toThrow(/text\/html/);
  });

  it("erro JSON com status 200 NÃO é aceito como mídia", async () => {
    stubFetch('{"error":{"message":"x"}}', "application/json");
    await expect(downloadMetaMedia("https://lookaside.example/m", "tok")).rejects.toThrow(/application\/json/);
  });

  it("corpo vazio é falha", async () => {
    stubFetch("", "image/jpeg");
    await expect(downloadMetaMedia("https://lookaside.example/m", "tok")).rejects.toThrow(/vazia/);
  });
});
