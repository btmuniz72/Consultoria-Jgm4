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
const schema = `jgm4_browser_stage3_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(process.env.DATABASE_URL!); testUrl.searchParams.set('schema', schema);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const output = resolve(root, '.local', 'screenshots'); mkdirSync(output, { recursive: true });
const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const apis: ReturnType<typeof spawn>[] = []; let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let useClient = false;
async function assertPortAvailable(port: number) {
  const server = createServer();
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(() => done())); });
}
async function waitForApi(port: number, api: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null) throw new Error(`API de teste na porta ${port} encerrou antes de iniciar.`);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`API de teste não ficou disponível na porta ${port}.`);
}
async function call(port: number, method: string, path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`API ${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json() as Promise<any>;
}

try {
  await assertPortAvailable(3001); await assertPortAvailable(3002);
  const sql = await pool.connect();
  try {
    await sql.query(`CREATE SCHEMA "${schema}"`); await sql.query(`SET search_path TO "${schema}"`);
    for (const folder of readdirSync(resolve(root, 'backend/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      const migration = readFileSync(resolve(root, `backend/prisma/migrations/${folder}/migration.sql`), 'utf8');
      if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await sql.query(migration.slice(0, boundary)); await sql.query(migration.slice(boundary)); }
      else await sql.query(migration);
    }
  } finally { sql.release(); }
  const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(root, 'backend'), env: { ...process.env, OLLEM_LEGACY_FIXTURE: 'true', DATABASE_URL: testUrl.toString() }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (seed.status !== 0) throw new Error('Não foi possível preparar o seed isolado do navegador.');
  for (const [port, role] of [[3001, 'JGM4'], [3002, 'CLIENT']] as const) {
    const api = spawn(process.execPath, ['backend/dist/main.js'], { cwd: root, env: { ...process.env, DATABASE_URL: testUrl.toString(), PORT: String(port), JGM4_LOCAL_ACTOR: role, ALLOW_DEV_ACTOR_HEADER: 'true' }, windowsHide: true, stdio: 'ignore' });
    apis.push(api); await waitForApi(port, api);
  }
  const tasks = await call(3001, 'GET', `/projects/${projectId}/tasks`) as { id: string; code: string; plannedJgm4Hours: number }[];
  const c05 = tasks.find((item) => item.code === 'C05'); if (!c05) throw new Error('A atividade C05 não foi criada.');
  const summary = await call(3001, 'GET', `/projects/${projectId}/activity-summary/phases`) as { plannedJgm4Hours: number }[];
  expect(summary.map((phase) => phase.plannedJgm4Hours)).toEqual([36, 39, 47, 39, 37]);
  const projectSummary = await call(3001, 'GET', `/projects/${projectId}/activity-summary`) as { plannedJgm4Hours: number };
  expect(projectSummary.plannedJgm4Hours).toBe(198);

  // Finaliza SOL-006 no schema temporário para exercitar a liberação automática sem tocar nos dados da Ollem.
  const requests = await call(3001, 'GET', `/projects/${projectId}/requests`) as { id: string; code: string; requirements: { id: string }[] }[];
  const sol006 = requests.find((item) => item.code === 'SOL-006'); if (!sol006) throw new Error('SOL-006 não foi criada.');
  const requestPath = `/projects/${projectId}/requests/${sol006.id}`;
  await call(3001, 'POST', `${requestPath}/request`, {}); await call(3001, 'POST', `${requestPath}/start`, {});
  let req = await call(3001, 'GET', requestPath) as { version: number; requirements: { id: string; completed: boolean }[] };
  for (const item of req.requirements) req = await call(3001, 'PATCH', `${requestPath}/requirements/${item.id}`, { completed: true, expectedVersion: req.version }) as typeof req;
  await call(3001, 'POST', `${requestPath}/send`, { expectedVersion: req.version });
  await call(3001, 'POST', `${requestPath}/start-review`, {}); await call(3001, 'POST', `${requestPath}/accept`, {});
  const released = await call(3001, 'GET', `/projects/${projectId}/tasks/${c05.id}`) as { status: string };
  expect(released.status).toBe('RELEASED');

  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url()); requestUrl.host = `127.0.0.1:${useClient ? '3002' : '3001'}`;
    const response = await route.fetch({ url: requestUrl.toString() }); await route.fulfill({ response });
  });
  await page.goto('http://127.0.0.1:4200/');
  await expect(page.getByRole('heading', { name: 'Central de projetos' })).toBeVisible();
  await expect(page.locator('.brand-logo')).toHaveJSProperty('naturalWidth', 1080);
  await page.goto(`http://127.0.0.1:4200/projects/${projectId}/plan`);
  await expect(page.locator('.phase-card').first().getByText('36 h').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /C05 · Zoneamento/ })).toContainText('Liberada');
  await page.getByRole('link', { name: /C05 · Zoneamento/ }).click();
  await expect(page.getByRole('heading', { name: 'C05 · Zoneamento' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar atividade' }).click();
  await expect(page.getByText('Em andamento', { exact: true })).toBeVisible();
  await page.locator('input[name="hours"]').fill('3.2'); await page.locator('input[name="timeDescription"]').fill('Medição do zoneamento');
  await page.getByRole('button', { name: 'Registrar horas' }).click();
  await expect(page.getByText('ATENÇÃO — 80% das horas planejadas consumidas.')).toBeVisible();
  useClient = true; await page.reload();
  const checkboxes = page.locator('.check-item input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(2);
  for (let index = 0; index < await checkboxes.count(); index++) await checkboxes.nth(index).check();
  await page.getByRole('button', { name: 'Enviar para validação' }).click(); await expect(page.getByText('Aguardando evidências', { exact: true })).toBeVisible();
  await page.locator('input[name="evidenceDescription"]').fill('Registro visual do novo zoneamento');
  await page.getByRole('button', { name: 'Adicionar evidência' }).click();
  await page.getByRole('button', { name: 'Enviar evidências à JGM4' }).click(); await expect(page.getByText('Aguardando validação JGM4', { exact: true })).toBeVisible();
  useClient = false; await page.reload();
  await page.getByRole('button', { name: 'Validar atividade' }).click(); await expect(page.getByText('Validada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir atividade' }).click(); await expect(page.getByText('Concluída', { exact: true })).toBeVisible();
  await expect(page.getByText('3.2 h realizadas')).toBeVisible();
  await page.screenshot({ path: resolve(output, 'etapa-3-atividade-c05.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(output, 'etapa-3-atividade-mobile.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
  console.log('Etapa 3 navegador OK: logo, distribuição 198 h, SOL-006/C05, início, 80%, checklist, evidência, validação, conclusão e mobile.');
} finally {
  try {
    if (browser) { for (const context of browser.contexts()) for (const page of context.pages()) await page.unrouteAll({ behavior: 'wait' }); await browser.close(); }
  } finally {
    try { for (const api of apis) if (api.exitCode === null) { const exited = once(api, 'exit'); api.kill(); await exited; } }
    finally { if (!/^jgm4_browser_stage3_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de teste inválido.'); try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } }
  }
}
