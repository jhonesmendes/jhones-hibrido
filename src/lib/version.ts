/**
 * Versão do build (spec 009). Gravada na imagem pelo CI via build args
 * `APP_VERSION` e `GIT_SHA`; fora da imagem fica "dev".
 */
export function getBuildInfo(): { version: string; commit: string } {
  return {
    version: process.env.APP_VERSION || "dev",
    commit: (process.env.GIT_SHA || "").slice(0, 7) || "dev",
  };
}
