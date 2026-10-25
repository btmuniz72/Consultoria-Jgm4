import { mkdirSync } from 'node:fs';
import { expect } from '@playwright/test';
import { base, launchBrowser, login, logout } from './browser-helpers.ts';

// Relatórios, exportações, auditoria e gestão do projeto (Etapa 7). Os downloads de PDF/XLSX são conferidos de verdade
// (cabeçalho do arquivo e nome). Requer API (3000), frontend (4200) e `npm run db:seed` (simulações).
mkdirSync('.local/screenshots', { recursive: true });
const browser = await launchBrowser();
const fail = (message: string): never => { throw new Error(message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const projects = async () => await (await context.request.get(`${base}/api/projects`)).json() as { id: string; name: string }[];

  await login(page, 'admin@jgm4.local');
  const list = await projects();
  const painel = list.find((p) => p.name === 'Simulação — Painel executivo') ?? fail('Simulação — Painel executivo ausente (npm run db:seed).');
  const concluido = list.find((p) => p.name === 'Simulação — Implantação concluída') ?? fail('Simulação — Implantação concluída ausente (npm run db:seed).');

  // Central de Relatórios do projeto em andamento.
  await page.goto(`${base}/projects/${painel.id}/reports`);
  await page.getByRole('heading', { name: 'Central de Relatórios' }).waitFor();
  for (const id of ['rc-executive', 'rc-phase', 'rc-gate', 'rc-final', 'rc-action-plan', 'rc-hours', 'rc-requests', 'rc-audit']) await page.getByTestId(id).waitFor();
  if (!(await page.getByTestId('final-view').getAttribute('class'))?.includes('disabled')) fail('Relatório Final deveria estar indisponível antes do Gate final.');
  await page.screenshot({ path: '.local/screenshots/etapa-7-central-desktop.png', fullPage: true });

  // Pré-visualização do executivo e downloads reais.
  await page.getByTestId('rc-executive').getByRole('link', { name: 'Visualizar' }).click();
  await page.getByTestId('report-title').waitFor();
  if ((await page.getByTestId('report-title').innerText()) !== 'Relatório Executivo do Projeto') fail('Título da prévia incorreto.');
  await page.getByText('7. Principais pendências').waitFor(); await page.getByText('9. Próximos passos (até 10)').waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-7-executivo-desktop.png', fullPage: true });
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-download').click()]);
  if (!/^Ollem_Plano_C_Relatorio_Executivo_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.suggestedFilename())) fail(`Nome do PDF inesperado: ${pdf.suggestedFilename()}`);
  const pdfBytes = await (await import('node:fs')).promises.readFile((await pdf.path())!); if (pdfBytes.subarray(0, 5).toString() !== '%PDF-') fail('O arquivo baixado não é um PDF.');
  await page.goto(`${base}/projects/${painel.id}/reports`);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dl-action-plan').click()]);
  if (xlsx.suggestedFilename() !== 'Ollem_Plano_C_Plano_de_Acao.xlsx') fail(`Nome do XLSX inesperado: ${xlsx.suggestedFilename()}`);
  const xlsxBytes = await (await import('node:fs')).promises.readFile((await xlsx.path())!); if (xlsxBytes.subarray(0, 2).toString() !== 'PK') fail('O arquivo baixado não é um XLSX.');
  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByTestId('history-row').first()).toContainText('Plano_de_Acao');

  // Encerramento da fase 1 indisponível (Gate não aprovado); Gate formal; auditoria filtrável.
  if (!(await page.getByTestId('closure-view').getAttribute('class'))?.includes('disabled')) fail('Encerramento deveria estar indisponível.');
  await page.goto(`${base}/projects/${painel.id}/audit`);
  await page.getByTestId('audit-row').first().waitFor();
  await page.locator('select[name="entityType"]').selectOption('Gate');
  await page.getByTestId('audit-search').click();
  await expect(page.getByTestId('audit-row').first()).toContainText('Gate');
  await page.screenshot({ path: '.local/screenshots/etapa-7-auditoria-desktop.png', fullPage: true });

  // Projeto concluído: Relatório Final e Gate com parecer/decisão separados.
  await page.goto(`${base}/projects/${concluido.id}/reports`);
  await page.getByTestId('rc-final').waitFor();
  await page.getByTestId('final-view').click();
  await page.getByTestId('report-title').waitFor();
  for (const title of ['1. Identificação', '5. Resultados por fase', '10. Plano de sustentação', '12. Encerramento']) await page.getByRole('heading', { name: title }).waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-7-final-desktop.png', fullPage: true });
  await page.goto(`${base}/projects/${concluido.id}/reports`);
  await page.getByTestId('rc-gate').getByRole('link', { name: 'Visualizar' }).click();
  await page.getByTestId('callout-technical').waitFor(); await page.getByTestId('callout-client').waitFor();
  await page.getByRole('heading', { name: 'PARECER TÉCNICO JGM4' }).waitFor(); await page.getByRole('heading', { name: 'DECISÃO DO CLIENTE' }).waitFor();
  await page.goto(`${base}/projects/${concluido.id}/reports`);
  await page.getByTestId('closure-view').click();
  await page.getByTestId('report-title').waitFor();
  if (!(await page.getByTestId('report-title').innerText()).startsWith('Relatório de Encerramento da Fase')) fail('Encerramento de fase não abriu.');

  // Gestão do projeto (administrador): formulário de suspensão exige motivo e observação.
  await page.goto(`${base}/projects/${painel.id}/manage`);
  await page.getByTestId('status-panel').waitFor(); await page.getByTestId('open-hold').click();
  await page.getByTestId('status-confirm').click();
  if (await page.getByTestId('manage-notice').count()) fail('Suspensão sem motivo não deveria ser registrada.');
  await page.getByTestId('sustainment-panel').waitFor(); await page.getByTestId('carried-panel').waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-7-gestao-desktop.png', fullPage: true });

  // Perfis: consultor sem gestão de status; cliente de outra empresa não vê o projeto; CLIENT sem aba de gestão.
  await logout(page); await login(page, 'gestor@ollem.local');
  const other = await context.request.get(`${base}/api/projects/${painel.id}/reports/executive`);
  if (other.status() !== 403) fail(`Cliente de outra empresa deveria receber 403 (veio ${other.status()}).`);
  const mine = (await projects())[0];
  await page.goto(`${base}/projects/${mine.id}/reports`);
  await page.getByTestId('rc-executive').waitFor();
  if (await page.getByTestId('nav-manage').count()) fail('Cliente não deveria ver a gestão do projeto.');
  if (await page.getByTestId('nav-audit').count()) fail('Gestor do cliente não deveria ver a auditoria.');
  await logout(page); await login(page, 'operacao@ollem.local');
  await page.goto(`${base}/projects/${mine.id}/reports`);
  const denied = await context.request.get(`${base}/api/projects/${mine.id}/reports/executive`);
  if (denied.status() !== 403) fail(`CLIENT_USER deveria receber 403 nos relatórios (veio ${denied.status()}).`);
  if (await page.getByTestId('nav-reports').count()) fail('CLIENT_USER não deveria ver o link de relatórios.');

  // Mobile e tablet (administrador).
  await logout(page); await login(page, 'admin@jgm4.local');
  for (const [width, height, name] of [[390, 844, 'mobile'], [768, 1024, 'tablet']] as const) {
    await page.setViewportSize({ width, height });
    for (const [path, shot] of [[`/projects/${painel.id}/reports`, 'central'], [`/projects/${painel.id}/reports/view/executive`, 'executivo'], [`/projects/${painel.id}/audit`, 'auditoria'], [`/projects/${painel.id}/manage`, 'gestao']] as const) {
      await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle');
      await page.locator('main').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
      if (overflow > width) fail(`Layout ${name} excede o viewport em ${path}: ${overflow}px`);
      if (name === 'mobile') await page.screenshot({ path: `.local/screenshots/etapa-7-${shot}-mobile.png`, fullPage: true });
    }
  }
  if (errors.length) fail(`Erros de JavaScript: ${errors.join(' | ')}`);
  console.log('Etapa 7: Central de Relatórios, prévia, downloads PDF/XLSX, histórico, Gate, final, auditoria, gestão, perfis, desktop, tablet e mobile passaram.');
} finally { await browser.close(); }
