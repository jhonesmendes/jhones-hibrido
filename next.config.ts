import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone es para la imagen Docker (Linux). En Windows el trazado crea
  // symlinks que requieren permisos elevados, así que ahí se omite.
  output: process.platform === "win32" ? undefined : "standalone",
  // `postgres` y `@whiskeysockets/baileys` (+ su dependencia opcional `sharp`,
  // binarios nativos) usan APIs de Node que no deben empaquetarse en el bundle.
  serverExternalPackages: ["postgres", "@whiskeysockets/baileys", "sharp"],
};

export default nextConfig;
