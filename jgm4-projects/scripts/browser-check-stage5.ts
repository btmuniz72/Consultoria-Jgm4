import { mkdirSync } from 'node:fs';
import { base, launchBrowser, login, logout } from './browser-helpers.ts';

// Verificação de navegador da Central de Aprovações e do login (Etapas 5 e 5.1). Não grava decisões.
// Requer API (3000) e frontend (4200) em execução e `npm run db:seed` (usuários e cenário de demonstração).
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // Rota protegida sem sessão → login; credencial inválida não entra e não expõe detalhes.
  await page.goto(`${base}/approvals`);
  await page.waitForURL(/\/login/);
  await page.getByTestId('login-email').fill('admin@jgm4.local');
  await page.getByTestId('login-password').fill('senha-errada');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('login-error').waitFor();
  if (!page.url().includes('/login')) fail('Credencial inválida não deveria sair do login.');

  // JGM4 Administrador: vê as quatro pendências do cenário e o usuário atual no cabeçalho.
  await login(page, 'admin@jgm4.local');
  await page.goto(`${base}/approvals`);
  await page.getByRole('heading', { name: 'O que está aguardando minha ação?' }).waitFor();
  await page.getByTestId('approval-row').first().waitFor();
  const user = await page.getByTestId('current-user').innerText();
  if (!user.includes('Administrador JGM4') || !user.includes('JGM4 Administrador')) fail(`Cabeçalho sem nome/perfil: ${user}`);
  const total = Number(await page.getByTestId('total-pending').innerText());
  if (total < 4) fail(`Esperava ao menos 4 pendências do cenário de demonstração, recebi ${total}.`);
  for (const label of ['Solicitações', 'Atividades', 'Gates', 'Alterações']) await page.locator('.approval-card', { hasText: label }).waitFor();
  const badge = Number(await page.getByTestId('approvals-count').innerText());
  if (badge !== total) fail(`Badge (${badge}) diferente do total da Central (${total}).`);
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
  if (await page.getByText('Decisão registrada').count()) fail('Ajuste sem motivo não deveria ser registrado.');
  await page.screenshot({ path: '.local/screenshots/etapa-5-detalhe-desktop.png', fullPage: true });

  // Descobre os projetos de simulação pela API autenticada (cookie da sessão).
  const projects = await (await context.request.get(`${base}/api/projects`)).json() as { id: string; name: string }[];
  const demo = projects.find((p) => p.name.startsWith('Simulação — Solicitações')) ?? fail('Projeto de simulação ausente. Execute npm run db:seed.');
  const ollem = projects.find((p) => p.name === 'Estruturação do Almoxarifado') ?? fail('Projeto Ollem ausente.');
  await page.goto(`${base}/projects/${demo.id}/plan`);
  await page.getByTestId('pending-block').getByRole('link', { name: /SOL-006/ }).waitFor();

  // Consultor JGM4 vinculado aos projetos: acessa e vê as pendências técnicas, não as de prazo (exigem administrador).
  await logout(page);
  await login(page, 'consultor@jgm4.local');
  await page.goto(`${base}/approvals`);
  await page.getByTestId('approval-row').first().waitFor();
  if (await page.locator('tr', { hasText: 'Alteração de prazo' }).count()) fail('Consultor não deveria ver a decisão de prazo (alçada de administrador).');

  // Gestor Ollem: sem pendências; acessa o próprio projeto, mas não o de outra empresa (403 do backend).
  await logout(page);
  await login(page, 'gestor@ollem.local');
  await page.goto(`${base}/approvals`);
  await page.getByText('Nada aguardando sua ação neste filtro.').waitFor();
  const own = await context.request.get(`${base}/api/projects/${ollem.id}`);
  const other = await context.request.get(`${base}/api/projects/${demo.id}`);
  if (own.status() !== 200) fail(`Gestor deveria acessar o projeto Ollem (HTTP ${own.status()}).`);
  if (other.status() !== 403) fail(`Gestor não deveria acessar projeto de outra empresa (HTTP ${other.status()}).`);
  await page.goto(`${base}/projects/${demo.id}/plan`);
  await page.getByText('Consulta indisponível').waitFor(); // a tela mostra o erro em vez de dados de outro cliente
  const sidebar = await (await context.request.get(`${base}/api/projects`)).json() as { id: string }[];
  if (sidebar.length !== 1 || sidebar[0].id !== ollem.id) fail('Lista de projetos do gestor deveria conter somente o projeto Ollem.');

  // Patrocinador da demonstração: fila vazia (não há decisão de Gate pendente) e nunca o parecer técnico.
  await logout(page);
  await login(page, 'sponsor@demo.ollem.local');
  await page.goto(`${base}/approvals`);
  await page.getByText('Nada aguardando sua ação neste filtro.').waitFor();

  // Mobile (administrador).
  await logout(page);
  await login(page, 'admin@jgm4.local');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/approvals', `/projects/${demo.id}/plan`, '/login']) {
    if (path === '/login') await logout(page); else await page.goto(`${base}${path}`);
    await page.waitForLoadState('networkidle');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 390) fail(`Layout mobile excede o viewport em ${path}: ${width}px`);
  }
  await page.screenshot({ path: '.local/screenshots/etapa-5-1-login-mobile.png', fullPage: true });
  await login(page, 'admin@jgm4.local');
  await page.goto(`${base}/approvals`);
  await page.getByTestId('approval-row').first().waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-5-central-mobile.png', fullPage: true });
  console.log('Etapas 5 e 5.1: login, rotas protegidas, perfis, isolamento por empresa, Central, bloco do projeto e mobile passaram.');
} finally { await browser.close(); }
