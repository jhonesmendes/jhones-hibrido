/**
 * White-label: nome do CRM + acento por organização.
 * Presets sóbrios do sistema Atlas; para uma cor personalizada, derivam-se
 * hover/soft/tint/text e garante-se contraste com texto branco.
 */

export type AccentSet = {
  accent: string;
  hover: string;
  soft: string;
  tint: string;
  text: string;
};

export type Branding = {
  name: string;
  accent: string; // hex do acento base escolhido
  /** Logo do cliente (data URI) — substitui a inicial do nome no avatar. */
  logo: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  name: "Vocero",
  accent: "#3f5972",
  logo: null,
};

/** ~180KB em base64 — suficiente pra um ícone, sem inchar a linha da org. */
export const MAX_LOGO_DATA_URI_LENGTH = 240_000;

const LOGO_DATA_URI_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/;

export function isValidLogoDataUri(value: string): boolean {
  return (
    LOGO_DATA_URI_RE.test(value) && value.length <= MAX_LOGO_DATA_URI_LENGTH
  );
}

/** Presets do handoff (valores exatos). */
export const ACCENT_PRESETS: Record<string, { label: string; set: AccentSet }> = {
  "#3f5972": {
    label: "Azul aço",
    set: { accent: "#3f5972", hover: "#334a60", soft: "#dde5ee", tint: "#f3f6f9", text: "#2b4056" },
  },
  "#4b5563": {
    label: "Grafite",
    set: { accent: "#4b5563", hover: "#3b4350", soft: "#e2e5ea", tint: "#f4f5f7", text: "#333a45" },
  },
  "#3f6b66": {
    label: "Verde desbotado",
    set: { accent: "#3f6b66", hover: "#335752", soft: "#dcebe8", tint: "#f2f8f6", text: "#2b4a46" },
  },
  "#5f5470": {
    label: "Ameixa",
    set: { accent: "#5f5470", hover: "#4d4459", soft: "#e6e1ec", tint: "#f6f4f8", text: "#443c52" },
  },
};

