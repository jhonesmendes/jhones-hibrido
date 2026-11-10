import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { loadCredentials } from "./helpers";

/**
 * Spec 010 — Vocero embutido num iframe (ex.: aba do painel do Sankhya).
 * Simula o "Sankhya" com um servidor HTTP local de outro site
 * (E2E_EMBED_ORIGIN, ex. http://erp.localhost:39999 — o mesmo valor vai em
 * EMBED_ALLOWED_ORIGINS do servidor). Servidor de verdade em loopback, e
 * não `page.route`: o Chrome trata página interceptada como "pública" e o
 * bloqueio de rede local impediria o quadro de abrir o localhost.
 */
const EMBED_ORIGIN = process.env.E2E_EMBED_ORIGIN ?? "";
test.skip(!EMBED_ORIGIN, "Requer E2E_EMBED_ORIGIN (e o mesmo valor em EMBED_ALLOWED_ORIGINS)");
test.describe.configure({ mode: "serial" });

let erp: Server | undefined;
test.beforeAll(async () => {
  const port = Number(new URL(EMBED_ORIGIN).port || 80);
  erp = createServer((req, res) => {
    const src = new URL(req.url ?? "/", "http://x").searchParams.get("src") ?? "";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>ERP</title><h1>Painel ERP</h1>
      <iframe id="vocero" src="${src.replace(/"/g, "")}" allow="microphone; clipboard-write; autoplay"
        style="width:1200px;height:700px;border:0"></iframe>`);
  });
  await new Promise<void>((resolve) => erp!.listen(port, "127.0.0.1", resolve));
});
test.afterAll(() => new Promise<void>((resolve) => (erp ? erp.close(() => resolve()) : resolve())));

/** Abre o "ERP" (mesmo servidor, com outro nome de host se preciso). */
async function serveHost(page: Page, origin: string, src: string) {
  await page.goto(`${origin}/painel?src=${encodeURIComponent(src)}`);
}

test("toda página diz quem pode enquadrá-la", async ({ request }) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain(new URL(EMBED_ORIGIN).hostname); // origem exata ou com curinga de porta
});

test("dentro do ERP: login no quadro, as três abas e o link pelo telefone", async ({
  browser,
  baseURL,
  request,
}) => {
  // Contexto limpo: o login de fora do quadro não vale dentro dele.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await serveHost(page, EMBED_ORIGIN, `${baseURL}/inbox?embed=1`);
  const frame = page.frameLocator("#vocero");

  const { email, password } = loadCredentials();
  await frame.getByLabel("E-mail").fill(email);
  await frame.getByLabel("Senha").fill(password);
  await frame.getByRole("button", { name: "Entrar" }).click();

  const nav = frame.getByTestId("embed-nav");
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await expect(frame.locator("aside.app-nav-aside")).toHaveCount(0);

  await nav.getByRole("link", { name: /Fila/ }).click();
  await expect.poll(() => page.frame({ url: /\/queue/ }) !== null, { timeout: 60_000 }).toBe(true);
  await expect(frame.getByTestId("embed-nav")).toBeVisible();

  await frame.getByTestId("embed-nav").getByRole("link", { name: /Pipeline/ }).click();
  await expect.poll(() => page.frame({ url: /\/pipeline/ }) !== null, { timeout: 60_000 }).toBe(true);
  await expect(frame.getByTestId("embed-nav")).toBeVisible();
  await expect(frame.locator("aside.app-nav-aside")).toHaveCount(0);

  // Recarregar o ERP mantém a sessão e o modo embutido dentro do quadro.
  await page.reload();
  await expect(page.frameLocator("#vocero").getByTestId("embed-nav")).toBeVisible({ timeout: 60_000 });

  // Botão "WhatsApp motorista" do ERP: link direto pelo telefone, no formato
  // em que o Sankhya mostra — abre (ou cria) a conversa dentro do quadro.
  const phoneLink = (phone: string, name: string) =>
    `${baseURL}/inbox?embed=1&phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`;
  const conversationsFor = async (phone: string) => {
    const frame = page.frame({ url: /\/inbox/ });
    if (!frame) return -1;
    const data = (await frame.evaluate(() => fetch("/api/conversations").then((r) => r.json()))) as {
      conversations: { contact: { phone: string } }[];
    };
    return data.conversations.filter((c) => c.contact.phone === phone).length;
  };

  // Sem número de WhatsApp conectado o link degrada com aviso legível; em
  // seguida conecta o número (mock, mesmo do inbox.spec) e segue.
  const numbers = await request.get("/api/settings/whatsapp/numbers");
  if (!JSON.stringify(await numbers.json()).includes("123456789")) {
    await serveHost(page, EMBED_ORIGIN, phoneLink("(64) 99283-5887", "Motorista E2E"));
    await expect(page.frameLocator("#vocero").getByTestId("deep-link-error")).toContainText(
      "Nenhum canal",
      { timeout: 60_000 }
    );
    const res = await request.post("/api/settings/whatsapp/numbers", {
      data: { name: "E2E", wabaId: "waba-e2e", phoneNumberId: "123456789", token: "token-e2e" },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
  }

  await serveHost(page, EMBED_ORIGIN, phoneLink("(64) 99283-5887", "Motorista E2E"));
  const f2 = page.frameLocator("#vocero");
  await expect(f2.getByTestId("embed-nav")).toBeVisible({ timeout: 60_000 });
  // Conversa aberta: cabeçalho com o telefone normalizado (o campo de
  // resposta pode não existir — contato novo no oficial = janela fechada).
  await expect(f2.getByText("+5564992835887").first()).toBeVisible({ timeout: 60_000 });
  await expect(f2.getByText("Motorista E2E").first()).toBeVisible();
  // A URL é limpa (recarregar não repete a ação) e o modo embutido segue.
  await expect.poll(() => page.frame({ url: /\/inbox\?embed=1$/ }) !== null, { timeout: 30_000 }).toBe(true);
  expect(await conversationsFor("5564992835887")).toBe(1);

  // De novo pelo mesmo telefone em outro formato: a MESMA conversa.
  await serveHost(page, EMBED_ORIGIN, phoneLink("64992835887", "Motorista E2E"));
  await expect(page.frameLocator("#vocero").getByText("+5564992835887").first()).toBeVisible({ timeout: 60_000 });
  expect(await conversationsFor("5564992835887")).toBe(1);

  // Telefone inválido: aviso na tela, nada criado.
  await serveHost(page, EMBED_ORIGIN, phoneLink("12345", "Ninguém"));
  await expect(page.frameLocator("#vocero").getByTestId("deep-link-error")).toBeVisible({ timeout: 60_000 });
  await context.close();
});

test("site fora da lista não consegue embutir", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  // Mesmo servidor do ERP, mas por outro nome: outra origem, fora da lista.
  const intruder = new URL(EMBED_ORIGIN);
  intruder.hostname = "intruso.localhost";
  await serveHost(page, intruder.origin, `${baseURL}/login`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(2_000);
  await expect(page.frameLocator("#vocero").getByLabel("E-mail")).toHaveCount(0);

  // /embed-check abre em qualquer quadro e aponta a origem que falta.
  await serveHost(page, intruder.origin, `${baseURL}/embed-check`);
  const check = page.frameLocator("#vocero");
  await expect(check.getByText("fora da lista")).toBeVisible({ timeout: 60_000 });
  await expect(check.getByText(new RegExp(`^EMBED_ALLOWED_ORIGINS=.+,${intruder.origin.replace(/[.:/]/g, "\\$&")}$`))).toBeVisible();
  await context.close();
});

test("aberto direto, o Vocero mantém o layout normal", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page.locator("aside.app-nav-aside")).toBeVisible();
  await expect(page.getByTestId("embed-nav")).toHaveCount(0);
});
