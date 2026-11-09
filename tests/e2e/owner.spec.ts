import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  AUTH_FILE,
  invitePath,
  OWNER_EMAIL,
  runOwnerInviteCommand,
  saveCredentials,
} from "./helpers";

/**
 * Spec 009 · US1 — a instância só é ativada pelo convite do proprietário.
 * Precisa de uma instância SEM organização (instalação recém-feita).
 */
test.describe.configure({ mode: "serial" });

const password = `E2e-${randomBytes(9).toString("base64url")}`;
let firstLink = "";
let link = "";

test("com convite pendente, /register sem o link não deixa criar conta", async ({ page, request }) => {
  // Em produção a instância vazia já aguarda o dono; em `next dev` o
  // cadastro só fecha quando existe convite pendente — por isso gera um aqui.
  const first = runOwnerInviteCommand();
  expect(first.ok).toBe(true);
  if (first.ok) firstLink = invitePath(first.url);

  const status = await (await request.get("/api/auth/registration-status")).json();
  expect(status.state).toBe("awaiting_owner");

  await page.goto("/register");
  await expect(page.getByTestId("register-awaiting-owner")).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveCount(0);

  const res = await request.post("/api/auth/sign-up/email", {
    data: { name: "Intruso", email: "intruso@e2e.test", password: "intruso-123456" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(403);
});

test("convite novo invalida o anterior", async ({ page }) => {
  const second = runOwnerInviteCommand();
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  link = invitePath(second.url);
  expect(second.email).toBe(OWNER_EMAIL);

  await page.goto(firstLink);
  await expect(page.getByTestId("owner-invite-invalid")).toContainText("substituído");
});

test("token adulterado não é aceito", async ({ page }) => {
  await page.goto(`${link}x`);
  await expect(page.getByTestId("owner-invite-invalid")).toContainText("inválido");
});

test("e-mail diferente do convite é recusado pela API", async ({ request }) => {
  const token = new URL(link, "http://x").searchParams.get("owner")!;
  const res = await request.post("/api/auth/accept-owner-invite", {
    data: { token, name: "Outro", email: "outro@e2e.test", password },
  });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe("email_mismatch");
});

test("proprietário ativa a instância pelo link", async ({ page }) => {
  await page.goto(link);
  const email = page.getByLabel("E-mail");
  await expect(email).toHaveValue(OWNER_EMAIL);
  await expect(email).toBeDisabled();

  await page.getByLabel("Seu nome").fill("Dono E2E");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirme a senha").fill(`${password}-diferente`);
  await page.getByRole("button", { name: "Criar conta de proprietário" }).click();
  await expect(page.getByText("As senhas não conferem.")).toBeVisible();

  await page.getByLabel("Confirme a senha").fill(password);
  await page.getByRole("button", { name: "Criar conta de proprietário" }).click();
  await page.waitForURL("**/inbox**");

  saveCredentials({ email: OWNER_EMAIL, password });
  await page.context().storageState({ path: AUTH_FILE });
});

test("link usado não serve de novo e o cadastro fica fechado", async ({ page, request }) => {
  await page.goto(link);
  await expect(page.getByTestId("owner-invite-invalid")).toBeVisible();

  const status = await (await request.get("/api/auth/registration-status")).json();
  expect(status.state).toBe("closed");

  const again = runOwnerInviteCommand();
  expect(again.ok).toBe(false);
  if (!again.ok) expect(again.code).toBe("org_exists");
});

test("proprietário sai e entra de novo com a senha", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL("**/inbox**");
  await context.close();
});
