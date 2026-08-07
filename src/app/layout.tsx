import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import {
  accentCssVariables,
  chatBgCssVariables,
  DEFAULT_BRANDING,
  personalAccentCssVariables,
} from "@/lib/branding";
import { getBranding, getMemberAppearance } from "@/server/branding";
import { getSessionOrNull } from "@/lib/auth/session";
import "./globals.css";

// next/font baixa a fonte no BUILD e a serve self-hosted (sem CDN).
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return {
    title: `${branding.name} — CRM de WhatsApp`,
    description: "CRM de WhatsApp com agente de IA e Laboratório de autoavaliação",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: branding.name },
    // `icon` precisa ser repetido aqui: definir `icons` explicitamente
    // suprime o <link rel="icon"> que o Next injetaria sozinho a partir de
    // `icon.tsx` (convenção de arquivo) — sem isso o favicon some.
    icons: { icon: "/icon", apple: "/icon-192" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: branding.accent,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const session = await getSessionOrNull().catch(() => null);
  const appearance = await getMemberAppearance(session?.memberId).catch(() => null);

  return (
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <head>
        {/* Acento white-label injetado no SSR: sem flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
        {/* Acento PESSOAL do membro logado — injetado DEPOIS do da org, então
            vence na cascata quando o membro escolheu o dele (sem flash, o
            servidor já sabe na primeira resposta). */}
        {appearance?.accentHex && (
          <style
            dangerouslySetInnerHTML={{
              __html: personalAccentCssVariables(
                appearance.accentHex,
                appearance.accentIntensity ?? 75
              ),
            }}
          />
        )}
        {/* Fundo pessoal do painel de conversa — mesma ideia do acento acima. */}
        {appearance?.chatBg &&
          (() => {
            const css = chatBgCssVariables(appearance.chatBg, appearance.chatBgIntensity ?? 40);
            return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
          })()}
        {/* Tema claro/escuro/sistema aplicado ANTES da hidratação (sem flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var m=localStorage.getItem("vocero-theme");` +
              `var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);` +
              `if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
        {/* Textura do fundo de mensagens (dots/grid/diagonal/plain): aplicada
            ANTES da hidratação para não piscar a textura padrão. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var w=localStorage.getItem("vocero-chat-wallpaper");` +
              `if(w&&w!=="icons")document.documentElement.setAttribute("data-wallpaper",w);}catch(e){}})();`,
          }}
        />
        {/* Sidebar recolhível: idem, aplicada ANTES da hidratação (ver
            comentário da regra @media em globals.css). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var c=localStorage.getItem("vocero-nav-collapsed");` +
              `if(c==="1")document.documentElement.setAttribute("data-nav-collapsed","1");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
