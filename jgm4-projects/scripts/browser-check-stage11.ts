import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { answerDialog, base, launchBrowser, login, logout } from './browser-helpers.ts';

// Templates (Etapa 11): abrir o Plano C, visualizar a estrutura, criar nova versão (rascunho), validar, ativar (inativando a anterior)
// e criar um projeto a partir do template. Cada execução cria uma nova versão do Plano C (sem alterar conteúdo) e uma empresa de teste
// que é inativada ao final.
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
const suffix = Date.now().toString(36);
const company = `Empresa Template ${suffix}`; const projectName = `Projeto por Template ${suffix}`;
const noOverflow = async (page: Page, label: string) => { if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)) fail(`Rolagem horizontal em ${label}.`); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));

  await login(page, 'admin@jgm4.local');
  await page.goto(`${base}/admin/templates`); await page.getByTestId('admin-nav').waitFor();
  await page.getByTestId('template-row').first().waitFor();
  // Execuções repetidas/interrompidas podem deixar um rascunho: nesse caso ele é reaproveitado em vez de criar outra versão.
  const hasDraft = (await page.getByTestId('template-row').filter({ hasText: 'Rascunho' }).count()) > 0;
  const active = page.getByTestId('template-row').filter({ hasText: 'PLAN_C' }).filter({ hasText: 'Ativo' }).first(); await active.waitFor();
  await active.getByRole('link', { name: 'Abrir' }).click(); await page.getByTestId('template-title').filter({ hasText: 'Plano C' }).waitFor();
  if (!(await page.getByTestId('template-title').innerText()).includes('Plano C')) fail('Template Plano C não abriu.');
  await page.getByTestId('template-preview').click(); await page.getByTestId('preview-panel').waitFor();
  if ((await page.getByTestId('preview-phase').count()) !== 5) fail('A estrutura do Plano C deveria mostrar 5 fases.');
  if (!(await page.getByTestId('preview-panel').innerText()).includes('33 atividades')) fail('A estrutura do Plano C deveria ter 33 atividades.');
  if (await page.getByTestId('section-phases').count()) fail('Template ativo não deve mostrar o editor da estrutura.');
  await page.screenshot({ path: '.local/screenshots/etapa-11-template-preview-desktop.png', fullPage: true });

  // nova versão (rascunho) → editor visível → validar → ativar
  // Execuções repetidas/interrompidas podem deixar um rascunho: nesse caso ele é reaproveitado em vez de criar outra versão.
  if (hasDraft) { await page.goto(`${base}/admin/templates`); await page.getByTestId('template-row').filter({ hasText: 'Rascunho' }).first().getByRole('link', { name: 'Abrir' }).click(); } else await page.getByTestId('template-new-version').click();
  await page.getByTestId('section-phases').waitFor(); await page.getByTestId('template-validate').waitFor();
  if (!(await page.getByTestId('template-title').innerText()).match(/v\d+/)) fail('Versão não exibida.');
  await page.getByTestId('template-validate').click(); await page.getByTestId('validation-panel').getByRole('heading', { name: 'Template válido' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-11-template-rascunho-desktop.png', fullPage: true });
  await page.getByTestId('template-inactivate-previous').check(); await page.getByTestId('template-activate').click();
  await page.getByTestId('admin-notice').filter({ hasText: 'ativado' }).waitFor();
  if (await page.getByTestId('section-phases').count()) fail('Após ativar, a estrutura não deve ser editável.');

  // empresa + projeto usando o template
  await page.goto(`${base}/admin/companies`); await page.getByTestId('company-new').click(); await page.getByTestId('company-name').fill(company); await page.getByTestId('company-save').click(); await page.getByTestId('admin-notice').waitFor();
  await page.goto(`${base}/admin/projects`); await page.getByTestId('project-new').click(); await page.getByTestId('project-company').selectOption({ label: company });
  await page.getByTestId('project-name').fill(projectName); await page.getByTestId('project-description').fill('Projeto criado a partir de um template ativo.');
  const options = page.getByTestId('project-template').locator('option', { hasText: 'Plano C' });
  if ((await options.count()) !== 1) fail(`Esperado um único Plano C ativo, vieram ${await options.count()}.`);
  await page.getByTestId('project-template').selectOption(await options.first().getAttribute('value') ?? '');
  await page.getByTestId('project-save').click(); await page.getByTestId('admin-notice').waitFor();
  await page.getByTestId('project-search').fill(suffix); await page.getByTestId(`project-open-${projectName}`).click();
  await page.getByTestId('phase').first().waitFor();
  if ((await page.getByTestId('phase').count()) !== 5) fail('O projeto deveria ter 5 fases.');
  if ((await page.getByTestId('gate').count()) < 5) fail('O projeto deveria ter 5 Gates.');
  await page.screenshot({ path: '.local/screenshots/etapa-11-projeto-por-template-desktop.png', fullPage: true });

  // consultor não acessa a administração de templates
  await page.getByTestId('logout').click(); await page.waitForURL(/\/login/); await login(page, 'consultor@jgm4.local');
  await page.goto(`${base}/admin/templates`); await page.waitForLoadState('networkidle'); if (page.url().includes('/admin')) fail('Consultor não deveria acessar /admin/templates.');
  if ((await context.request.get(`${base}/api/admin/templates`)).status() !== 403) fail('API de templates deveria negar o consultor.');
  await logout(page);

  // limpeza lógica da empresa de teste e responsividade
  await login(page, 'admin@jgm4.local'); await page.goto(`${base}/admin/companies`); await page.getByTestId('admin-password').fill('Jgm4-Dev-2026!'); await page.getByTestId('company-search').fill(suffix);
  await page.getByTestId(`company-toggle-${company}`).click(); await answerDialog(page); await page.getByTestId('admin-notice').waitFor();
  for (const [name, width, height] of [['tablet', 820, 1100], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/admin/templates`); await page.getByTestId('admin-nav').waitFor(); await page.waitForLoadState('networkidle'); await noOverflow(page, `/admin/templates (${name})`);
    await page.getByTestId('template-row').filter({ hasText: 'Ativo' }).first().getByRole('link', { name: 'Abrir' }).click(); await page.getByTestId('template-title').waitFor();
    await page.getByTestId('template-preview').click(); await page.getByTestId('preview-panel').waitFor(); await page.waitForLoadState('networkidle'); await noOverflow(page, `editor de template (${name})`);
    await page.screenshot({ path: `.local/screenshots/etapa-11-template-${name}.png`, fullPage: true });
  }
  if (errors.length) fail(`Erros de página: ${errors.join(' | ')}`);
  console.log('Etapa 11: templates (abrir Plano C, visualizar estrutura, nova versão, validar, ativar), projeto criado por template com 5 fases e Gates, perfis, desktop, tablet e mobile passaram.');
} finally { await browser.close(); }
