import { ImageResponse } from "next/og";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

const SIZE = 192;

/** Ícone PWA 192x192 (manifest.ts) — mesma lógica de branding do favicon
 * dinâmico em `icon.tsx`, em resolução maior para instalação do app. */
export async function GET() {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const logoIsRaster = branding.logo?.startsWith("data:image/svg") === false;

  if (branding.logo && logoIsRaster) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: branding.accent,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logo}
            width={SIZE}
            height={SIZE}
            style={{ objectFit: "cover" }}
            alt=""
          />
        </div>
      ),
      { width: SIZE, height: SIZE }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: branding.accent,
          color: "white",
          fontSize: 96,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {branding.name.charAt(0).toUpperCase()}
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}
