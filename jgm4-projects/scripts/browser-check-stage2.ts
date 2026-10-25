import { chromium, expect } from '@playwright/test';
import { config } from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
config({ path: resolve(root, '.env'), quiet: true });
const schema = `jgm4_browser_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema', schema);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const output = resolve(root, '.local', 'screenshots'); mkdirSync(output, { recursive: true });
const projectId = '9f1ead00-1c44-4000-8000-000000000002';
let api: ReturnType<typeof spawn> | undefined; let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const portCheck = createServer();
  await new Promise<void>((done, reject) => { portCheck.once('error', reject); portCheck.listen(3001, '127.0.0.1', () => portCheck.close(() => done())); });
  const sql = await pool.connect();
  try {
    await sql.query(`CREATE SCHEMA "${schema}"`); await sql.query(`SET search_path TO "${schema}"`);
    for (const path of readdirSync(resolve(root, 'backend/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      const migration = readFileSync(resolve(root, `backend/prisma/migrations/${path}/migration.sql`), 'utf8');
      if (path === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await sql.query(migration.slice(0, boundary)); await sql.query(migration.slice(boundary)); }
      else await sql.query(migration);
    }
  } finally { sql.release(); }
  const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(root, 'backend'), env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (seed.status !== 0) throw new Error('Falha ao preparar seed do schema isolado do navegador.');
  api = spawn(process.execPath, ['backend/dist/main.js'], { cwd: root, env: { ...process.env, DATABASE_URL: url.toString(), PORT: '3001', ALLOW_DEV_ACTOR_HEADER: 'true', JGM4_LOCAL_ACTOR: 'JGM4' }, windowsHide: true, stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null) throw new Error('API de teste encerrou antes de iniciar.');
    try { const result = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(1500) }); ready = result.ok; } catch {}
    if (ready) break;
    await new Promise((done) => setTimeout(done, 600));
  }
  if (!ready) throw new Error('API de teste não ficou disponível na porta 3001.');
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  // Interface real e API real, com persistência somente no namespace de teste.
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url()); requestUrl.host = '127.0.0.1:3001';
    const response = await route.fetch({ url: requestUrl.toString() }); await route.fulfill({ response });
  });
  await page.goto('http://127.0.0.1:4200/');
  await expect(page.getByRole('heading', { name: 'Central de projetos' })).toBeVisible();
  await expect(page.getByTestId('home-project').filter({ hasText: 'Estruturação do Almoxarifado' })).toHaveCount(1);
  await page.screenshot({ path: resolve(output, 'etapa-2-inicio.png'), fullPage: true });
  await page.getByTestId('home-project').filter({ hasText: 'Estruturação do Almoxarifado' }).getByRole('link', { name: /Solicitações.*Envie/ }).click();
  await expect(page.getByTestId('request-row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Disponíveis', exact: true }).click(); await expect(page.getByTestId('request-row')).toHaveCount(6);
  await page.getByRole('button', { name: 'Bloqueadas', exact: true }).click(); await expect(page.getByTestId('request-row')).toHaveCount(4);
  await expect(page.getByText('Gate anterior não aprovado: GATE-0.')).toBeVisible();
  await page.getByRole('link', { name: 'SOL-007', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar à Ollem' })).toHaveCount(0);
  await page.getByRole('link', { name: '← Voltar à fila' }).click();
  await page.getByRole('link', { name: 'SOL-006', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Levantamento dimensional do Depósito 01' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar à Ollem', exact: true }).click(); await expect(page.getByTestId('request-status')).toHaveText('Solicitada à Ollem');
  await page.getByRole('button', { name: 'Iniciar preparação' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Ollem preparando');
  await expect(page.getByRole('button', { name: 'Enviar resposta à JGM4' })).toBeDisabled();
  for (const label of ['Comprimento e largura', 'Corredores', 'Pilares', 'Acessos', 'Estruturas existentes', 'Croqui consolidado']) {
    await page.getByRole('checkbox', { name: new RegExp(label) }).check();
    await expect(page.getByRole('checkbox', { name: new RegExp(label) })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: new RegExp(label) })).toBeEnabled();
  }
  await page.locator('#request-note').fill('Resposta de teste isolado: levantamento e croqui consolidados.');
  await page.getByRole('button', { name: 'Enviar resposta à JGM4' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Enviada à JGM4');
  await page.getByRole('button', { name: 'Iniciar análise JGM4' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Em análise JGM4');
  await page.locator('#request-note').fill('Detalhar a largura dos corredores.'); await page.getByRole('button', { name: 'Solicitar ajuste', exact: true }).click();
  await expect(page.getByTestId('request-status')).toHaveText('Ajuste solicitado');
  await page.getByRole('button', { name: 'Iniciar preparação' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Ollem preparando');
  await page.getByRole('button', { name: 'Enviar resposta à JGM4' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Enviada à JGM4');
  await page.getByRole('button', { name: 'Iniciar análise JGM4' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Em análise JGM4');
  await page.getByRole('button', { name: 'Aceitar solicitação' }).click(); await expect(page.getByTestId('request-status')).toHaveText('Aceita');
  const tasks = await (await fetch(`http://127.0.0.1:3001/api/projects/${projectId}/tasks`)).json() as { code: string; blockedByRequests: boolean; status: string }[];
  expect(tasks.find((task) => task.code === 'C05')).toMatchObject({ blockedByRequests: false, status: 'RELEASED' });
  await page.screenshot({ path: resolve(output, 'etapa-2-solicitacao.png'), fullPage: true });
  await page.getByRole('link', { name: 'Reunião de alinhamento', exact: true }).click();
  await expect(page.getByTestId('alignment-section')).toHaveCount(17);
  const hostileText = 'Registro de teste <script>window.executouConteudo=true</script> & observações';
  await page.locator('#meeting-participants').fill('Participantes de teste isolado');
  await page.locator('#s0q0').fill(hostileText); await page.reload();
  await expect(page.locator('#s0q0')).toHaveValue(hostileText);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar documento preenchível' }).first().click();
  const download = await downloadEvent; const documentPath = resolve(output, 'alinhamento-preenchivel-teste.html'); await download.saveAs(documentPath);
  const documentPage = await context.newPage(); await documentPage.goto(`file:///${documentPath.replaceAll('\\', '/')}`);
  await expect(documentPage.locator('[data-key="s0q0"]')).toHaveValue(hostileText);
  expect(await documentPage.evaluate(() => 'executouConteudo' in window)).toBe(false);
  await documentPage.locator('[data-key="s0q0"]').fill('Documento editado fora da aplicação.');
  const savedEvent = documentPage.waitForEvent('download'); await documentPage.getByRole('button', { name: 'Salvar cópia preenchida' }).click();
  const saved = await savedEvent; const savedPath = resolve(output, 'alinhamento-copia-teste.html'); await saved.saveAs(savedPath);
  await documentPage.goto(`file:///${savedPath.replaceAll('\\', '/')}`); await expect(documentPage.locator('[data-key="s0q0"]')).toHaveValue('Documento editado fora da aplicação.');
  await documentPage.close();
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('.print-answer').first()).toContainText(hostileText); await expect(page.locator('#s0q0')).toBeHidden();
  await page.pdf({ path: resolve(output, 'alinhamento-impressao-teste.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: resolve(output, 'etapa-2-alinhamento.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto(`http://127.0.0.1:4200/projects/${projectId}/requests`); await expect(page.getByTestId('request-row')).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(output, 'etapa-2-fila-mobile.png'), fullPage: true });
  await page.goto('http://127.0.0.1:4200/'); await expect(page.getByTestId('home-project').filter({ hasText: 'Estruturação do Almoxarifado' })).toHaveCount(1);
  await page.screenshot({ path: resolve(output, 'etapa-2-inicio-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  console.log('Etapa 2 navegador OK: início, filtros, bloqueio, ciclo completo com ajuste e aceite, C05, 17 partes do roteiro, rascunho, documento editável independente, impressão/PDF, escape de conteúdo e mobile.');
} finally {
  try {
    if (browser) {
      for (const context of browser.contexts()) for (const page of context.pages()) await page.unrouteAll({ behavior: 'wait' });
      await browser.close();
    }
  } finally {
    try {
      if (api && api.exitCode === null) { const exited = once(api, 'exit'); api.kill(); await exited; }
    } finally {
      if (!/^jgm4_browser_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
      try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
    }
  }
}
