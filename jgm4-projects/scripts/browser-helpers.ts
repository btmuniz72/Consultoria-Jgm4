import { chromium, type Page } from '@playwright/test';

/** Abre o navegador. BROWSER_CHANNEL (ex.: msedge, chrome) escolhe um navegador instalado; sem ele usa o Chromium do Playwright. */
export const launchBrowser = () => chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });

// Senha local dos usuários de desenvolvimento criados pelo seed (nunca usar fora do ambiente local).
export const DEV_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Jgm4-Dev-2026!';
// BASE_URL aponta os testes para outro ambiente (ex.: staging). Sem ela, usa o frontend local.
export const base = (process.env.BASE_URL ?? 'http://127.0.0.1:4200').replace(/\/+$/, '');

export async function login(page: Page, email: string, password = DEV_PASSWORD) {
  await page.goto(`${base}/login`);
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
export async function logout(page: Page) {
  await page.getByTestId('logout').click();
  await page.waitForURL(/\/login/);
}
