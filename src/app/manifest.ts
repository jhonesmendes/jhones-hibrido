import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * Manifest PWA por organização (white-label): nome/ícone seguem o branding,
 * assim como o favicon dinâmico em `icon.tsx`. É isso que habilita o botão
 * "Instalar app" do Chrome — junto com o Service Worker (`public/sw.js`).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);

  return {
    name: `${branding.name} — CRM de WhatsApp`,
    short_name: branding.name,
    description: "CRM de WhatsApp com agente de IA e Laboratório de autoavaliação",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#0f1013",
    theme_color: branding.accent,
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
