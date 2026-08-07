import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  CHAT_BG_PRESETS,
  chatBgCssVariables,
  isValidHex,
  normalizeBranding,
  personalAccentCssVariables,
  resolveAccentSet,
  resolveChatBgHex,
  resolveDarkPersonalAccentSet,
  resolvePersonalAccentSet,
} from "@/lib/branding";

describe("white-label: acento", () => {
  it("preset devuelve el set exacto del handoff", () => {
    expect(resolveAccentSet("#3f5972")).toEqual(ACCENT_PRESETS["#3f5972"]!.set);
    expect(resolveAccentSet("#5f5470").soft).toBe("#e6e1ec");
  });

  it("color personalizado deriva hover/soft/tint/text", () => {
    const s = resolveAccentSet("#7a3b5e");
    expect(isValidHex(s.hover)).toBe(true);
    expect(isValidHex(s.soft)).toBe(true);
    expect(isValidHex(s.tint)).toBe(true);
    expect(s.hover).not.toBe(s.accent);
  });

  it("color demasiado claro se oscurece para contraste con texto blanco", () => {
    const s = resolveAccentSet("#ffee88"); // amarillo pálido, ilegible con blanco
    expect(s.accent).not.toBe("#ffee88");
    // el resultado debe ser notablemente más oscuro
    const lum = parseInt(s.accent.slice(1, 3), 16);
    expect(lum).toBeLessThan(0xd0);
  });

  it("hex inválido cae al default", () => {
    expect(resolveAccentSet("rojo")).toEqual(ACCENT_PRESETS["#3f5972"]!.set);
  });
});

describe("aparência pessoal: acento com intensidade", () => {
  it("intensidade 100 e um preset da org batem no mesmo tom (sempre deriva pela roda de cor)", () => {
    const s = resolvePersonalAccentSet("#2563eb", 100);
    expect(isValidHex(s.accent)).toBe(true);
    expect(isValidHex(s.hover)).toBe(true);
  });

  it("intensidade menor enfraquece a saturação — cor final mais próxima do cinza", () => {
    const vibrant = resolvePersonalAccentSet("#2563eb", 100);
    const soft = resolvePersonalAccentSet("#2563eb", 30);
    expect(soft.accent).not.toBe(vibrant.accent);
  });

  it("hex inválido cai no azul aço padrão", () => {
    const s = resolvePersonalAccentSet("nope", 75);
    expect(s).toEqual(resolvePersonalAccentSet("#3f5972", 75));
  });

  it("variante escura muda pelo menos o accent em relação à clara", () => {
    const light = resolvePersonalAccentSet("#16a34a", 75);
    const dark = resolveDarkPersonalAccentSet("#16a34a", 75);
    expect(dark.accent).not.toBe(light.accent);
  });

  it("CSS gerado tem :root e .dark com --accent", () => {
    const css = personalAccentCssVariables("#db2777", 75);
    expect(css).toContain(":root{--accent:");
    expect(css).toContain(".dark{--accent:");
  });
});

describe("aparência pessoal: fundo do painel de conversa", () => {
  it("'default' ou vazio: sem override (null)", () => {
    expect(resolveChatBgHex("default", 40, false)).toBeNull();
    expect(resolveChatBgHex(null, 40, false)).toBeNull();
    expect(resolveChatBgHex(undefined, 40, false)).toBeNull();
  });

  it("preset conhecido resolve pra um hex válido, claro e escuro", () => {
    const light = resolveChatBgHex("warm", 100, false);
    const dark = resolveChatBgHex("warm", 100, true);
    expect(light).not.toBeNull();
    expect(dark).not.toBeNull();
    expect(isValidHex(light!)).toBe(true);
    expect(isValidHex(dark!)).toBe(true);
    expect(light).not.toBe(dark); // bases claro/escuro diferentes
  });

  it("hex customizado também é aceito diretamente", () => {
    expect(resolveChatBgHex("#123456", 100, false)).not.toBeNull();
  });

  it("intensidade 0 fica no neutro base (sem mistura visível da cor escolhida)", () => {
    const neutral = resolveChatBgHex(CHAT_BG_PRESETS.warm!.hex, 0, false);
    // com fator 0, o resultado deve ser exatamente o neutro base claro (#f4f5f7)
    expect(neutral).toBe("#f4f5f7");
  });

  it("chatBgCssVariables: null quando não há override, string com :root/.dark quando há", () => {
    expect(chatBgCssVariables("default", 40)).toBeNull();
    const css = chatBgCssVariables("cool", 40);
    expect(css).toContain(":root{--chat-bg:");
    expect(css).toContain(".dark{--chat-bg:");
  });
});

describe("white-label: normalización", () => {
  it("nombre vacío o nulo → default 'Vocero'; se recorta a 30", () => {
    expect(normalizeBranding(null).name).toBe("Vocero");
    expect(normalizeBranding({ name: "   " }).name).toBe("Vocero");
    expect(normalizeBranding({ name: "x".repeat(50) }).name).toHaveLength(30);
  });

  it("acento inválido → default", () => {
    expect(normalizeBranding({ accent: "azul" }).accent).toBe("#3f5972");
    expect(normalizeBranding({ accent: "#3F6B66" }).accent).toBe("#3f6b66");
  });
});