type Rgb = { r: number; g: number; b: number };

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mistura `color` em direção a `target` na proporção t (0..1). */
function mix(color: Rgb, target: Rgb, t: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * t,
    g: color.g + (target.g - color.g) * t,
    b: color.b + (target.b - color.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Luminância relativa (WCAG). */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Escurece até ter contraste ≥ 3:1 com branco (base clara demais deixaria
 * texto branco ilegível em cima) — mesma regra pro org e pro pessoal. */
function ensureContrast(base: Rgb): Rgb {
  let out = base;
  while (1.05 / (luminance(out) + 0.05) < 3 && luminance(out) > 0.005) {
    out = mix(out, BLACK, 0.12);
  }
  return out;
}

function deriveAccentSet(base: Rgb): AccentSet {
  const safe = ensureContrast(base);
  return {
    accent: rgbToHex(safe),
    hover: rgbToHex(mix(safe, BLACK, 0.16)),
    soft: rgbToHex(mix(safe, WHITE, 0.82)),
    tint: rgbToHex(mix(safe, WHITE, 0.94)),
    text: rgbToHex(mix(safe, BLACK, 0.28)),
  };
}

/**
 * Conjunto completo para qualquer acento: preset exato se existir; senão, se
 * deriva. Uma base clara demais (texto branco ilegível sobre ela) é escurecida
 * até contraste ≥ 3:1 com branco.
 */
export function resolveAccentSet(accentHex: string): AccentSet {
  const preset = ACCENT_PRESETS[accentHex.toLowerCase()];
  if (preset) return preset.set;
  if (!isValidHex(accentHex)) return ACCENT_PRESETS["#3f5972"]!.set;
  return deriveAccentSet(hexToRgb(accentHex.toLowerCase()));
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** 30 (suave) a 100 (vibrante) — escala a saturação da cor escolhida antes
 * de derivar hover/soft/tint/text, mesma matemática de contraste do
 * acento da organização. Diferente do org (que usa os 4 presets exatos
 * "de mão" quando bate), o pessoal sempre deriva pela roda de cor — é
 * assim que a intensidade consegue enfraquecer/reforçar até um preset. */
export function resolvePersonalAccentSet(accentHex: string, intensity = 75): AccentSet {
  const hex = isValidHex(accentHex) ? accentHex.toLowerCase() : "#3f5972";
  const hsl = rgbToHsl(hexToRgb(hex));
  const scale = Math.max(30, Math.min(100, intensity)) / 100;
  const scaled = hslToRgb({ ...hsl, s: hsl.s * scale });
  return deriveAccentSet(scaled);
}

const DARK_BG: Rgb = { r: 0x13, g: 0x14, b: 0x17 }; // #131417, ver globals.css .dark

/** Mesmo matiz do claro, superfícies misturadas com o fundo escuro e texto
 * clareado pra manter contraste — compartilhado pelo org e pelo pessoal. */
function deriveDarkFromLight(light: AccentSet): AccentSet {
  const base = hexToRgb(light.accent);
  return {
    accent: rgbToHex(mix(base, WHITE, 0.08)),
    hover: rgbToHex(mix(base, WHITE, 0.2)),
    soft: rgbToHex(mix(base, DARK_BG, 0.6)),
    tint: rgbToHex(mix(base, DARK_BG, 0.8)),
    text: rgbToHex(mix(base, WHITE, 0.62)),
  };
}

/**
 * Variante escura do acento: mesmo matiz, superfícies misturadas com o
 * fundo escuro e texto clareado para manter contraste.
 */
export function resolveDarkAccentSet(accentHex: string): AccentSet {
  return deriveDarkFromLight(resolveAccentSet(accentHex));
}

/** Variante escura do acento pessoal — mesma intensidade aplicada. */
export function resolveDarkPersonalAccentSet(accentHex: string, intensity = 75): AccentSet {
  return deriveDarkFromLight(resolvePersonalAccentSet(accentHex, intensity));
}

/** CSS de variáveis para injetar no <head> (SSR, sem flash). */
export function accentCssVariables(accentHex: string): string {
  const s = resolveAccentSet(accentHex);
  const d = resolveDarkAccentSet(accentHex);
  return (
    `:root{--accent:${s.accent};--accent-hover:${s.hover};--accent-soft:${s.soft};--accent-tint:${s.tint};--accent-text:${s.text};}` +
    `.dark{--accent:${d.accent};--accent-hover:${d.hover};--accent-soft:${d.soft};--accent-tint:${d.tint};--accent-text:${d.text};}`
  );
}

/** CSS de variáveis do acento PESSOAL — mesma forma do `accentCssVariables`
 * da organização, mas injetado DEPOIS dele no `<head>` (ver layout.tsx),
 * então vence por ordem de cascata quando o membro tiver escolhido um. */
export function personalAccentCssVariables(accentHex: string, intensity = 75): string {
  const s = resolvePersonalAccentSet(accentHex, intensity);
  const d = resolveDarkPersonalAccentSet(accentHex, intensity);
  return (
    `:root{--accent:${s.accent};--accent-hover:${s.hover};--accent-soft:${s.soft};--accent-tint:${s.tint};--accent-text:${s.text};}` +
    `.dark{--accent:${d.accent};--accent-hover:${d.hover};--accent-soft:${d.soft};--accent-tint:${d.tint};--accent-text:${d.text};}`
  );
}

/** 8 cores vivas pra escolha PESSOAL — deliberadamente mais vibrantes que
 * os 4 presets sóbrios da organização acima (esses são pensados pra
 * marca/white-label; aqui é gosto de cada um, então pode ser mais ousado). */
export const PERSONAL_ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: "Azul", hex: "#2563eb" },
  { label: "Violeta", hex: "#7c3aed" },
  { label: "Verde-azulado", hex: "#0d9488" },
  { label: "Verde", hex: "#16a34a" },
  { label: "Âmbar", hex: "#d97706" },
  { label: "Coral", hex: "#e05a3a" },
  { label: "Rosa", hex: "#db2777" },
  { label: "Cinza", hex: "#64748b" },
];

/** Presets do fundo do painel de conversa — cor "pura" na intensidade
 * máxima; o slider de intensidade mistura em direção ao neutro do tema. */
export const CHAT_BG_PRESETS: Record<string, { label: string; hex: string }> = {
  warm: { label: "Quente", hex: "#fdf8f0" },
  cool: { label: "Frio", hex: "#f0f4fd" },
  stone: { label: "Pedra", hex: "#f5f3ee" },
  forest: { label: "Floresta", hex: "#f0f5f1" },
};

const CHAT_BG_LIGHT: Rgb = { r: 0xf4, g: 0xf5, b: 0xf7 }; // #f4f5f7, ver globals.css :root
const CHAT_BG_DARK: Rgb = { r: 0x0f, g: 0x10, b: 0x13 }; // #0f1013, ver globals.css .dark

/**
 * `bg` é um preset (`warm`/`cool`/`stone`/`forest`) ou hex customizado
 * (`#rrggbb`); `null`/`"default"`/inválido = sem override, usa o `--chat-bg`
 * normal do tema. No escuro a mistura é mais fraca (a cor "crua" ficaria
 * berrante/suja sobre um fundo quase preto) — mesma ideia de
 * `deriveDarkFromLight`, só que aplicada a uma superfície, não a um acento.
 */
export function resolveChatBgHex(
  bg: string | null | undefined,
  intensity: number,
  dark: boolean
): string | null {
  if (!bg || bg === "default") return null;
  const raw = CHAT_BG_PRESETS[bg]?.hex ?? bg;
  if (!isValidHex(raw)) return null;
  const target = hexToRgb(raw);
  const pct = Math.max(0, Math.min(100, intensity)) / 100;
  const base = dark ? CHAT_BG_DARK : CHAT_BG_LIGHT;
  const factor = dark ? pct * 0.4 : pct; // ver comentário acima
  return rgbToHex(mix(base, target, factor));
}

/** CSS de variáveis do fundo do painel — mesmo esquema dos acentos:
 * `null` quando `bg` é "default"/vazio, então não gera `<style>` nenhum
 * (o chamador decide não renderizar a tag nesse caso). */
export function chatBgCssVariables(bg: string, intensity = 40): string | null {
  const light = resolveChatBgHex(bg, intensity, false);
  const darkHex = resolveChatBgHex(bg, intensity, true);
  if (!light || !darkHex) return null;
  return `:root{--chat-bg:${light};}.dark{--chat-bg:${darkHex};}`;
}

export function normalizeBranding(input: Partial<Branding> | null): Branding {
  const name = input?.name?.trim().slice(0, 30) || DEFAULT_BRANDING.name;
  const accent =
    input?.accent && isValidHex(input.accent)
      ? input.accent.toLowerCase()
      : DEFAULT_BRANDING.accent;
  const logo =
    input?.logo && isValidLogoDataUri(input.logo) ? input.logo : null;
  return { name, accent, logo };
}
