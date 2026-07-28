import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // O motor Baileys nativo puxa uma árvore de dependências pesada
    // (protobufjs, libsignal, bindings nativos) — em máquina sob carga, só
    // importar esse módulo já pode passar dos 5s padrão do vitest.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
