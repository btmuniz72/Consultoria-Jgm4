import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { DEV_PASSWORD, answerDialog, base, launchBrowser, login, logout } from './browser-helpers.ts';

// Administração operacional (Etapa 10A), sem seed: empresa → usuário → projeto com estrutura Plano C → vínculo → abrir projeto → inativar usuário.
// Cria dados de teste com sufixo único e, ao final, inativa a empresa de teste (nada é apagado). Requer API (3000), frontend (4200) e o admin de desenvolvimento.
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
const suffix = Date.now().toString(36);
const company = `Empresa Teste 10A ${suffix}`; const projectName = `Projeto Plano C ${suffix}`; const basicName = `Projeto Básico ${suffix}`;
const sponsorEmail = `sponsor-${suffix}@teste10a.local`; const memberEmail = `membro-${suffix}@teste10a.local`;
const noOverflow = async (page: Page, label: string) => { if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)) fail(`Rolagem horizontal em ${label}.`); };
const confirmPassword = async (page: Page) => { await page.getByTestId('admin-password').fill(DEV_PASSWORD); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));

  // 1. admin entra; consultor e cliente não veem a área
  await login(page, 'admin@jgm4.local');
  await page.getByTestId('nav-admin-companies').click(); await page.waitForURL(/\/admin\/companies/); await page.getByTestId('admin-nav').waitFor();

  // 2. empresa
  await page.getByTestId('company-new').click(); await page.getByTestId('company-name').fill(company); await page.getByTestId('company-display').fill('Teste 10A'); await page.getByTestId('company-code').fill(`T10A-${suffix}`.toUpperCase());
  await page.getByTestId('company-save').click(); await page.getByTestId('admin-notice').waitFor();
  await page.getByTestId('company-search').fill(suffix); await page.getByTestId('company-row').filter({ hasText: company }).waitFor();

  // 3. usuários (patrocinador do cliente e membro) por convite; define a senha pelo link de desenvolvimento
  await page.goto(`${base}/admin/users`);
  const createUser = async (name: string, email: string, role: string) => {
    await page.getByTestId('user-new').click(); await page.getByTestId('user-name').fill(name); await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-role').selectOption(role); await page.getByTestId('user-company').selectOption({ label: company }); await page.getByTestId('user-save').click();
    await page.getByTestId('user-dev-link').waitFor(); return await page.getByTestId('user-dev-link').locator('code').innerText();
  };
  const sponsorLink = await createUser(`Patrocinador ${suffix}`, sponsorEmail, 'CLIENT_SPONSOR');
  await createUser(`Membro ${suffix}`, memberEmail, 'CLIENT_USER');
  const resetPath = new URL(sponsorLink).pathname + new URL(sponsorLink).search;
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const otherPage = await other.newPage();
  await otherPage.goto(`${base}${resetPath}`); await otherPage.getByTestId('reset-password').fill('Senha-Forte-10A-Teste!'); await otherPage.getByTestId('reset-confirm').fill('Senha-Forte-10A-Teste!'); await otherPage.getByTestId('reset-submit').click(); await otherPage.getByTestId('reset-done').waitFor();

  // 4 e 5. projeto com estrutura Plano C e projeto básico + ação "Usar estrutura Plano C"
  await page.goto(`${base}/admin/projects`);
  await page.getByTestId('project-new').click(); await page.getByTestId('project-company').selectOption({ label: company });
  await page.getByTestId('project-name').fill(projectName); await page.getByTestId('project-code').fill(`P10A-${suffix}`.toUpperCase()); await page.getByTestId('project-description').fill('Projeto criado pela interface administrativa, sem seed.');
  await page.getByTestId('project-sponsor').selectOption({ label: `Patrocinador ${suffix}` }); await page.getByTestId('project-template').selectOption(await page.getByTestId('project-template').locator('option', { hasText: 'Plano C' }).first().getAttribute('value') ?? ''); await page.getByTestId('project-save').click(); await page.getByTestId('admin-notice').waitFor();
  await page.getByTestId('project-new').click(); await page.getByTestId('project-company').selectOption({ label: company });
  await page.getByTestId('project-name').fill(basicName); await page.getByTestId('project-description').fill('Projeto básico, estrutura criada depois.'); await page.getByTestId('project-save').click();
  await page.getByTestId('project-search').fill(suffix); await page.getByTestId('project-row').filter({ hasText: basicName }).waitFor();
  await page.getByTestId(`project-template-pick-${basicName}`).selectOption(await page.getByTestId(`project-template-pick-${basicName}`).locator('option', { hasText: 'Plano C' }).first().getAttribute('value') ?? ''); await page.getByTestId(`project-apply-${basicName}`).click(); await answerDialog(page); await page.getByTestId(`project-open-${basicName}`).waitFor();
  const row = page.getByTestId('project-row').filter({ hasText: projectName });
  if (!(await row.innerText()).includes(`Patrocinador ${suffix}`)) fail('Patrocinador não aparece na lista de projetos.');
  await page.screenshot({ path: '.local/screenshots/etapa-10a-projetos-desktop.png', fullPage: true });

  // 6. membros
  await page.getByTestId(`project-members-${projectName}`).click(); await page.getByTestId('members-panel').waitFor();
  await page.getByTestId('member-user').selectOption({ label: `Membro ${suffix} — Usuário` }); await page.getByTestId('member-add').click(); await page.getByTestId('admin-notice').waitFor();
  await page.getByTestId('member-row').filter({ hasText: memberEmail }).waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-10a-membros-desktop.png', fullPage: true });

  // 7 e 8. abre o projeto: 5 fases e Gate 0
  await page.goto(`${base}/admin/projects`); await page.getByTestId('project-search').fill(suffix);
  await page.getByTestId(`project-open-${projectName}`).click(); await page.getByTestId('phase').first().waitFor();
  if ((await page.getByTestId('phase').count()) !== 5) fail(`Esperadas 5 fases, vieram ${await page.getByTestId('phase').count()}.`);
  if ((await page.getByTestId('gate').count()) < 5) fail('Esperados 5 Gates.');
  if (!(await page.getByTestId('gate').first().innerText()).match(/Gate 0|GATE-0|Base organizada/i)) fail('Gate 0 não encontrado.');

  // 9 e 10. inativar usuário e confirmar bloqueio
  const ok = await otherPage.evaluate(() => true); void ok;
  await page.goto(`${base}/admin/users`); await confirmPassword(page); await page.getByTestId('user-search').fill(suffix);
  await page.getByTestId(`user-disable-${sponsorEmail}`).click(); await answerDialog(page); await page.getByTestId('admin-notice').waitFor();
  await otherPage.goto(`${base}/login`); await otherPage.getByTestId('login-email').fill(sponsorEmail); await otherPage.getByTestId('login-password').fill('Senha-Forte-10A-Teste!'); await otherPage.getByTestId('login-submit').click(); await otherPage.getByTestId('login-error').waitFor();
  if (!otherPage.url().includes('/login')) fail('Usuário inativo não deveria entrar.');
  await other.close();

  // Perfis: consultor não acessa /admin (redirecionado) e a API nega.
  await page.getByTestId('logout').click(); await page.waitForURL(/\/login/); await login(page, 'consultor@jgm4.local');
  await page.goto(`${base}/admin/companies`); await page.waitForLoadState('networkidle'); if (page.url().includes('/admin')) fail('Consultor não deveria acessar /admin.');
  if ((await context.request.get(`${base}/api/admin/companies`)).status() !== 403) fail('API /admin deveria negar o consultor.');
  await logout(page);

  // Limpeza lógica: inativa a empresa de teste (histórico preservado).
  await login(page, 'admin@jgm4.local'); await page.goto(`${base}/admin/companies`); await confirmPassword(page); await page.getByTestId('company-search').fill(suffix);
  await page.getByTestId(`company-toggle-${company}`).click(); await answerDialog(page); await page.getByTestId('admin-notice').waitFor();

  // Responsivo: telas administrativas sem rolagem horizontal em tablet e celular.
  for (const [name, width, height] of [['tablet', 820, 1100], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const path of ['/admin/companies', '/admin/users', '/admin/projects']) { await page.goto(`${base}${path}`); await page.getByTestId('admin-nav').waitFor(); await page.waitForLoadState('networkidle'); await noOverflow(page, `${path} (${name})`); }
    await page.screenshot({ path: `.local/screenshots/etapa-10a-projetos-${name}.png`, fullPage: true });
  }
  if (errors.length) fail(`Erros de página: ${errors.join(' | ')}`);
  console.log('Etapa 10A: empresa, usuário por convite, projeto com Plano C (5 fases, Gates), clonagem em projeto básico, vínculos, abertura do projeto, inativação com bloqueio, perfis, desktop, tablet e mobile passaram.');
} finally { await browser.close(); }
