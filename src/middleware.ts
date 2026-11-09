import { NextResponse, type NextRequest } from "next/server";
import {
  EMBED_COOKIE,
  EMBED_HEADER,
  framingHeaders,
  iframeCookiesEnabled,
  parseEmbedOrigins,
  resolveEmbedMode,
} from "@/lib/embed";

/**
 * Roteamento por domínio entre "instância de cliente" (comportamento normal,
 * inalterado) e "painel central do operador" (`/admin/*`) — as duas coisas
 * são o mesmo build/imagem, diferenciadas só pela variável `ADMIN_PANEL_HOST`
 * e pelo `Host` da requisição. Numa instância de cliente normal essa env var
 * não está configurada, então `/admin/*` fica bloqueado incondicionalmente
 * (defesa em profundidade: mesmo mal configurado, um cliente nunca expõe o
 * painel do operador).
 *
 * Spec 010: toda resposta leva os cabeçalhos anti-enquadramento
 * (`frame-ancestors`), e `?embed=1` liga o layout compacto para iframe.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const adminHost = process.env.ADMIN_PANEL_HOST;
  const isAdminHost = !!adminHost && host === adminHost;
  const origins = parseEmbedOrigins(process.env.EMBED_ALLOWED_ORIGINS).valid;
  const withFraming = (res: NextResponse) => {
    for (const [k, v] of Object.entries(framingHeaders({ origins, adminHost: isAdminHost }))) {
      res.headers.set(k, v);
    }
    return res;
  };

  const isAdminPath =
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/api/admin") ||
    req.nextUrl.pathname.startsWith("/api/internal");

  if (isAdminPath && !isAdminHost) {
    // /api/internal é a API que O PRÓPRIO painel central chama numa
    // instância de CLIENTE — essa sim deve responder normalmente em
    // qualquer host (ela tem sua própria autenticação por segredo, ver
    // src/app/api/internal/license/route.ts). Só bloqueia /admin e
    // /api/admin (rotas do painel em si) fora do host configurado.
    if (req.nextUrl.pathname.startsWith("/api/internal")) {
      return withFraming(NextResponse.next());
    }
    return withFraming(NextResponse.redirect(new URL("/", req.url)));
  }

  if (isAdminHost && !isAdminPath) {
    // No domínio do painel, tudo que não é /admin ou /api/admin vira /admin
    // — essa instância nunca serve onboarding/login de cliente.
    if (req.nextUrl.pathname.startsWith("/_next") || req.nextUrl.pathname.startsWith("/api")) {
      return withFraming(NextResponse.next());
    }
    return withFraming(NextResponse.redirect(new URL("/admin", req.url)));
  }

  if (isAdminHost) return withFraming(NextResponse.next());

  // Modo embutido: só existe com origens configuradas (sem elas ninguém
  // de fora consegue enquadrar o Vocero). O cabeçalho que chega do
  // cliente é sempre descartado — quem decide é o middleware.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(EMBED_HEADER);
  const mode =
    origins.length > 0
      ? resolveEmbedMode(req.nextUrl.searchParams.get("embed"), req.cookies.get(EMBED_COOKIE)?.value)
      : { embed: false, setCookie: null };
  if (mode.embed) requestHeaders.set(EMBED_HEADER, "1");

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (mode.setCookie) {
    const crossSite = iframeCookiesEnabled(origins, process.env.APP_BASE_URL);
    res.cookies.set({
      name: EMBED_COOKIE,
      value: mode.setCookie === "on" ? "1" : "",
      path: "/",
      httpOnly: true,
      maxAge: mode.setCookie === "on" ? 60 * 60 * 24 * 365 : 0,
      ...(crossSite
        ? { sameSite: "none" as const, secure: true, partitioned: true }
        : { sameSite: "lax" as const }),
    });
  }
  return withFraming(res);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
