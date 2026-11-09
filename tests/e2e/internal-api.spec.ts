import { expect, test } from "@playwright/test";
import { MOCKS } from "./helpers";

/**
 * Spec 009 · US5 — API interna (usada pelo n8n): chave nomeada funciona,
 * chave revogada, ausente ou a antiga chave padrão são recusadas.
 */
test.skip(!MOCKS, "Requer os mocks (E2E_MOCKS=1, next dev com WA_MOCK_ENABLED=true)");
test.describe.configure({ mode: "serial" });

const CUSTOMER = "5566999990001";

test("chave nomeada envia mensagem; revogada deixa de valer", async ({ request, playwright, baseURL }) => {
  const created = await request.post("/api/settings/integrations", { data: { name: "E2E n8n" } });
  expect(created.status(), await created.text()).toBe(201);
  const { id, token } = (await created.json()) as { id: string; token: string };

  // Contexto sem cookies: a API interna só aceita a chave.
  const api = await playwright.request.newContext({ baseURL });
  const text = `Mensagem pela API ${Date.now()}`;
  const send = (key: string) =>
    api.post("/api/internal/send-message", {
      headers: { "x-internal-key": key },
      data: { to: CUSTOMER, text },
    });

  const ok = await send(token);
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await ok.json()).success).toBe(true);
  await expect
    .poll(async () => JSON.stringify(await (await request.get("/api/dev/wa-mock/outbox")).json()), {
      timeout: 120_000,
    })
    .toContain(text);

  expect((await send("chave-errada")).status()).toBe(401);
  expect((await send("vocero_internal_2024")).status()).toBe(401);
  expect(
    (await api.post("/api/internal/send-message", { data: { to: CUSTOMER, text } })).status()
  ).toBe(401);

  const revoked = await request.delete(`/api/settings/integrations/${id}`);
  expect(revoked.ok(), await revoked.text()).toBe(true);
  expect((await send(token)).status()).toBe(401);
  await api.dispose();
});
