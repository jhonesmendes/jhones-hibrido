import { defineConfig } from "@playwright/test";

/**
 * E2E executável (spec 009). Roda contra uma instância já no ar:
 *
 *   E2E_BASE_URL=http://127.0.0.1:3998 \
 *   E2E_OWNER_INVITE_CMD='docker compose -p vocero-x exec -T app node bootstrap-owner.mjs --email {email} --json' \
 *   pnpm test:e2e
 *
 * - `owner`: ativação da instância pelo convite do proprietário (qualquer
 *   ambiente, inclusive a imagem de produção).
 * - `app`: caixa de entrada e API interna; exige os mocks (E2E_MOCKS=1,
 *   servidor em `next dev` com WA_MOCK_ENABLED=true).
 *
 * E2E_BROWSER_CHANNEL=chrome usa o Chrome instalado na máquina em vez do
 * Chromium baixado pelo Playwright.
 */
const AUTH_FILE = "test-results/.auth/owner.json"; // igual a tests/e2e/helpers.ts

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
    // Ex.: simular um ERP público em http apontando um nome para 127.0.0.1:
    // E2E_CHROME_ARGS='--host-resolver-rules=MAP erp.exemplo.com.br 127.0.0.1 --disable-features=LocalNetworkAccessChecks'
    launchOptions: process.env.E2E_CHROME_ARGS
      ? { args: process.env.E2E_CHROME_ARGS.match(/--[^-][^]*?(?=\s--|$)/g) ?? [] }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "owner", testMatch: /owner\.spec\.ts$/ },
    {
      name: "app",
      testMatch: /(inbox|internal-api|embed)\.spec\.ts$/,
      dependencies: ["owner"],
      use: { storageState: AUTH_FILE },
    },
  ],
});
