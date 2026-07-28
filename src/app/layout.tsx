import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
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
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return (
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <head>
        {/* Acento white-label injetado no SSR: sem flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
        {/* Tema claro/escuro/sistema aplicado ANTES da hidratação (sem flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var m=localStorage.getItem("vocero-theme");` +
              `var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);` +
              `if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
