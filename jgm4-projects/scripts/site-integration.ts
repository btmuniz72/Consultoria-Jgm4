import { expect } from '@playwright/test';
import { config } from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { launchBrowser } from './browser-helpers';

// Teste integrado Site-First: simula o virtual host do Apache (gateway local) com a mesma ordem de regras da documentação:
//   /api/*      -> proxy para o NestJS
//   /projetos/* -> proxy para o NestJS, que serve a SPA Angular (fallback SPA somente aqui)
//   demais      -> arquivos do site institucional (raiz do repositório); inexistente -> 404.html com status 404
// A navegação começa pela homepage institucional, nunca diretamente pelo Angular. Usa schema PostgreSQL temporário e fixtures fictícias.
const require = createRequire(import.meta.url); const root = process.cwd(); config({ path: resolve(root, '.env'), quiet: true });
const siteRoot = resolve(root, '..');
const apiPort = 3018; const gatewayPort = 3019; const gateway = `http://127.0.0.1:${gatewayPort}`;
const schema = `site_first_${randomUUID().replaceAll('-', '')}`; const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const testUrl = new URL(process.env.DATABASE_URL!); testUrl.searchParams.set('schema', schema);
const password = 'Jgm4-Dev-2026!'; const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const distDir = resolve(root, 'frontend/dist/frontend/browser');
// Pastas do repositório que nunca fazem parte do site público (o gateway as recusa, como o servidor real deve fazer).
const PRIVATE_DIRS = new Set(['jgm4-projects', 'backups-remotos-ftps', 'node_modules', '.git', '.agents', '.vscode', 'jgm4_diagnostico', 'arquivo-morto', 'admin']);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

let api: ReturnType<typeof spawn> | undefined; let server: Server | undefined; let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
let passed = 0; const step = (name: string) => { passed++; console.log(`OK  ${String(passed).padStart(2, '0')} ${name}`); };

function siteFile(pathname: string): string | null {
  let decoded: string; try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part.startsWith('.')) || (parts[0] && PRIVATE_DIRS.has(parts[0]))) return null;
  const target = resolve(siteRoot, ...parts); if (target !== siteRoot && !target.startsWith(siteRoot + sep)) return null;
  if (existsSync(target) && statSync(target).isDirectory()) { const index = join(target, 'index.html'); return existsSync(index) ? index : null; }
  return existsSync(target) ? target : null;
}

