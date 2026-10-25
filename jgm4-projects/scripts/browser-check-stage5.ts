import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Verificação visual somente leitura da Central de Aprovações (não grava decisões no banco local).
// Requer API (3000) e frontend (4200) em execução e o seed com o cenário de demonstração.
const base = 'http://127.0.0.1:4200';
mkdirSync('.local/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${base}/approvals`);
  await page.getByRole('heading', { name: 'O que está aguardando minha ação?' }).waitFor();
  await page.getByTestId('approval-row').first().waitFor();
  const total = Number(await page.getByTestId('total-pending').innerText());
  if (total < 4) throw new Error(`Esperava ao menos 4 pendências do cenário de demonstração, recebi ${total}.`);
  for (const label of ['Solicitações', 'Atividades', 'Gates', 'Alterações']) await page.locator('.approval-card', { hasText: label }).waitFor();
  const badge = Number(await page.getByTestId('approvals-count').innerText());
  if (badge !== total) throw new Error(`Badge (${badge}) diferente do total da Central (${total}).`);
  for (const header of ['Tipo', 'Código', 'Projeto', 'Descrição', 'Responsável', 'Recebido em', 'Prazo', 'Prioridade', 'Ação']) await page.getByRole('columnheader', { name: header, exact: true }).waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-5-central-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Gates', exact: true }).first().click();
  await page.getByText('Parecer técnico JGM4').first().waitFor();

  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('tr', { hasText: 'SOL-006' }).getByRole('link', { name: 'Decidir' }).click();
  await page.getByTestId('approval-detail').waitFor();
  for (const text of ['SOL-006', 'Enviado por', 'Enviado em', 'Responsável atual', 'Próxima ação', 'Comprimento e largura']) await page.getByTestId('approval-detail').getByText(text).first().waitFor();
  for (const id of ['btn-approve', 'btn-adjust', 'btn-reject']) await page.getByTestId(id).waitFor();
  await page.getByTestId('btn-adjust').click();
  await page.getByTestId('btn-confirm').click(); // campos obrigatórios impedem o envio vazio
  if (await page.getByText('Decisão registrada').count()) throw new Error('Ajuste sem motivo não deveria ser registrado.');
  await page.screenshot({ path: '.local/screenshots/etapa-5-detalhe-desktop.png', fullPage: true });

  // Perfil sem alçada: CLIENT_MANAGER não vê pendências nem botões.
  await page.evaluate(() => localStorage.setItem('jgm4.actorRole', 'CLIENT_MANAGER'));
  await page.goto(`${base}/approvals`);
  await page.getByText('Nada aguardando sua ação neste filtro.').waitFor();
  // Patrocinador: só a decisão do Gate, quando houver; nunca o parecer técnico.
  await page.evaluate(() => localStorage.setItem('jgm4.actorRole', 'CLIENT_SPONSOR'));
  await page.goto(`${base}/approvals`);
  await page.getByRole('heading', { name: 'O que está aguardando minha ação?' }).waitFor();
  // No cenário de demonstração ainda não há decisão de patrocinador pendente: a fila deve estar vazia.
  await page.getByText('Nada aguardando sua ação neste filtro.').waitFor();
  await page.evaluate(() => localStorage.removeItem('jgm4.actorRole'));

  // Bloco do projeto de simulação e mobile.
  const projects: { id: string; name: string }[] = await (await fetch('http://127.0.0.1:3000/api/projects')).json();
  const demo = projects.find((p) => p.name.startsWith('Simulação — Solicitações'));
  if (!demo) throw new Error('Projeto de simulação ausente. Execute npm run db:seed.');
  await page.goto(`${base}/projects/${demo.id}/plan`);
  await page.getByTestId('pending-block').getByText('Aguardando decisão', { exact: false }).first().waitFor();
  await page.getByTestId('pending-block').getByRole('link', { name: /SOL-006/ }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/approvals', `/projects/${demo.id}/plan`]) {
    await page.goto(`${base}${path}`);
    await page.waitForLoadState('networkidle');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 390) throw new Error(`Layout mobile excede o viewport em ${path}: ${width}px`);
  }
  await page.goto(`${base}/approvals`);
  await page.getByTestId('approval-row').first().waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-5-central-mobile.png', fullPage: true });
  console.log('Etapa 5: Central, cards, badge, detalhe, alçadas, bloco do projeto e mobile passaram.');
} finally { await browser.close(); }
