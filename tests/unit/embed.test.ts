import { describe, expect, it } from "vitest";
import {
  framingHeaders,
  iframeCookiesEnabled,
  parseEmbedOrigins,
  resolveEmbedMode,
} from "@/lib/embed";

describe("parseEmbedOrigins", () => {
  it("aceita https, curinga de subdomínio e localhost; normaliza", () => {
    const r = parseEmbedOrigins(
      " https://ERP.cliente.com.br/ , https://*.sankhyacloud.com.br https://erp.cliente.com.br,http://localhost:8080"
    );
    expect(r.valid).toEqual([
      "https://erp.cliente.com.br",
      "https://*.sankhyacloud.com.br",
      "http://localhost:8080",
    ]);
    expect(r.invalid).toEqual([]);
  });

  it("recusa http público, caminho, curinga solto e lixo", () => {
    const r = parseEmbedOrigins("http://erp.cliente.com.br https://a.com/painel * 'self' javascript:alert(1)");
    expect(r.valid).toEqual([]);
    expect(r.invalid).toHaveLength(5);
  });

  it("vazio ou ausente → nenhuma origem", () => {
    expect(parseEmbedOrigins(undefined).valid).toEqual([]);
    expect(parseEmbedOrigins("  ").valid).toEqual([]);
  });
});

describe("framingHeaders", () => {
  it("sem origens: só o próprio Vocero, com X-Frame-Options", () => {
    expect(framingHeaders({ origins: [], adminHost: false })).toEqual({
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    });
  });

  it("com origens: lista no CSP e sem X-Frame-Options", () => {
    expect(framingHeaders({ origins: ["https://erp.x.com"], adminHost: false })).toEqual({
      "Content-Security-Policy": "frame-ancestors 'self' https://erp.x.com",
    });
  });

  it("painel do operador nunca é embutido, mesmo com origens", () => {
    expect(framingHeaders({ origins: ["https://erp.x.com"], adminHost: true })).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    });
  });
});

describe("iframeCookiesEnabled", () => {
  it("exige origens e https (ou localhost)", () => {
    expect(iframeCookiesEnabled([], "https://crm.x.com")).toBe(false);
    expect(iframeCookiesEnabled(["https://erp.x.com"], "https://crm.x.com")).toBe(true);
    expect(iframeCookiesEnabled(["https://erp.x.com"], "http://crm.x.com")).toBe(false);
    expect(iframeCookiesEnabled(["http://erp.test"], "http://localhost:3000")).toBe(true);
    expect(iframeCookiesEnabled(["https://erp.x.com"], "não-é-url")).toBe(false);
  });
});

describe("resolveEmbedMode", () => {
  it("?embed=1 liga e grava o cookie só se ainda não existe", () => {
    expect(resolveEmbedMode("1", undefined)).toEqual({ embed: true, setCookie: "on" });
    expect(resolveEmbedMode("1", "1")).toEqual({ embed: true, setCookie: null });
  });
  it("?embed=0 desliga e apaga", () => {
    expect(resolveEmbedMode("0", "1")).toEqual({ embed: false, setCookie: "off" });
    expect(resolveEmbedMode("0", undefined)).toEqual({ embed: false, setCookie: null });
  });
  it("sem parâmetro segue o cookie", () => {
    expect(resolveEmbedMode(null, "1")).toEqual({ embed: true, setCookie: null });
    expect(resolveEmbedMode(null, undefined)).toEqual({ embed: false, setCookie: null });
  });
});
