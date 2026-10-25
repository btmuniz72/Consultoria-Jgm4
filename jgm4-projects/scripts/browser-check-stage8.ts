import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { base, launchBrowser, login, logout } from './browser-helpers.ts';
import { totpAt } from '../backend/src/security/totp.ts';

// Segurança e privacidade (Etapa 8): login com MFA, esqueci a senha, conta/sessões, páginas legais, administração e isolamento.
// Requer API (3000), frontend (4200) e `npm run db:seed`. Deixa o consultor sem MFA ao final (estado original).
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
const noOverflow = async (page: Page, label: string) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)) fail(`Rolagem horizontal em ${label}.`);
};
const otp = (secret: string, offsetMs = 0) => totpAt(secret, Date.now() + offsetMs);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));

  // Páginas públicas: privacidade e termos (sem login), "esqueci a senha" e link de redefinição inválido.
  await page.goto(`${base}/privacy`); await page.getByTestId('legal-title').waitFor();
  if (!(await page.getByTestId('legal-title').innerText()).includes('Privacidade')) fail('Página de privacidade não abriu.');
  await page.goto(`${base}/terms`); await page.getByTestId('legal-title').waitFor();
  if (!(await page.getByTestId('legal-title').innerText()).includes('Termos')) fail('Termos de uso não abriram.');
  await page.goto(`${base}/login`); await page.getByTestId('footer-privacy').waitFor(); await page.getByTestId('forgot-link').click();
  await page.getByTestId('forgot-email').fill('naoexiste@exemplo.com'); await page.getByTestId('forgot-submit').click();
  // Resposta idêntica para e-mail inexistente; o limite persistente (10/h por IP) também é uma resposta válida em execuções repetidas.
  await page.locator('[data-testid=forgot-done], .error-note').first().waitFor();
  await page.goto(`${base}/reset-password?token=invalido`);
  await page.getByTestId('reset-password').fill('Nova-Senha-2026!x'); await page.getByTestId('reset-confirm').fill('Nova-Senha-2026!x'); await page.getByTestId('reset-submit').click(); await page.getByTestId('reset-error').waitFor();

  // Cookie de sessão HttpOnly: invisível para o JavaScript da página.
  await login(page, 'consultor@jgm4.local');
  const session = (await context.cookies()).find((c) => c.name === 'jgm4_session');
  if (!session?.httpOnly) fail('Cookie de sessão deveria ser HttpOnly.');
  if (await page.evaluate(() => document.cookie.includes('jgm4_session') || document.cookie.includes('jgm4_refresh'))) fail('Cookies de sessão visíveis para o JavaScript.');

  // Conta: política de senha, MFA (ativar → login exige código → desativar).
  await page.goto(`${base}/account`); await page.getByTestId('password-panel').waitFor();
  await page.getByTestId('pw-current').fill('Jgm4-Dev-2026!'); await page.getByTestId('pw-new').fill('curta1A!'); await page.getByTestId('pw-submit').click(); await page.getByTestId('account-error').waitFor();
  await page.getByTestId('mfa-start').click(); const secret = (await page.getByTestId('mfa-secret').innerText()).trim();
  await page.getByTestId('mfa-enable-code').fill(otp(secret)); await page.getByTestId('mfa-enable').click(); await page.getByTestId('account-notice').waitFor();
  await page.getByTestId('sessions-panel').waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-8-conta-desktop.png', fullPage: true });
  await logout(page);
  await page.getByTestId('login-email').fill('consultor@jgm4.local'); await page.getByTestId('login-password').fill('Jgm4-Dev-2026!'); await page.getByTestId('login-submit').click();
  await page.getByTestId('mfa-code').waitFor();
  await page.getByTestId('mfa-code').fill('000000'); await page.getByTestId('mfa-submit').click(); await page.getByTestId('login-error').waitFor();
  await page.goto(`${base}/login`); await page.getByTestId('login-email').fill('consultor@jgm4.local'); await page.getByTestId('login-password').fill('Jgm4-Dev-2026!'); await page.getByTestId('login-submit').click();
  await page.getByTestId('mfa-code').fill(otp(secret, 30000)); await page.getByTestId('mfa-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(`${base}/account`); await page.getByTestId('mfa-panel').getByRole('button', { name: 'Desativar' }).waitFor();
  const inputs = page.getByTestId('mfa-panel').locator('input'); await inputs.nth(0).fill('Jgm4-Dev-2026!'); await inputs.nth(1).fill(otp(secret, 30000));
  await page.getByTestId('mfa-panel').getByRole('button', { name: 'Desativar' }).click(); await page.getByTestId('account-notice').waitFor();
  // Consultor não vê a administração de segurança e a API nega.
  if (await page.getByTestId('nav-admin-security').count()) fail('Consultor não deveria ver o link de administração.');
  const denied = await context.request.get(`${base}/api/admin/users`); if (denied.status() !== 403) fail(`Consultor deveria receber 403 em /api/admin (veio ${denied.status()}).`);
  await logout(page);

  // Administração (JGM4_ADMIN).
  await login(page, 'admin@jgm4.local');
  await page.goto(`${base}/admin/security`); await page.getByTestId('users-panel').waitFor(); await page.getByTestId('events-panel').waitFor(); await page.getByTestId('incidents-panel').waitFor();
  await page.getByTestId('members-project').selectOption({ index: 1 }); await page.getByTestId('members-panel').waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-8-admin-desktop.png', fullPage: true });
  const all = await (await context.request.get(`${base}/api/projects`)).json() as { id: string; name: string }[];
  await logout(page);

  // Isolamento: gestor da Ollem não alcança projeto de outra empresa.
  await login(page, 'gestor@ollem.local'); const mine = await (await context.request.get(`${base}/api/projects`)).json() as { id: string }[];
  const foreign = all.find((p) => !mine.some((m) => m.id === p.id));
  if (foreign) { const r = await context.request.get(`${base}/api/projects/${foreign.id}/members`); if (![403, 404].includes(r.status())) fail(`Projeto de outra empresa deveria ser negado (veio ${r.status()}).`); }
  await logout(page);

  // Responsivo: telas públicas e conta sem rolagem horizontal em tablet e celular.
  for (const [name, width, height] of [['tablet', 820, 1100], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const path of ['/login', '/privacy', '/terms', '/forgot-password']) { await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle'); await noOverflow(page, `${path} (${name})`); }
    await login(page, 'consultor@jgm4.local'); await page.goto(`${base}/account`); await page.getByTestId('sessions-panel').waitFor(); await noOverflow(page, `/account (${name})`);
    await page.screenshot({ path: `.local/screenshots/etapa-8-conta-${name}.png`, fullPage: true }); await logout(page);
  }
  if (errors.length) fail(`Erros de página: ${errors.join(' | ')}`);
  console.log('Etapa 8: páginas legais, esqueci a senha, cookies HttpOnly, política de senha, MFA no login, administração, isolamento, desktop, tablet e mobile passaram.');
} finally { await browser.close(); }