function startGateway(): Promise<Server> {
  const notFound = readFileSync(resolve(siteRoot, '404.html'));
  const proxy = createServer((req, res) => {
    const url = new URL(req.url ?? '/', gateway); const path = url.pathname;
    if (path === '/api' || path.startsWith('/api/') || path === '/projetos' || path.startsWith('/projetos/')) {
      const upstream = httpRequest({ host: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-port': '443' } }, (response) => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(502); res.end('Bad gateway'); }); req.pipe(upstream); return;
    }
    const file = req.method === 'GET' || req.method === 'HEAD' ? siteFile(path) : null;
    if (file) { res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : readFileSync(file)); return; }
    res.writeHead(404, { 'Content-Type': TYPES['.html'] }); res.end(notFound); // ErrorDocument 404 /404.html, status preservado
  });
  return new Promise((done) => proxy.listen(gatewayPort, '127.0.0.1', () => done(proxy)));
}

const get = (path: string, init: RequestInit = {}) => fetch(`${gateway}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init });
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);

try {
  if (!existsSync(resolve(root, 'backend/dist/main.js'))) throw new Error('backend/dist/main.js ausente: execute `npm run build` antes do teste.');
  // 1. Build de produção com base /projetos/ e API /api (mesma origem).
  const build = spawnSync(process.execPath, ['scripts/build-frontend.mjs'], { cwd: root, env: { ...process.env, PUBLIC_BASE_PATH: '/projetos', API_BASE_PATH: '/api' }, windowsHide: true, encoding: 'utf8', timeout: 240000 });
  if (build.status !== 0) throw new Error('Build Angular com base /projetos/ falhou: ' + (build.stderr || build.stdout).slice(-3000));
  const builtIndex = readFileSync(resolve(distDir, 'index.html'), 'utf8');
  expect(builtIndex).toContain('<base href="/projetos/">'); expect(builtIndex).toContain('<meta name="jgm4-api-base-path" content="/api">');
  expect(builtIndex).toMatch(/<meta name="robots" content="noindex,\s*nofollow/);
  // Nenhuma referência do HTML/CSS aponta para a raiz do site institucional.
  for (const [, value] of builtIndex.matchAll(/\s(?:src|href)="([^"]+)"/g)) if (value.startsWith('/')) expect(value, 'referência do index.html').toMatch(/^\/projetos\//);
  for (const css of files(distDir).filter((file) => file.endsWith('.css'))) for (const [, value] of readFileSync(css, 'utf8').matchAll(/url\(\s*["']?(\/[^)"']+)/g)) expect(value, `url() em ${relative(distDir, css)}`).toMatch(/^\/projetos\//);
  step('build de produção: base /projetos/, API /api, noindex e nenhum asset na raiz');

  // 2. Schema temporário com as migrations versionadas e o seed fictício.
  const sql = await pool.connect();
  try {
    await sql.query(`CREATE SCHEMA "${schema}"`); await sql.query(`SET search_path TO "${schema}"`);
    for (const dir of readdirSync(resolve(root, 'backend/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      const migration = readFileSync(resolve(root, 'backend/prisma/migrations', dir, 'migration.sql'), 'utf8');
      if (dir === '20261023000200_gates') { const i = migration.indexOf('-- The first phase remains'); await sql.query(migration.slice(0, i)); await sql.query(migration.slice(i)); } else await sql.query(migration);
    }
  } finally { sql.release(); }
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: testUrl.toString(), FRONTEND_ORIGIN: gateway, ALLOWED_ORIGINS: gateway, PUBLIC_APP_URL: `${gateway}/projetos`, PUBLIC_BASE_PATH: '/projetos', API_BASE_PATH: '/api', TRUST_PROXY: '1', ALLOW_DEV_ACTOR_HEADER: 'false', BCRYPT_COST: '4', RATE_LIMIT_LOGIN_PER_IP: '5000' };
  delete env.OLLEM_LEGACY_FIXTURE;
  const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(root, 'backend'), env, windowsHide: true, encoding: 'utf8', timeout: 120000 });
  if (seed.status !== 0) throw new Error('Seed isolado falhou: ' + seed.stderr);

  // 3. NestJS atrás do gateway (somente loopback) e gateway Site-First.
  api = spawn(process.execPath, ['backend/dist/main.js'], { cwd: root, env: { ...env, PORT: String(apiPort), HOST: '127.0.0.1', FRONTEND_DIST_DIR: distDir }, stdio: 'ignore', windowsHide: true });
  server = await startGateway();
  let ready = false;
  for (let n = 0; n < 900; n++) { if (api.exitCode !== null) throw new Error('API de teste encerrou.'); try { if ((await get('/api/health', { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 500)); }
  if (!ready) throw new Error('API de teste indisponível via gateway.');

  // 4. Site institucional preservado: páginas, assets, 404 e ausência de qualquer vestígio da SPA.
  const homeDisk = readFileSync(resolve(siteRoot, 'index.html'), 'utf8'); const home = await get('/');
  expect(home.status).toBe(200); const homeBody = await home.text();
  expect(homeBody).toBe(homeDisk); expect(homeBody).not.toContain('<app-root'); expect(home.headers.get('x-robots-tag')).toBeNull();
  expect(homeBody).toContain('<a href="/projetos/" onclick="closeMenu()">Área do Cliente</a>');
  expect([...homeBody.matchAll(/href="([^"]*(?:localhost|127\.0\.0\.1|staging)[^"]*)"/gi)].map((match) => match[1])).toEqual([]);
  for (const path of ['/pages/sobre.html', '/pages/politica.html', '/pages/blog.html', '/pages/cursos.html', '/consultor-logistico/', '/consultoria-logistica-para-pequenas-empresas/', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/site.webmanifest', '/404.html']) {
    const response = await get(path); expect(response.status, path).toBe(200);
    const body = Buffer.from(await response.arrayBuffer()); expect(body.length, path).toBeGreaterThan(0); expect(body.toString('latin1'), path).not.toContain('<app-root'); expect(response.headers.get('x-robots-tag'), path).toBeNull();
  }
  expect(await (await get('/sitemap.xml')).text()).not.toContain('/projetos'); // a Área do Cliente não entra no sitemap público
  step('site institucional: homepage idêntica ao arquivo, link /projetos/ relativo, páginas, assets, robots e sitemap intactos');

  const missing = await get('/rota-publica-inexistente'); expect(missing.status).toBe(404);
  const missingBody = await missing.text(); expect(missingBody).toContain('Página não encontrada | JGM4'); expect(missingBody).not.toContain('<app-root');
  for (const path of ['/contato', '/sobre', '/servicos', '/politica-de-privacidade', '/dashboard', '/login', '/projects/abc', '/atividades', '/documentos', '/blog', '/rota/profunda/inexistente']) {
    const response = await get(path); const body = await response.text(); expect(body, path).not.toContain('<app-root'); expect([200, 404], path).toContain(response.status);
    if (!siteFile(path)) { expect(response.status, path).toBe(404); expect(body, path).toContain('Página não encontrada | JGM4'); }
  }
  step('rotas públicas inexistentes: 404 institucional (nunca a SPA Angular)');

  // 5. /projetos/* servido pela SPA e /api/* pelo backend, incluindo todos os arquivos do build e os deep links.
  const index = await get('/projetos/'); const indexBody = await index.text();
  expect(index.status).toBe(200); expect(indexBody).toContain('<app-root'); expect(indexBody).toContain('<base href="/projetos/">');
  expect(index.headers.get('x-robots-tag')).toContain('noindex'); expect(indexBody).toMatch(/<meta name="robots" content="noindex/);
  const bare = await get('/projetos'); expect([301, 308]).toContain(bare.status); expect(bare.headers.get('location')).toBe('/projetos/');
  const built = files(distDir).map((file) => relative(distDir, file).split(sep).join('/')); expect(built.filter((file) => /^chunk-.*\.js$/.test(file)).length).toBeGreaterThan(0);
  for (const file of built) {
    const response = await get(`/projetos/${file}`); expect(response.status, file).toBe(200);
    if (file !== 'index.html') expect(response.headers.get('content-type') ?? '', file).not.toContain('text/html');
    await response.arrayBuffer();
  }
  expect((await get('/projetos/arquivo-inexistente.js')).status).toBe(404); expect((await get('/projetos/assets/nao-existe.png')).status).toBe(404);
  for (const path of ['/projetos/login', '/projetos/dashboard', '/projetos/atividades', '/projetos/documentos', `/projetos/projetos/${projectId}`, `/projetos/atividades/${projectId}`, '/projetos/rota-interna',
    `/projetos/projects/${projectId}/dashboard`, `/projetos/projects/${projectId}/documents`, `/projetos/projects/${projectId}/tasks/${projectId}`]) {
    const response = await get(path); const body = await response.text(); expect(response.status, path).toBe(200); expect(body, path).toContain('<app-root'); expect(response.headers.get('x-robots-tag'), path).toContain('noindex');
  }
  step(`/projetos/*: SPA com base /projetos/, ${built.length} arquivos do build, deep links e 404 para assets inexistentes`);

  const health = await get('/api/health'); expect(health.status).toBe(200); expect(await health.json()).toEqual({ status: 'ok' });
  expect((await get('/api/health/live')).status).toBe(200); expect((await get('/api/health/ready')).status).toBe(200);
  expect((await get('/api/projects')).status).toBe(401); const unknownApi = await get('/api/rota-inexistente'); expect(unknownApi.status).toBe(404); expect(await unknownApi.text()).not.toContain('<app-root');
  step('/api/* via mesma origem: health sem detalhes internos, 401 sem sessão, 404 JSON para rota inexistente');

  // 6. Navegação real: homepage -> Área do Cliente -> login -> dashboard -> atividades -> documentos -> logout. Edge via BROWSER_CHANNEL=msedge se o Chromium falhar.
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === gateway ? route.continue() : route.abort()); // sem CDN/fontes externas: teste determinístico e offline
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /Content Security Policy|Refused to (apply|execute|load)/i.test(message.text())) errors.push(message.text()); });
  const loginRoute = /\/projetos\/login/;
  if (process.env.DEBUG_SITE) { page.on('console', (m) => console.log('[console]', m.type(), m.text())); page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText)); page.on('response', (r) => console.log('[response]', r.status(), r.url())); }

  await page.goto(`${gateway}/`, { waitUntil: 'domcontentloaded' });                                                     // 1. homepage
  const entry = page.locator('a[href="/projetos/"]:visible', { hasText: 'Área do Cliente' }).first();                       // 2. localizar
  await expect(entry).toBeVisible();
  await entry.click(); await page.waitForURL(loginRoute, { waitUntil: 'commit' });                                                                   // 3-4. abre /projetos/ (sem sessão -> login)
  expect(new URL(page.url()).origin).toBe(gateway);
  await page.getByTestId('login-email').fill('sponsor@ollem.local'); await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click(); // 5. login
  await expect(page.getByTestId('home-project')).toBeVisible(); expect(new URL(page.url()).pathname).toBe('/projetos/');         // 6. central de projetos do cliente
  await page.getByRole('link', { name: /Dashboard do projeto/ }).click(); await page.waitForURL(/\/projetos\/projects\/[^/]+\/dashboard/, { waitUntil: 'commit' }); // 6. dashboard
  await expect(page.getByTestId('dash-status')).toBeVisible();
  const dashboardPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: 'Atividades', exact: true }).click(); await page.waitForURL(/\/projetos\/projects\/[^/]+\/plan/, { waitUntil: 'commit' }); // 7. atividades
  const activity = page.locator('.phase-task-link').first(); await expect(activity).toBeVisible();
  await activity.click(); await page.waitForURL(/\/projetos\/projects\/[^/]+\/tasks\/[^/]+/, { waitUntil: 'commit' });                              // 8. uma atividade
  await expect(page.locator('.task-page-heading h1')).toBeVisible(); const activityPath = new URL(page.url()).pathname;
  await page.reload(); await expect(page.locator('.task-page-heading h1')).toBeVisible(); expect(new URL(page.url()).pathname).toBe(activityPath); // 9-10. refresh mantém sessão e rota
  await page.getByRole('link', { name: 'Documentos', exact: true }).click(); await expect(page.getByTestId('project-documents')).toBeVisible(); // 11. documentos
  await page.getByRole('link', { name: 'Visão Geral', exact: true }).click(); await page.waitForURL((url) => url.pathname === dashboardPath, { waitUntil: 'commit' }); await expect(page.getByTestId('dash-status')).toBeVisible(); // 12. dashboard
  const cookies = await context.cookies();
  const cookie = (name: string) => cookies.find((item) => item.name === name);
  expect(cookie('jgm4_session')).toMatchObject({ path: '/api', httpOnly: true, sameSite: 'Strict' }); expect(cookie('jgm4_refresh')).toMatchObject({ path: '/api/auth', httpOnly: true, sameSite: 'Strict' });
  expect(cookie('jgm4_csrf')).toMatchObject({ path: '/', httpOnly: false, sameSite: 'Strict' });
  for (const item of cookies) expect(item.domain.startsWith('.'), `cookie ${item.name} deve ser host-only`).toBe(false);
  expect((await context.request.get(`${gateway}/api/admin/users`)).status()).toBe(403);                                      // cliente não acessa função administrativa
  await page.getByTestId('logout').click(); await page.waitForURL(loginRoute, { waitUntil: 'commit' }); await expect(page.getByTestId('login-submit')).toBeVisible(); // 13-14. logout
  await page.goto(`${gateway}/projetos/dashboard`); await page.waitForURL(loginRoute, { waitUntil: 'commit' });
  step('navegação a partir da homepage: Área do Cliente, login, dashboard, atividade com refresh, documentos, cookies host-only, 403 admin e logout');

  const unknown = await page.goto(`${gateway}/rota-publica-inexistente`, { waitUntil: 'domcontentloaded' });
  expect(unknown?.status()).toBe(404); await expect(page).toHaveTitle('Página não encontrada | JGM4'); expect(await page.locator('app-root').count()).toBe(0);
  const privacy = await page.goto(`${gateway}/projetos/privacy`, { waitUntil: 'domcontentloaded' }); expect(privacy?.status()).toBeLessThan(400);
  await page.waitForURL(`${gateway}/pages/politica.html`, { waitUntil: 'commit' }); expect(await page.locator('app-root').count()).toBe(0);
  const internal = await page.goto(`${gateway}/projetos/rota-interna`); expect(internal?.status()).toBe(200); await expect(page.getByRole('heading', { name: 'Página não encontrada', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  step('isolamento no navegador: 404 institucional fora de /projetos/, privacidade institucional e rota interna tratada pelo Angular');
  console.log(`Integração Site-First OK (${passed} verificações): homepage -> /projetos/ -> /api, site institucional preservado. Dados reais não utilizados.`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  if (api && api.exitCode === null) { const exit = once(api, 'exit'); api.kill(); await exit; }
  if (!/^site_first_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
}
