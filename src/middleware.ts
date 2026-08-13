import { NextResponse, type NextRequest } from "next/server";

/**
 * Roteamento por domínio entre "instância de cliente" (comportamento normal,
 * inalterado) e "painel central do operador" (`/admin/*`) — as duas coisas
 * são o mesmo build/imagem, diferenciadas só pela variável `ADMIN_PANEL_HOST`
 * e pelo `Host` da requisição. Numa instância de cliente normal essa env var
 * não está configurada, então `/admin/*` fica bloqueado incondicionalmente
 * (defesa em profundidade: mesmo mal configurado, um cliente nunca expõe o
 * painel do operador).
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const adminHost = process.env.ADMIN_PANEL_HOST;
  const isAdminHost = !!adminHost && host === adminHost;
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
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isAdminHost && !isAdminPath) {
    // No domínio do painel, tudo que não é /admin ou /api/admin vira /admin
    // — essa instância nunca serve onboarding/login de cliente.
    if (req.nextUrl.pathname.startsWith("/_next") || req.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
