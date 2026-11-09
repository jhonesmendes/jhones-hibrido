import { expect, test } from "@playwright/test";
import { MOCKS } from "./helpers";

/**
 * Spec 009 · US5 — fluxo principal da caixa de entrada com os mocks:
 * conecta o número (mock), recebe uma mensagem, responde e confere o envio.
 */
test.skip(!MOCKS, "Requer os mocks (E2E_MOCKS=1, next dev com WA_MOCK_ENABLED=true)");
test.describe.configure({ mode: "serial" });

export const PHONE_NUMBER_ID = "123456789";
const CUSTOMER = "5566999990001";

test("conecta o número oficial (mock)", async ({ request }) => {
  const list = await request.get("/api/settings/whatsapp/numbers");
  expect(list.ok()).toBe(true);
  if (JSON.stringify(await list.json()).includes(PHONE_NUMBER_ID)) return;

  const res = await request.post("/api/settings/whatsapp/numbers", {
    data: { name: "E2E", wabaId: "waba-e2e", phoneNumberId: PHONE_NUMBER_ID, token: "token-e2e" },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
});

test("mensagem recebida aparece e a resposta é enviada", async ({ page, request }) => {
  await request.delete("/api/dev/wa-mock/outbox");
  const inbound = await request.post("/api/dev/wa-mock/inbound", {
    data: { phoneNumberId: PHONE_NUMBER_ID, from: CUSTOMER, name: "Cliente E2E", text: "Olá, quero um orçamento" },
  });
  expect(inbound.ok(), await inbound.text()).toBe(true);

  await page.goto("/inbox");
  await page.getByText("Cliente E2E").first().click();
  await expect(page.getByText("Olá, quero um orçamento").first()).toBeVisible();

  const reply = `Claro! Resposta E2E ${Date.now()}`;
  const composer = page.getByPlaceholder(/Escreva uma resposta/);
  await composer.click();
  await composer.pressSequentially(reply);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(reply).first()).toBeVisible();

  await expect
    // 120s: no primeiro acesso o `next dev` ainda compila as rotas de envio.
    .poll(async () => JSON.stringify(await (await request.get("/api/dev/wa-mock/outbox")).json()), {
      timeout: 120_000,
    })
    .toContain(reply);
});

test("webhook com segmento errado é recusado", async ({ request }) => {
  const res = await request.post("/api/webhooks/wa/segmento-errado", { data: { entry: [] } });
  expect(res.status()).toBe(404);
});
