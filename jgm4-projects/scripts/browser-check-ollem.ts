import { expect, chromium } from '@playwright/test';
import { config } from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';

const require = createRequire(import.meta.url); const root = process.cwd(); config({ path: resolve(root, '.env'), quiet: true });
const schema = `ollem_browser_${randomUUID().replaceAll('-', '')}`; const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const testUrl = new URL(process.env.DATABASE_URL!); testUrl.searchParams.set('schema', schema);
const origin = 'http://127.0.0.1:3017'; const appBase = `${origin}/projetos`; const projectId = '9f1ead00-1c44-4000-8000-000000000002'; const password = 'Jgm4-Dev-2026!';
const output = resolve(root, '.local/screenshots/ollem'); mkdirSync(output, { recursive: true });
let api: ReturnType<typeof spawn> | undefined; let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const build = spawnSync(process.execPath, ['scripts/build-frontend.mjs'], { cwd: root, env: { ...process.env, PUBLIC_BASE_PATH: '/projetos', API_BASE_PATH: '/api' }, windowsHide: true, encoding: 'utf8', timeout: 240000 });
  if (build.status !== 0) throw new Error('Build Angular com base /projetos/ falhou: ' + (build.stderr || build.stdout).slice(-3000));
  const sql = await pool.connect();
  try {
    await sql.query(`CREATE SCHEMA "${schema}"`); await sql.query(`SET search_path TO "${schema}"`);
    for (const dir of readdirSync(resolve(root, 'backend/prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()) {
      const migration = readFileSync(resolve(root, 'backend/prisma/migrations', dir, 'migration.sql'), 'utf8');
      if (dir === '20261023000200_gates') { const i = migration.indexOf('-- The first phase remains'); await sql.query(migration.slice(0, i)); await sql.query(migration.slice(i)); } else await sql.query(migration);
    }
  } finally { sql.release(); }
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: testUrl.toString(), FRONTEND_ORIGIN: origin, ALLOWED_ORIGINS: origin, PUBLIC_APP_URL: `${origin}/projetos`, PUBLIC_BASE_PATH: '/projetos', API_BASE_PATH: '/api', PRIVACY_CONTACT_EMAIL: 'privacidade@example.test', ALLOW_DEV_ACTOR_HEADER: 'false', BCRYPT_COST: '4', RATE_LIMIT_LOGIN_PER_IP: '5000' };
  delete env.OLLEM_LEGACY_FIXTURE;
  const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(root, 'backend'), env, windowsHide: true, encoding: 'utf8', timeout: 120000 });
  if (seed.status !== 0) throw new Error('Seed isolado falhou: ' + seed.stderr);
  api = spawn(process.execPath, ['backend/dist/main.js'], { cwd: root, env: { ...env, PORT: '3017', FRONTEND_DIST_DIR: resolve(root, 'frontend/dist/frontend/browser') }, stdio: 'ignore', windowsHide: true });
  let ready = false;
  for (let n = 0; n < 900; n++) { if (n > 0 && n % 120 === 0) console.log('Aguardando inicialização da API isolada...'); if (api.exitCode !== null) throw new Error('API de teste encerrou.'); try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  if (!ready) throw new Error('API de teste indisponível.');
  for (const route of ['/projetos/login', '/projetos/dashboard', `/projetos/projects/${projectId}/dashboard`, '/projetos/forbidden', '/projetos/rota-inexistente']) {
    const response = await fetch(`${origin}${route}`); const body = await response.text();
    expect(response.status, route).toBe(200); expect(body, route).toContain('<app-root');
  }
  expect((await fetch(`${origin}/projetos`)).status).toBe(200);
  expect((await fetch(`${origin}/projetos/rota-inexistente`)).headers.get('x-robots-tag')).toContain('noindex');
  const smoke = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/smoke-external.ts'], { cwd: root, env: { ...env, BASE_URL: `${origin}/projetos` }, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (smoke.status !== 0) throw new Error(`Smoke local com BASE_URL em /projetos falhou:\n${smoke.stdout}\n${smoke.stderr}`);
  console.log(smoke.stdout.trim());
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|Refused to (apply|execute|load)/i.test(message.text())) errors.push(message.text()); });
  await page.goto(`${appBase}/login`); await expect(page.getByTestId('login-submit')).toBeVisible();
  await page.goto(`${appBase}/dashboard`); await page.waitForURL(/\/projetos\/login/); // Guardas Angular em deep link
  await page.goto(`${appBase}/forbidden`); await expect(page.getByRole('heading', { name: 'Acesso não permitido', exact: true })).toBeVisible();
  await page.goto(`${appBase}/rota-inexistente`); await expect(page.getByRole('heading', { name: 'Página não encontrada', exact: true })).toBeVisible();
  const login = async (email: string) => { await page.goto(`${appBase}/login`); await page.getByTestId('login-email').fill(email); await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click(); await page.waitForURL(u => !u.pathname.startsWith('/projetos/login')); };
  const proposal = () => page.goto(`${appBase}/projects/${projectId}/proposal`);
  const csrf = async () => ({ 'X-CSRF-Token': decodeURIComponent((await context.cookies()).find(c => c.name === 'jgm4_csrf')?.value ?? ''), 'X-Requested-With': 'jgm4' });
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await login('admin@jgm4.local'); expect(new URL(page.url()).pathname).toMatch(/^\/projetos\//); await proposal(); await expect(page.getByTestId('proposal-phase')).toHaveCount(4);
  const browserCookies = await context.cookies();
  expect(browserCookies.find(cookie => cookie.name === 'jgm4_session')?.path).toBe('/api');
  expect(browserCookies.find(cookie => cookie.name === 'jgm4_refresh')?.path).toBe('/api/auth');
  expect(browserCookies.find(cookie => cookie.name === 'jgm4_csrf')?.path).toBe('/');
  expect(await page.locator('.sidebar').evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  expect(await page.locator('.app-shell').evaluate(element => getComputedStyle(element).display)).toBe('flex');
  await expect(page.getByTestId('proposal-phase').first()).toContainText('Sem cobrança · R$ 0,00'); await expect(page.getByTestId('proposal-total')).toHaveText('A configurar');
  await expect(page.locator('main')).toContainText('04/11/2026 a 31/01/2027'); await expect(page.locator('main')).toContainText('Fevereiro e março de 2027');
  await noOverflow(); await page.screenshot({ path: resolve(output, 'proposta-previa-desktop.png'), fullPage: true });
  // Configuração pela interface: horas fictícias permanecem apenas no schema temporário.
  for (const order of [1, 2, 3]) {
    await page.locator('.admin-commercial details').filter({ has: page.locator(`input[data-testid="commercial-ho-${order}"]`) }).locator('summary').first().click();
    await page.getByTestId(`commercial-ho-${order}`).fill(order === 2 ? '2' : '10'); await page.getByTestId(`commercial-ic-${order}`).fill(order === 2 ? '8' : '0');
    const response = page.waitForResponse(r => r.url().includes('/commercial/phases/') && r.request().method() === 'PATCH'); await page.getByTestId(`commercial-save-${order}`).click(); expect((await response).status()).toBe(200);
    await expect(page.getByTestId('proposal-notice')).toContainText('Configuração comercial salva');
  }
  await page.getByTestId('proposal-draft').click(); await expect(page.getByTestId('proposal-notice')).toContainText('Nova versão');
  await expect(page.getByTestId('proposal-total')).toHaveText('R$ 4.400,00');
  await page.getByTestId('proposal-send').click(); await expect(page.getByTestId('proposal-notice')).toContainText('enviada');
  const d = await (await context.request.get(`${origin}/api/projects/${projectId}/proposal`)).json();
  const dependency = await context.request.post(`${origin}/api/projects/${projectId}/external-dependencies`, { headers: await csrf(), data: { description: 'Compra de estantes', responsible: 'Ollem', impact: 'Sem impacto nas atividades independentes', status: 'WAITING_EXTERNAL', blocksProject: false, blocksTask: false, stage: 'Prazo fornecedor' } }); expect(dependency.status()).toBe(201);
  const start = await context.request.post(`${origin}/api/projects/${projectId}/commercial/start`, { headers: await csrf(), data: {} }); expect(start.status()).toBe(409);
  await page.getByTestId('logout').click(); await page.waitForURL(/\/login/);
  await login('sponsor@ollem.local'); await page.waitForURL(/\/projetos\/projects\/[^/]+\/dashboard/); await proposal(); await expect(page.getByTestId('proposal-accept')).toBeDisabled();
  await page.getByTestId('proposal-question').fill('Confirmar disponibilidade para o inventário em janeiro.'); await page.getByRole('button', { name: 'Registrar dúvida', exact: true }).click(); await expect(page.getByTestId('proposal-notice')).toContainText('Dúvida registrada');
  for (let i = 0; i < 5; i++) await page.getByTestId(`proposal-ack-${i}`).check();
  await page.getByTestId('proposal-accept').click(); await expect(page.getByTestId('proposal-approved')).toHaveText('Proposta validada — aguardando formalização contratual.');
  const approved = await (await context.request.get(`${origin}/api/projects/${projectId}/proposal`)).json(); expect(approved.proposals[0].version).toBe(d.proposals[0].version); expect(approved.project.contractStatus).toBe('NOT_CREATED'); expect(approved.project.status).toBe('PLANNING');
  await page.reload(); await expect(page.getByTestId('proposal-approved')).toBeVisible();
  await page.screenshot({ path: resolve(output, 'proposta-aceita-desktop.png'), fullPage: true });
  for (const width of [1920, 1440, 1366, 820, 390]) { await page.setViewportSize({ width, height: 1000 }); await noOverflow(); await page.screenshot({ path: resolve(output, `proposta-${width}.png`), fullPage: true }); }
  await page.goto(`${appBase}/projects/${projectId}/dashboard`); await expect(page.getByTestId('dash-external-dependencies')).toContainText('Compra de estantes'); await expect(page.getByTestId('dash-status')).toContainText('Planejamento'); await noOverflow();
  await page.goto(`${appBase}/projects/${projectId}/plan`); await expect(page.getByRole('heading', { name: 'Plano de implantação' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Visão Geral', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Documentos', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Atividades', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="nav-admin-"]')).toHaveCount(0); await page.getByRole('link', { name: 'Documentos', exact: true }).click(); await expect(page.getByTestId('project-documents')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('project-documents')).toBeVisible();
  await page.goto(`${appBase}/projects/${projectId}/plan`); await expect(page.getByRole('heading', { name: 'Plano de implantação' })).toBeVisible();
  const activity = page.locator('.phase-task-link').first(); await expect(activity).toBeVisible(); await activity.click(); await page.waitForURL(/\/projetos\/projects\/[^/]+\/tasks\/[^/]+/);
  await expect(page.locator('.task-page-heading h1')).toBeVisible(); const activityPath = new URL(page.url()).pathname;
  await page.reload(); await expect(page.locator('.task-page-heading h1')).toBeVisible(); expect(new URL(page.url()).pathname).toBe(activityPath);
  const forbiddenAdmin = await context.request.get(`${origin}/api/admin/users`); expect(forbiddenAdmin.status()).toBe(403);
  await page.goto(`${appBase}/admin`); await page.waitForURL(/\/projetos\/forbidden/); await expect(page.getByRole('heading', { name: 'Acesso não permitido', exact: true })).toBeVisible();
  await page.getByTestId('logout').click(); await page.waitForURL(/\/projetos\/login/);
  await page.goto(appBase); await page.waitForURL(/\/projetos\/login/);
  await login('admin@jgm4.local'); await page.goto(`${appBase}/admin`); await page.waitForURL(/\/projetos\/admin\/companies/); await expect(page.getByTestId('nav-admin-companies')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Área do Cliente OK: login, carteira, atividade com refresh autenticado, logout, isolamento admin 403, painel administrativo JGM4, cookies/CSRF, proposta, API, deep links e responsividade 1920/1440/1366/tablet/celular. Dados reais preservados.');
} finally {
  if (browser) await browser.close();
  if (api && api.exitCode === null) { const exit = once(api, 'exit'); api.kill(); await exit; }
  if (!/^ollem_browser_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
}
