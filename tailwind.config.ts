import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Los nombres semánticos existentes (background, primary, muted…) se remapean
 * a los tokens del sistema Atlas para que toda la app comparta el tema claro;
 * la escala `brand-*` expone el acento white-label.
 *
 * Cores baseadas em `var(--x)` puro (string literal) fazem o Tailwind
 * DESCARTAR silenciosamente qualquer classe com modificador de opacidade
 * (`bg-brand/70`, `bg-secondary/30`...) — ele precisa conseguir montar a cor
 * com o canal alfa embutido, e uma `var()` opaca não dá pra isso. O padrão
 * oficial do Tailwind resolve com `rgb(var(--x) / <alpha-value>)`, mas isso
 * exige reescrever toda variável pro formato "R G B" cru — quebraria o
 * branding.ts (que injeta essas variáveis em hex, por org/usuário) e todo
 * `var(--x)` usado direto em CSS/estilo inline fora do Tailwind. Em vez
 * disso, a função abaixo monta `color-mix()` (já usado em outro lugar deste
 * CSS, ver globals.css) — funciona com a variável do jeito que já está,
 * sem mudar nada em branding.ts.
 */
function withOpacity(variableName: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, var(${variableName}) ${Number(opacityValue) * 100}%, transparent)`;
    }
    return `var(${variableName})`;
  };
}

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // As tipagens do pacote `tailwindcss` não conhecem o padrão de função
      // pra cor com opacidade (é suportado em runtime, só não está no
      // `.d.ts`) — cast pontual, sem perder tipagem em nenhum outro lugar
      // do config.
      colors: {
        border: withOpacity("--border"),
        "border-strong": withOpacity("--border-strong"),
        input: withOpacity("--border-strong"),
        ring: withOpacity("--accent"),
        background: withOpacity("--bg"),
        foreground: withOpacity("--text"),
        subtle: withOpacity("--bg-subtle"),
        primary: {
          DEFAULT: withOpacity("--accent"),
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: withOpacity("--bg-panel"),
          foreground: withOpacity("--text-2"),
        },
        destructive: {
          DEFAULT: withOpacity("--danger"),
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: withOpacity("--bg-panel"),
          foreground: withOpacity("--text-3"),
        },
        accent: {
          DEFAULT: withOpacity("--bg-hover"),
          foreground: withOpacity("--text"),
        },
        card: {
          DEFAULT: withOpacity("--bg"),
          foreground: withOpacity("--text"),
        },
        popover: {
          DEFAULT: withOpacity("--bg"),
          foreground: withOpacity("--text"),
        },
        brand: {
          DEFAULT: withOpacity("--accent"),
          hover: withOpacity("--accent-hover"),
          soft: withOpacity("--accent-soft"),
          tint: withOpacity("--accent-tint"),
          text: withOpacity("--accent-text"),
        },
        "text-2": withOpacity("--text-2"),
        "text-3": withOpacity("--text-3"),
        "text-4": withOpacity("--text-4"),
        chat: withOpacity("--chat-bg"),
        "bubble-out": withOpacity("--bubble-out"),
        "bubble-out-text": withOpacity("--bubble-out-text"),
        success: withOpacity("--success"),
        warning: withOpacity("--warning"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Hanken Grotesk", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [animate],
};

export default config;
