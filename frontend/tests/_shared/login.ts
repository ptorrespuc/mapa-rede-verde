import type { Page } from "@playwright/test";

export async function login(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/login");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/map");
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL("**/login");
}
