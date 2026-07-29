import { ImageResponse } from "next/og";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon dinâmico por organização: usa o ícone enviado em Configurações →
 * Marca (data URI) quando existe; senão, gera a inicial do nome sobre a cor
 * de destaque — o mesmo fallback já usado no avatar da sidebar/login.
 * SVG não entra aqui: satori (motor do ImageResponse) não renderiza bem
 * `<img>` com data URI SVG, então cai no fallback de inicial.
 */
export default async function Icon() {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const logoIsRaster = branding.logo?.startsWith("data:image/svg") === false;

  if (branding.logo && logoIsRaster) {
    return new ImageResponse(
      (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logo}
          width={size.width}
          height={size.height}
          style={{ objectFit: "cover" }}
          alt=""
        />
      ),
      { ...size }
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
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {branding.name.charAt(0).toUpperCase()}
      </div>
    ),
    { ...size }
  );
}
