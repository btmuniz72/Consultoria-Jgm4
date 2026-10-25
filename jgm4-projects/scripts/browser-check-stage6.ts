import { mkdirSync } from 'node:fs';
import { expect } from '@playwright/test';
import { apiBase, base, launchBrowser, login, logout } from './browser-helpers.ts';

// Dashboard executivo (Etapa 6): carteira JGM4, painel do projeto, drill-down, perfis e mobile. Somente leitura.
// Requer API (3000), frontend (4200) e `npm run db:seed` (cenário "Simulação — Painel executivo").
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
const num = async (locator: ReturnType<import('@playwright/test').Page['locator']>) => Number((await locator.innerText()).replace(/\D+/g, ' ').trim().split(' ')[0]);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));

  // Administrador: após o login vai para a carteira com todos os projetos.
  await login(page, 'admin@jgm4.local');
  await page.waitForURL(/\/dashboard$/);
  await page.getByTestId('project-table').waitFor();
  await page.getByTestId('project-row').first().waitFor();
  const names = await page.getByTestId('project-row').locator('td:nth-child(2) a').allInnerTexts();
  for (const expected of ['Estruturação do Almoxarifado', 'Simulação — Painel executivo', 'Simulação — Solicitações e atividades', 'Simulação — Parecer de Gate']) if (!names.includes(expected)) fail(`Projeto ausente na carteira: ${expected}`);
  for (const id of ['card-active', 'card-attention', 'card-critical', 'card-approvals', 'card-hours', 'card-overdue']) await page.getByTestId(id).waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-6-carteira-desktop.png', fullPage: true });
  // Filtro por saúde: "Em atenção" mostra somente projetos em atenção (o painel executivo da simulação).
  await page.getByTestId('card-attention').click();
  await expect(page.getByTestId('project-row').locator('.health-normal')).toHaveCount(0);
  await expect(page.getByTestId('project-row').filter({ hasText: 'Simulação — Painel executivo' })).toHaveCount(1);
  await page.getByTestId('card-attention').click(); // limpa o filtro

  // Drill-down: carteira → painel do projeto.
  await page.getByRole('link', { name: 'Simulação — Painel executivo' }).click();
  await page.getByTestId('dash-title').waitFor();
  if ((await page.getByTestId('dash-title').innerText()) !== 'Simulação — Painel executivo') fail('Título do painel incorreto.');
  if (!(await page.getByTestId('dash-phase').innerText()).includes('Fase 1 — Controlar')) fail('Fase atual incorreta.');
  if (!(await page.getByTestId('dash-health').innerText()).includes('Atenção')) fail('Saúde deveria ser Atenção.');
  if (!(await page.getByTestId('dash-status').innerText()).includes('Em andamento')) fail('Status deveria ser Em andamento.');
  if (await num(page.getByTestId('dash-progress').locator('strong')) !== 30) fail('Progresso esperado: 30% (10 de 33 atividades).');
  if (await num(page.getByTestId('dash-hours-jgm4').locator('strong')) !== 66) fail('Horas JGM4 realizadas esperadas: 66 h.');
  if (await num(page.getByTestId('dash-overdue').locator('strong')) !== 2) fail('Itens atrasados esperados: 2.');
  if (await num(page.getByTestId('dash-approvals').locator('strong')) !== 3) fail('Aprovações pendentes esperadas: 3.');
  await page.getByTestId('dash-health-block').getByText('2 itens atrasados.').waitFor();
  await page.getByTestId('dash-health-block').getByText(/Fase 1: 82% das horas JGM4/).waitFor();
  if (await page.getByTestId('dash-timeline').locator('li').count() !== 5) fail('A linha do tempo deveria ter 5 fases.');
  if (await page.getByTestId('dash-phase-row').count() !== 5) fail('Deveria haver 5 linhas de fase.');
  await page.getByTestId('dash-gate').getByText(/Gate 1 — Controle funcionando/).waitFor();
  await page.getByTestId('dash-gate').getByText(/4\/9 critérios/).waitFor();
  await page.getByTestId('dash-next-actions').getByTestId('dash-action-row').first().waitFor();
  await page.getByTestId('dash-critical').waitFor();
  await page.getByTestId('dash-my-queue').getByText(/Você tem \d+ pendências?/).waitFor();
  if (await page.getByTestId('dash-recent').locator('li').count() < 5) fail('Esperava ao menos 5 movimentações recentes.');
  await page.getByTestId('dash-requests').waitFor(); await page.getByTestId('dash-tasks').waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-6-projeto-desktop.png', fullPage: true });
  // Cards navegáveis: atrasados (âncora) e aprovações (Central filtrada pelo projeto).
  await page.getByTestId('dash-overdue').click();
  await page.waitForURL(/#atrasos$/);
  await page.getByTestId('dash-delays').getByTestId('dash-action-row').first().waitFor();
  await page.getByTestId('dash-approvals').click();
  await page.waitForURL(/\/approvals\?projectId=/);
  await page.getByTestId('approval-row').first().waitFor();

  // Consultor JGM4 (vínculos): cai na carteira.
  await logout(page);
  await login(page, 'consultor@jgm4.local');
  await page.waitForURL(/\/dashboard$/);
  await page.getByTestId('project-row').first().waitFor();

  // Cliente com um único projeto vai direto ao painel dele; não acessa a carteira da JGM4.
  await logout(page);
  await login(page, 'gestor@ollem.local');
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/dashboard$/);
  await page.getByTestId('dash-title').waitFor();
  if (await page.getByTestId('nav-dashboard').count()) fail('Cliente não deveria ver o link da carteira JGM4.');
  await page.goto(`${base}/dashboard`);
  await page.getByText('Este painel é exclusivo da equipe JGM4').waitFor();
  const projects = await (await context.request.get(`${apiBase}/projects`)).json() as { id: string; name: string }[];
  const foreign = await context.request.get(`${apiBase}/projects/${'9f1ead00-1c44-4000-8000-0000000000d4'}/dashboard`);
  if (foreign.status() !== 403) fail(`Dashboard de outra empresa deveria ser 403 (veio ${foreign.status()}).`);
  if (projects.length !== 1) fail('Cliente deveria listar somente o próprio projeto.');

  // Cliente com vários projetos (demonstração) cai na Home e consegue abrir o painel de cada projeto.
  await logout(page);
  await login(page, 'gestor@demo.ollem.local');
  await page.waitForURL(`${base}/`);
  await page.getByTestId('home-project').first().waitFor();

  // Mobile: carteira e painel do projeto sem rolagem horizontal; cartões empilhados.
  await logout(page);
  await login(page, 'admin@jgm4.local');
  await page.setViewportSize({ width: 390, height: 844 });
  const demo = (await (await context.request.get(`${apiBase}/projects`)).json() as { id: string; name: string }[]).find((p) => p.name === 'Simulação — Painel executivo') ?? fail('Projeto de simulação ausente.');
  for (const path of ['/dashboard', `/projects/${demo.id}/dashboard`]) {
    await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle');
    await page.locator('main.dashboard').waitFor();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 390) fail(`Layout mobile excede o viewport em ${path}: ${width}px`);
    await page.screenshot({ path: `.local/screenshots/etapa-6-${path === '/dashboard' ? 'carteira' : 'projeto'}-mobile.png`, fullPage: true });
  }
  // Tablet (768 px): sem estouro horizontal.
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of ['/dashboard', `/projects/${demo.id}/dashboard`]) {
    await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle');
    if (await page.evaluate(() => document.documentElement.scrollWidth) > 768) fail(`Layout tablet excede o viewport em ${path}.`);
  }
  if (errors.length) fail(`Erros de JavaScript na página: ${errors.join(' | ')}`);
  console.log('Etapa 6: carteira, painel do projeto, cards, horas, Gate, atrasos, saúde, drill-down, perfis, desktop, tablet e mobile passaram.');
} finally { await browser.close(); }
