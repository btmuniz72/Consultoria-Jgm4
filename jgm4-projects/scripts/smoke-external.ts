import { connect } from 'node:tls';

// Smoke test de um ambiente publicado (staging/produção). Somente leitura e sem segredos no código:
//   BASE_URL=https://staging-projetos.exemplo.com.br/projetos npm run smoke:external
// Opcional (login real, cookies e dados do usuário): SMOKE_EMAIL e SMOKE_PASSWORD no ambiente (nunca gravados em arquivo).
// Sai com código 1 se algum item falhar. Itens que dependem de infraestrutura aparecem como FALHA, nunca como "ok" presumido.
const baseUrl = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
if (!baseUrl) { console.error('Defina BASE_URL (ex.: https://staging-projetos.exemplo.com.br/projetos).'); process.exit(2); }
const url = new URL(baseUrl); const origin = url.origin; const appBase = baseUrl; const apiBase = origin; const isHttps = url.protocol === 'https:'; const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
if (!/^\/projetos\/?$/.test(url.pathname)) { console.error('BASE_URL deve apontar para o caminho /projetos (ex.: https://staging-projetos.exemplo.com.br/projetos).'); process.exit(2); }
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK    ' : 'FALHA '} ${name}${detail ? ` — ${detail}` : ''}`); };
const get = (path: string, init: RequestInit = {}) => fetch(`${path.startsWith('/api') ? apiBase : appBase}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init });

async function certificate() {
  if (!isHttps) return;
  await new Promise<void>((done) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) || 443, servername: url.hostname, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate(); const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
      check('Certificado TLS válido e confiável', socket.authorized, socket.authorizationError ? String(socket.authorizationError) : undefined);
      check('Certificado com mais de 14 dias de validade', days > 14, `${days} dias restantes`);
      socket.end(); done();
    });
    socket.on('error', (error) => { check('Certificado TLS válido e confiável', false, error.message); done(); });
  });
}

async function main() {
  check('Endereço usa HTTPS', isHttps || isLocal, isHttps ? undefined : 'ambiente externo precisa de HTTPS');
  await certificate();
  if (isHttps && !isLocal) {
    try { const plain = await fetch(`http://${url.host}${url.pathname || '/projetos/'}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) }); const location = plain.headers.get('location') ?? '';
      check('HTTP redireciona para HTTPS', plain.status >= 300 && plain.status < 400 && location.startsWith('https://'), `status ${plain.status} ${location}`); }
    catch (error) { check('HTTP redireciona para HTTPS', false, (error as Error).message); }
  }
  const live = await get('/api/health/live'); check('Liveness (/api/health/live)', live.ok);
  const ready = await get('/api/health/ready'); check('Readiness (/api/health/ready) com banco', ready.ok, `status ${ready.status}`);
  const readyBody = await ready.text(); check('Readiness não expõe detalhes internos', !/postgres|password|stack|DATABASE_URL/i.test(readyBody));

  const home = await get('/'); check('Área do Cliente responde em /projetos', home.ok, `status ${home.status}`);
  const html = await home.text(); check('Frontend entrega a aplicação Angular', /<app-root/i.test(html));
  check('Base Angular aponta para /projetos/', /<base href="\/projetos\/">/i.test(html));
  check('HTML da Área do Cliente não é indexável', /name="robots" content="noindex, nofollow, noarchive"/i.test(html) && /noindex/i.test(home.headers.get('x-robots-tag') ?? ''));
  for (const route of ['/login', '/dashboard', '/projects/00000000-0000-4000-8000-000000000000/dashboard', '/forbidden', '/rota-inexistente-smoke']) {
    const response = await get(route); const body = await response.text();
    check(`Deep link /projetos${route} entrega fallback SPA`, response.ok && /<app-root/i.test(body), `status ${response.status}`);
  }
  const asset = /(?:src|href)="([^\"]+\.(?:js|css))"/i.exec(html)?.[1];
  const assetUrl = asset ? new URL(asset, `${appBase}/`) : null;
  check('Asset principal usa base /projetos/', !!assetUrl && assetUrl.pathname.startsWith('/projetos/'));
  if (assetUrl) { const response = await fetch(assetUrl); check('Asset principal carrega', response.ok, `status ${response.status}`); }
  const headers = (await get('/api/health')).headers;
  check('X-Content-Type-Options: nosniff', headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options / frame-ancestors', !!headers.get('x-frame-options') || /frame-ancestors/.test(headers.get('content-security-policy') ?? ''));
  check('Content-Security-Policy presente', !!headers.get('content-security-policy'));
  check('Referrer-Policy presente', !!headers.get('referrer-policy'));
  if (isHttps) check('HSTS presente', /max-age=\d+/.test(headers.get('strict-transport-security') ?? ''));
  check('Sem cabeçalho X-Powered-By', !headers.get('x-powered-by'));

  const unauth = await get('/api/projects'); check('Rota protegida sem sessão devolve 401', unauth.status === 401, `status ${unauth.status}`);
  const admin = await get('/api/admin/users'); check('Administração sem sessão devolve 401', admin.status === 401, `status ${admin.status}`);
  const devActor = await get('/api/projects', { headers: { 'x-actor-role': 'JGM4_ADMIN' } }); check('Cabeçalho de ator de desenvolvimento NÃO funciona', devActor.status === 401, `status ${devActor.status}`);
  const cors = await get('/api/health', { headers: { Origin: 'https://origem-nao-autorizada.example' } });
  check('CORS não libera origem desconhecida', cors.headers.get('access-control-allow-origin') !== 'https://origem-nao-autorizada.example' && cors.headers.get('access-control-allow-origin') !== '*');
  const bad = await get('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'jgm4' }, body: '{"email":' });
  const badText = await bad.text(); check('Erro de requisição não expõe stack trace', !/\bat\s+\S+\s+\(|node_modules|\.ts:\d+/.test(badText), `status ${bad.status}`);
  const config = await get('/api/public-config'); const configBody = await config.json().catch(() => ({})) as Record<string, unknown>;
  check('Configuração pública acessível', config.ok);
  const contact = configBody['privacyContactEmail']; check('Contato de privacidade configurado (PRIVACY_CONTACT_EMAIL)', typeof contact === 'string' && contact.length > 3, 'pendência de go-live se ausente');
  const privacy = await (await get('/privacy')).text(); void privacy;

  const email = process.env.SMOKE_EMAIL; const password = process.env.SMOKE_PASSWORD;
  if (email && password) {
    const login = await get('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'jgm4', origin: url.origin }, body: JSON.stringify({ email, password }) });
    const cookies = login.headers.getSetCookie?.() ?? [];
    if (login.ok && cookies.length) {
      for (const name of ['jgm4_session', 'jgm4_refresh']) { const cookie = cookies.find((c) => c.startsWith(`${name}=`)) ?? ''; check(`Cookie ${name} HttpOnly`, /httponly/i.test(cookie)); if (isHttps) check(`Cookie ${name} Secure`, /;\s*secure/i.test(cookie)); check(`Cookie ${name} SameSite definido`, /samesite=/i.test(cookie)); check(`Cookie ${name} tem Path da API`, name === 'jgm4_session' ? /path=\/api(?:;|$)/i.test(cookie) : /path=\/api\/auth(?:;|$)/i.test(cookie)); }
      const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
      const me = await get('/api/auth/me', { headers: { cookie: cookieHeader } }); check('Sessão válida após o login (/api/auth/me)', me.ok);
      const projects = await get('/api/projects', { headers: { cookie: cookieHeader } }); check('Lista de projetos do usuário', projects.ok, `status ${projects.status}`);
      const noCsrf = await get('/api/auth/logout-all', { method: 'POST', headers: { cookie: cookieHeader, origin: url.origin } }); check('Requisição com cookie sem CSRF é rejeitada', noCsrf.status === 403 || noCsrf.status === 401, `status ${noCsrf.status}`);
      await get('/api/auth/logout', { method: 'POST', headers: { cookie: cookieHeader, 'x-requested-with': 'jgm4', origin: url.origin } });
      const after = await get('/api/auth/me', { headers: { cookie: cookieHeader } }); check('Sessão invalidada após o logout', after.status === 401, `status ${after.status}`);
    } else check('Login do usuário de smoke', false, login.status === 200 ? 'MFA exigido: use um usuário de smoke sem MFA em staging' : `status ${login.status}`);
  } else console.log('INFO   Sem SMOKE_EMAIL/SMOKE_PASSWORD: pulando login, cookies e logout.');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações OK em ${baseUrl} (API: ${apiBase}/api)`);
  if (failed.length) { console.log('Falhas:'); failed.forEach((r) => console.log(` - ${r.name}${r.detail ? ` (${r.detail})` : ''}`)); process.exit(1); }
}
main().catch((error: Error) => { console.error(error.message); process.exit(1); });
