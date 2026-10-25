import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { DEV_PASSWORD, base, launchBrowser, login, logout } from './browser-helpers.ts';

// Etapa 10.5 — UX/UI e Design System: telas prioritárias em 1920/1440/1366/tablet/celular, sem rolagem horizontal, sem enums técnicos,
// diálogos, estados vazios/erro, páginas 403/404, menu móvel e screenshots de validação em docs/validacao-etapa-10-5/.
const OUT = 'docs/validacao-etapa-10-5'; mkdirSync(OUT, { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
const RAW_ENUM = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/;
const SIZES = [['1920', 1920, 1080], ['1440', 1440, 900], ['1366', 1366, 768], ['tablet', 820, 1180], ['mobile', 390, 844]] as const;

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function check(page: Page, label: string, opts: { enums?: boolean; wait?: string } = {}) {
  await page.waitForLoadState('networkidle'); if (opts.wait) await page.getByTestId(opts.wait).first().waitFor();
  const extra = await overflow(page); if (extra > 2) fail(`Rolagem horizontal em ${label}: ${extra}px.`);
  if (opts.enums !== false) { const text = (await page.locator('#conteudo').innerText()).split('\n').filter((line) => !/^(PLAN_C|GATE-\d|G\d-C\d+)/.test(line)).join('\n'); const hit = RAW_ENUM.exec(text); if (hit) fail(`Enum técnico visível em ${label}: ${hit[0]}`); }
  const missing = await page.locator('img:not([alt])').count(); if (missing) fail(`Imagem sem texto alternativo em ${label}.`);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));

  // Login (marca, formulário, link "Esqueci minha senha"), página 404 e política pública
  await page.goto(`${base}/login`); await page.getByTestId('login-email').waitFor();
  if (!(await page.locator('.auth-brand .brand-logo').count())) fail('Logo JGM4 ausente no login.');
  if (!(await page.getByTestId('forgot-link').isVisible())) fail('Link "Esqueci minha senha" ausente.');
  await check(page, 'login'); await shot(page, 'login-desktop');
  await page.getByTestId('login-email').fill('naoexiste@exemplo.com'); await page.getByTestId('login-password').fill('senha-errada'); await page.getByTestId('login-submit').click();
  await page.getByTestId('login-error').waitFor(); if (!(await page.getByTestId('login-error').innerText()).includes('E-mail ou senha inválidos')) fail('Mensagem de login deveria ser clara.');
  await page.goto(`${base}/pagina-que-nao-existe`); await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor(); await check(page, '404'); await shot(page, '404');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/login`); await page.getByTestId('login-email').waitFor(); await check(page, 'login mobile'); await shot(page, 'login-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });

  // JGM4 admin: dashboard, projeto, atividade, Gate, aprovações, relatórios, auditoria e administração
  await login(page, 'admin@jgm4.local');
  await page.getByTestId('project-row').first().waitFor(); await check(page, 'dashboard JGM4'); await shot(page, 'dashboard-jgm4-desktop');
  const projects = await (await context.request.get(`${base}/api/projects`)).json() as { id: string; name: string }[];
  const painel = projects.find((p) => p.name === 'Simulação — Painel executivo') ?? fail('Projeto de simulação ausente (npm run db:seed).');
  const tasks = await (await context.request.get(`${base}/api/projects/${painel.id}/tasks`)).json() as { id: string; code: string; status: string }[];
  const gates = await (await context.request.get(`${base}/api/projects/${painel.id}/gates`)).json() as { id: string }[];
  const blocked = tasks.find((t) => t.status === 'BLOCKED') ?? tasks[0];

  const screens: [string, string, string?][] = [
    ['projeto-dashboard', `/projects/${painel.id}/dashboard`, 'dash-title'], ['plano', `/projects/${painel.id}/plan`, 'phase'], ['atividade', `/projects/${painel.id}/tasks/${blocked.id}`], ['atividade-liberada', `/projects/${painel.id}/tasks/${tasks[0].id}`],
    ['solicitacoes', `/projects/${painel.id}/requests`], ['gates', `/projects/${painel.id}/gates`], ['gate-detalhe', `/projects/${painel.id}/gates/${gates[0].id}`], ['aprovacoes', '/approvals', 'approval-row'],
    ['relatorios', `/projects/${painel.id}/reports`, 'rc-executive'], ['auditoria', `/projects/${painel.id}/audit`], ['gestao', `/projects/${painel.id}/manage`, 'status-panel'], ['conta', '/account', 'password-panel'],
    ['admin-empresas', '/admin/companies', 'companies-panel'], ['admin-usuarios', '/admin/users', 'users-panel'], ['admin-projetos', '/admin/projects', 'projects-panel'], ['admin-seguranca', '/admin/security', 'users-panel'],
  ];
  for (const [name, path, wait] of screens) {
    await page.goto(`${base}${path}`);
    // Admin/segurança mostram códigos técnicos de forma controlada (templates); nas demais telas nenhum enum pode aparecer.
    await check(page, name, { wait }); await shot(page, `${name}-desktop`);
  }
  await page.goto(`${base}/admin/templates`); await page.getByTestId('templates-panel').waitFor(); await check(page, 'admin-templates', { enums: false }); await shot(page, 'admin-templates-desktop');

  // Atividade bloqueada: mostra o motivo, sem depender do botão desabilitado
  await page.goto(`${base}/projects/${painel.id}/tasks/${blocked.id}`); await page.waitForLoadState('networkidle');
  if (blocked.status === 'BLOCKED' && !(await page.locator('#conteudo').innerText()).includes('Atividade bloqueada')) fail('Atividade bloqueada deveria exibir "Atividade bloqueada" e o motivo.');

  // Diálogo: motivo obrigatório antes de inativar empresa (cancelar não altera nada)
  await page.goto(`${base}/admin/companies`); await page.getByTestId('company-row').first().waitFor();
  await page.getByTestId('company-row').first().getByRole('button', { name: /Inativar|Reativar/ }).click(); await page.getByTestId('dialog').waitFor();
  await page.getByTestId('dialog-confirm').click(); await page.getByText('Campo obrigatório.').waitFor();
  if ((await page.getByTestId('dialog').getAttribute('aria-modal')) !== 'true') fail('Diálogo sem aria-modal.');
  await shot(page, 'dialogo-desktop'); await page.keyboard.press('Escape'); await page.getByTestId('dialog').waitFor({ state: 'detached' });

  // Estado vazio útil (filtro sem resultado) e acesso negado (403)
  await page.goto(`${base}/admin/users`); await page.getByTestId('user-search').fill('zzzz-nao-existe'); await page.getByText('Nenhum usuário').waitFor();
  await logout(page); await login(page, 'consultor@jgm4.local'); await page.goto(`${base}/admin/users`);
  await page.getByRole('heading', { name: 'Acesso não permitido' }).waitFor(); await check(page, '403'); await shot(page, '403');
  const menu = await page.locator('.sidebar').innerText(); if (menu.includes('Empresas') || menu.includes('Templates')) fail('Consultor não deveria ver o menu de administração.');

  // Cliente: menu enxuto, sem Dashboard JGM4 nem Administração; painel do projeto no celular
  await logout(page); await login(page, 'gestor@ollem.local'); await page.getByTestId('dash-title').waitFor(); const clientDash = page.url();
  const clientMenu = await page.locator('.sidebar').innerText(); if (clientMenu.includes('Administração') || (await page.getByTestId('nav-dashboard').count())) fail('Cliente não deveria ver Dashboard JGM4 nem Administração.');
  for (const [name, width, height] of SIZES) {
    await page.setViewportSize({ width, height }); await page.goto(clientDash); await page.getByTestId('dash-title').waitFor(); await check(page, `dashboard do cliente (${name})`);
    if (name === 'mobile' || name === 'tablet') {
      await shot(page, `dashboard-projeto-${name}`);
      if (await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right > 0)) fail('Menu deveria estar recolhido no celular/tablet.');
      await page.getByTestId('nav-toggle').click(); await page.locator('.sidebar').getByText('Projetos').first().waitFor(); await page.getByTestId('nav-close').click();
      if (!(await page.getByTestId('logout').isVisible())) fail('Sair deve permanecer visível no celular.');
    }
  }
  await logout(page);

  // Tamanhos principais (admin): sem rolagem horizontal em 1920/1440/1366/tablet/celular
  await login(page, 'admin@jgm4.local');
  for (const [name, width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const path of ['/dashboard', `/projects/${painel.id}/dashboard`, `/projects/${painel.id}/plan`, `/projects/${painel.id}/requests`, `/projects/${painel.id}/gates`, '/approvals', '/admin/companies', '/admin/users', '/admin/projects']) { await page.goto(`${base}${path}`); await check(page, `${path} (${name})`, { enums: false }); }
    if (name === 'mobile') { await page.goto(`${base}/dashboard`); await page.getByTestId('project-row').first().waitFor(); await shot(page, 'dashboard-jgm4-mobile'); await page.goto(`${base}/projects/${painel.id}/dashboard`); await page.getByTestId('dash-title').waitFor(); await shot(page, 'dashboard-projeto-mobile'); }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Página de referência do Design System (somente fora de produção)
  await page.goto(`${base}/dev/design-system`); await page.getByTestId('design-system').waitFor(); await shot(page, 'design-system');
  await page.getByTestId('ds-prompt').click(); await page.getByTestId('dialog-value').fill('Teste'); await page.getByTestId('dialog-confirm').click(); await page.getByTestId('ds-answer').filter({ hasText: 'Motivo: Teste' }).waitFor();

  if (errors.length) fail(`Erros de página: ${errors.join(' | ')}`);
  console.log(`Etapa 10.5: login, 404/403, dashboards, plano, atividade, Gates, aprovações, relatórios, auditoria, administração, diálogos, menu por perfil, menu móvel, sem rolagem horizontal em 1920/1440/1366/tablet/celular e sem enums técnicos passaram. Screenshots em ${OUT}/.`);
} finally { await browser.close(); }
void DEV_PASSWORD;
