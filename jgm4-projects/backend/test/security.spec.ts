import 'reflect-metadata';
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import JSZip from 'jszip';
import { Pool } from 'pg';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/security/mail.service';
import { validatePassword } from '../src/security/password-policy';
import { redact, redactString } from '../src/security/redact';
import { validateProductionConfig } from '../src/security/config';
import { base32Encode, totpAt } from '../src/security/totp';
import { MALWARE_SCANNER } from '../src/attachments/scanner';
import { SecureExceptionFilter } from '../src/security/exception.filter';
import { SecurityEventsService } from '../src/security/security-events.service';
import { runRetention } from '../scripts/retention';
import { ensureApproval } from '../src/approvals/approval-sync';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 8 — segurança, sessões, proteção de dados e isolamento', () => {
  const schema = `jgm4_stage8_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, actor: process.env.JGM4_LOCAL_ACTOR, nodeEnv: process.env.NODE_ENV, scan: process.env.SCAN_REQUIRED };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!'; const NEW_PASSWORD = 'Outra-Senha-Forte-2#';
  const XHR = { 'X-Requested-With': 'jgm4' };
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who?: string, body?: object) => { const r = http()[method](path); if (who) r.set('Authorization', `Bearer ${token[who]}`); return body ? r.send(body) : method === 'post' || method === 'patch' ? r.send({}) : r; };
  const loginBody = async (email: string, password = PASSWORD) => (await http().post('/api/auth/login').send({ email, password }).expect(200)).body;
  const cookies = (res: { headers: Record<string, unknown> }) => ((res.headers['set-cookie'] as string[] | undefined) ?? []);
  const cookieValue = (list: string[], name: string) => decodeURIComponent((list.find((item) => item.startsWith(`${name}=`)) ?? '').split(';')[0].split('=').slice(1).join('='));
  const events = (type: string, where: object = {}) => prisma.securityEvent.count({ where: { type, ...where } });
  const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const zipDoc = async (files: Record<string, string>) => { const zip = new JSZip(); for (const [name, content] of Object.entries(files)) zip.file(name, content); return Buffer.from(await zip.generateAsync({ type: 'uint8array' })); };
  const upload = (projectId: string, who: string, file: Buffer, filename: string, contentType: string, entity = { entityType: 'Task', entityId: '' }) => {
    const r = http().post(`/api/projects/${projectId}/attachments`).set('Authorization', `Bearer ${token[who]}`).field('entityType', entity.entityType).field('entityId', entity.entityId).attach('file', file, { filename, contentType });
    return r;
  };

  async function buildProject(key: 'A' | 'B', companyId: string, name: string) {
    const project = await prisma.project.create({ data: { companyId, name, description: `Descrição ${name}`, status: 'IN_PROGRESS' } }); id[`P${key}`] = project.id;
    const phase = await prisma.phase.create({ data: { projectId: project.id, order: 0, name: 'Fase 0', description: 'F0', plannedWeeks: 3, plannedJgm4Hours: 20, status: 'AVAILABLE' } });
    const gate = await prisma.gate.create({ data: { projectId: project.id, phaseId: phase.id, code: 'GATE-0', title: 'Gate 0', question: 'Pronto?', status: 'AVAILABLE', currentOwnerType: 'JGM4' } }); id[`G${key}`] = gate.id;
    await ensureApproval(prisma, { projectId: project.id, type: 'GATE_TECHNICAL_OPINION', entityType: 'Gate', entityId: gate.id, entityCode: 'GATE-0', title: 'GATE-0', description: 'Pronto?', assignedRole: 'JGM4_CONSULTANT' });
    const task = await prisma.task.create({ data: { projectId: project.id, phaseId: phase.id, code: 'T1', title: 'Atividade', objective: 'x', instructions: 'x', acceptanceCriteria: 'x', status: 'IN_PROGRESS', plannedJgm4Hours: 10, plannedClientHours: 5 } }); id[`T${key}`] = task.id;
    const req = await prisma.projectRequest.create({ data: { projectId: project.id, phaseId: phase.id, code: 'SOL-1', title: 'Solicitação', description: 'x', instructions: 'x', acceptanceCriteria: 'x', status: 'SENT_TO_JGM4', mandatory: false, blocking: false } }); id[`R${key}`] = req.id;
    await prisma.requestRequirement.create({ data: { requestId: req.id, label: 'Item', completed: true } });
    await ensureApproval(prisma, { projectId: project.id, type: 'REQUEST_REVIEW', entityType: 'ProjectRequest', entityId: req.id, entityCode: 'SOL-1', title: 'SOL-1', description: 'x', assignedRole: 'JGM4_CONSULTANT' });
    id[`AP${key}`] = (await prisma.approval.findFirstOrThrow({ where: { projectId: project.id, type: 'REQUEST_REVIEW' } })).id;
    await prisma.timeEntry.create({ data: { projectId: project.id, phaseId: phase.id, taskId: task.id, organizationType: 'JGM4', date: new Date(), hours: 2, description: 'x' } });
  }

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
      for (const folder of readdirSync(resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${folder}/migration.sql`), 'utf8');
        if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); } else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; delete process.env.JGM4_LOCAL_ACTOR;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);

    const ollem = (await prisma.company.create({ data: { name: 'Ollem Teste' } })).id; const clienteB = (await prisma.company.create({ data: { name: 'Cliente B' } })).id;
    const passwordHash = await hash(PASSWORD, 4);
    const user = async (key: string, role: string, companyId: string | null, name = `Usuário ${key}`) => { id[key] = (await prisma.user.create({ data: { name, email: `${key}@teste.local`.toLowerCase(), passwordHash, role: role as never, companyId } })).id; };
    await user('admin', 'JGM4_ADMIN', null, 'Administrador Teste'); await user('admin2', 'JGM4_ADMIN', null); await user('consIn', 'JGM4_CONSULTANT', null); await user('consOut', 'JGM4_CONSULTANT', null);
    await user('sponsorA', 'CLIENT_SPONSOR', ollem); await user('managerA', 'CLIENT_MANAGER', ollem); await user('userA', 'CLIENT_USER', ollem); await user('managerB', 'CLIENT_MANAGER', clienteB); await user('victim', 'CLIENT_MANAGER', ollem);
    id.ollem = ollem; id.clienteB = clienteB;
    await buildProject('A', ollem, 'Plano C Ollem'); await buildProject('B', clienteB, 'Plano C Cliente B');
    const member = (userKey: string, projectKey: string) => prisma.projectMembership.create({ data: { projectId: id[projectKey], userId: id[userKey] } });
    for (const u of ['consIn', 'sponsorA', 'managerA', 'userA', 'victim']) await member(u, 'PA'); await member('managerB', 'PB');
    for (const key of ['admin', 'admin2', 'consIn', 'consOut', 'sponsorA', 'managerA', 'userA', 'managerB']) token[key] = (await loginBody(`${key}@teste.local`)).accessToken;
    // anexo do projeto B (para os testes de acesso cruzado)
    const uploaded = await upload(id.PB, 'admin', pdf(), 'evidencia-b.pdf', 'application/pdf', { entityType: 'Task', entityId: id.TB }).expect(201); id.attB = uploaded.body.id;
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['JGM4_LOCAL_ACTOR', saved.actor], ['NODE_ENV', saved.nodeEnv], ['SCAN_REQUIRED', saved.scan]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  // ------------------------------------------------------------------ 1–5: acesso
  it('1. sem token qualquer rota protegida devolve 401 (inclui anexos, administração, membros e relatórios)', async () => {
    for (const path of [`/api/projects/${id.PA}`, '/api/admin/users', `/api/projects/${id.PA}/attachments`, `/api/projects/${id.PA}/members`, `/api/projects/${id.PA}/reports/executive/pdf`, '/api/auth/sessions']) await http().get(path).expect(401);
    await http().get('/api/health/live').expect(200); await http().get('/api/health/ready').expect(200);
    expect((await http().get('/api/health/ready')).body).toEqual({ status: 'ready' });
  });
  it('2 e 59. isolamento entre JGM4, Ollem e Cliente B: projeto, atividade, solicitação, Gate, aprovação, relatório, arquivo e horas', async () => {
    const against = (project: 'A' | 'B') => [
      ['get', `/api/projects/${id[`P${project}`]}`], ['get', `/api/projects/${id[`P${project}`]}/tasks`], ['get', `/api/tasks/${id[`T${project}`]}`], ['post', `/api/tasks/${id[`T${project}`]}/send-validation`],
      ['get', `/api/projects/${id[`P${project}`]}/requests/${id[`R${project}`]}`], ['post', `/api/projects/${id[`P${project}`]}/requests/${id[`R${project}`]}/accept`],
      ['get', `/api/projects/${id[`P${project}`]}/gates/${id[`G${project}`]}`], ['post', `/api/gates/${id[`G${project}`]}/start-review`],
      ['get', `/api/approvals/${id[`AP${project}`]}`], ['post', `/api/approvals/${id[`AP${project}`]}/approve`],
      ['get', `/api/projects/${id[`P${project}`]}/reports/executive`], ['get', `/api/projects/${id[`P${project}`]}/reports/executive/pdf`], ['get', `/api/projects/${id[`P${project}`]}/audit`], ['get', `/api/projects/${id[`P${project}`]}/members`],
      ['get', `/api/projects/${id[`P${project}`]}/attachments`], ['post', `/api/tasks/${id[`T${project}`]}/time-entries`, { date: '2026-10-25', hours: 1, description: 'Apontamento cruzado' }],
    ] as [('get' | 'post'), string, object?][];
    for (const [who, target] of [['managerA', 'B'], ['sponsorA', 'B'], ['userA', 'B'], ['consIn', 'B'], ['consOut', 'A'], ['consOut', 'B'], ['managerB', 'A']] as const) {
      for (const [method, path, body] of against(target)) await call(method, path, who, body).expect(403);
    }
    await call('get', `/api/projects/${id.PB}/attachments/${id.attB}/download`, 'managerA').expect(403);
    expect(await prisma.timeEntry.count({ where: { projectId: id.PB } })).toBe(1); // nada foi gravado
    // JGM4_ADMIN (acesso global) alcança ambos; o consultor vinculado só o seu projeto
    await call('get', `/api/projects/${id.PB}`, 'admin').expect(200); await call('get', `/api/projects/${id.PA}`, 'consIn').expect(200);
  });
  it('3. vínculo inativo recebe 403 imediatamente e a reativação restaura o acesso', async () => {
    await call('get', `/api/projects/${id.PA}`, 'userA').expect(200);
    await prisma.projectMembership.updateMany({ where: { userId: id.userA }, data: { active: false } });
    await call('get', `/api/projects/${id.PA}`, 'userA').expect(403); await call('get', `/api/tasks/${id.TA}`, 'userA').expect(403);
    await prisma.projectMembership.updateMany({ where: { userId: id.userA }, data: { active: true } });
    await call('get', `/api/projects/${id.PA}`, 'userA').expect(200);
  });
  it('4 e 5. usuário INACTIVE ou BLOCKED não autentica nem mantém sessão', async () => {
    for (const status of ['INACTIVE', 'BLOCKED'] as const) {
      const email = 'victim@teste.local'; const session = await loginBody(email);
      await call('get', '/api/auth/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      await prisma.user.update({ where: { id: id.victim }, data: { status } });
      await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(401);
      await http().get('/api/auth/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
      await prisma.user.update({ where: { id: id.victim }, data: { status: 'ACTIVE' } });
    }
    expect(await events('LOGIN_FAILED', { userId: id.victim })).toBeGreaterThanOrEqual(2);
  });

  // ------------------------------------------------------------------ 6–10: senha e sessões
  it('6. política de senha: tamanho, classes de caracteres, senhas comuns e dados pessoais', async () => {
    expect(validatePassword('Jgm4-Dev-2026!')).toEqual([]); expect(validatePassword('Senha-Local-Teste-1!')).toEqual([]);
    expect(validatePassword('curta1A!')).toEqual(expect.arrayContaining([expect.stringContaining('10 caracteres')]));
    expect(validatePassword('semmaiuscula1!')).toContain('Inclua uma letra maiúscula.'); expect(validatePassword('SEMMINUSCULA1!')).toContain('Inclua uma letra minúscula.');
    expect(validatePassword('SemNumeroAqui!')).toContain('Inclua um número.'); expect(validatePassword('SemEspecial123')).toContain('Inclua um caractere especial.');
    expect(validatePassword('Password1!')).toContain('Essa senha é muito comum; escolha outra.'); expect(validatePassword('Qwerty123456!').join(' ')).toMatch(/comum|sequências/);
    expect(validatePassword('Maria-Silva-2026!', { name: 'Maria Silva', email: 'x@y.com' })).toContain('A senha não pode conter o seu nome.');
    expect(validatePassword('Joao.santos-9988!', { email: 'joao.santos@x.com' }).join(' ')).toContain('e-mail');
    await call('post', '/api/auth/change-password', 'userA', { currentPassword: PASSWORD, newPassword: 'fraca' }).expect(400);
    await call('post', '/api/auth/change-password', 'userA', { currentPassword: 'errada', newPassword: NEW_PASSWORD }).expect(401);
  });
  it('7 e 8. token de redefinição expira e só vale uma vez; redefinir encerra todas as sessões', async () => {
    const email = 'victim@teste.local'; const before = await loginBody(email);
    MailService.memory.length = 0;
    await http().post('/api/auth/forgot').send({ email }).expect(202); await http().post('/api/auth/forgot').send({ email: 'inexistente@teste.local' }).expect(202); // resposta idêntica
    const mail = MailService.memory.find((message) => message.to === email)!; expect(mail.subject).toContain('Redefinição'); expect(MailService.memory.some((message) => message.to === 'inexistente@teste.local')).toBe(false);
    const resetToken = decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]);
    expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: id.victim } })).tokenHash).not.toContain(resetToken); // só o hash é guardado
    await http().post('/api/auth/reset').send({ token: resetToken, password: 'fraca' }).expect(400); expect(await prisma.passwordResetToken.count({ where: { userId: id.victim, usedAt: null } })).toBe(1); // senha inválida não consome o token
    await http().post('/api/auth/reset').send({ token: resetToken, password: NEW_PASSWORD }).expect(200);
    await http().post('/api/auth/reset').send({ token: resetToken, password: 'Terceira-Senha-9$x' }).expect(400); // uso único
    await http().get('/api/auth/me').set('Authorization', `Bearer ${before.accessToken}`).expect(401); // sessões antigas revogadas
    await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(401); await loginBody(email, NEW_PASSWORD);
    // expirado
    MailService.memory.length = 0; await http().post('/api/auth/forgot').send({ email }).expect(202);
    const second = decodeURIComponent(/token=([^\s]+)/.exec(MailService.memory.find((message) => message.to === email)!.text)![1]);
    await prisma.passwordResetToken.updateMany({ where: { userId: id.victim, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().post('/api/auth/reset').send({ token: second, password: 'Quarta-Senha-7%y' }).expect(400);
    await http().post('/api/auth/reset').send({ token: 'x'.repeat(40), password: NEW_PASSWORD }).expect(400);
    expect(await events('PASSWORD_RESET', { userId: id.victim })).toBe(1); expect(await events('PASSWORD_RESET_REQUESTED', { userId: id.victim })).toBe(2);
    await prisma.user.update({ where: { id: id.victim }, data: { passwordHash: await hash(PASSWORD, 4) } });
  });
  it('9 e 10. logout revoga a sessão no servidor (access e refresh) e a sessão revogada não funciona', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ email: 'managerA@teste.local', password: PASSWORD }).expect(200);
    const access = login.body.accessToken as string;
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(403); // sem o cabeçalho anti-CSRF
    await agent.post('/api/auth/logout').set(XHR).expect(204);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${access}`).expect(401); // token ainda "válido" no tempo, mas a sessão foi revogada
    await agent.post('/api/auth/refresh').set(XHR).expect(401);
    // revogação pelo usuário e pelo administrador
    const second = await loginBody('userA@teste.local'); const third = await loginBody('userA@teste.local');
    const list = (await call('get', '/api/auth/sessions').set('Authorization', `Bearer ${second.accessToken}`).expect(200)).body as { id: string; current: boolean }[];
    expect(list.length).toBeGreaterThanOrEqual(2); expect(list.filter((item) => item.current)).toHaveLength(1);
    const other = list.find((item) => !item.current)!;
    await http().delete(`/api/auth/sessions/${other.id}`).set('Authorization', `Bearer ${second.accessToken}`).expect(204);
    const revokedAll = await call('post', `/api/admin/users/${id.userA}/revoke-sessions`, 'admin').expect(200); expect(revokedAll.body.revoked).toBeGreaterThanOrEqual(1);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${second.accessToken}`).expect(401); await http().get('/api/auth/me').set('Authorization', `Bearer ${third.accessToken}`).expect(401);
    token.userA = (await loginBody('userA@teste.local')).accessToken;
    expect(await events('SESSION_REVOKED')).toBeGreaterThanOrEqual(3);
  });
  it('rotação do refresh token e detecção de reuso (token roubado revoga a sessão)', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ email: 'managerA@teste.local', password: PASSWORD }).expect(200);
    const oldRefresh = cookieValue(cookies(login), 'jgm4_refresh'); expect(oldRefresh.length).toBeGreaterThan(20);
    const refreshed = await agent.post('/api/auth/refresh').set(XHR).expect(200);
    const newRefresh = cookieValue(cookies(refreshed), 'jgm4_refresh'); expect(newRefresh).not.toBe(oldRefresh);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(200);
    await http().post('/api/auth/refresh').set(XHR).set('Cookie', `jgm4_refresh=${oldRefresh}`).expect(401); // reuso do token antigo
    await http().get('/api/auth/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(401); // a sessão inteira foi revogada
    expect(await events('SESSION_REFRESH_REUSE')).toBe(1);
    await http().post('/api/auth/refresh').set(XHR).expect(401); await http().post('/api/auth/refresh').expect(403); // sem cookie / sem cabeçalho
  });

  // ------------------------------------------------------------------ 11–13: CSRF, CORS, HTTPS
  it('11. CSRF: sessão em cookie exige o token; origem não autorizada é recusada', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ email: 'userA@teste.local', password: PASSWORD }).expect(200);
    const csrf = cookieValue(cookies(login), 'jgm4_csrf'); expect(csrf.length).toBeGreaterThan(20);
    expect(cookies(login).find((item) => item.startsWith('jgm4_csrf='))).not.toMatch(/HttpOnly/i); // o front precisa lê-lo; não é credencial
    await agent.get('/api/auth/me').expect(200); // leitura não exige token
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'Nova-Senha-Forte-3&' }).expect(403); // sem token CSRF
    await agent.post('/api/auth/change-password').set('X-CSRF-Token', 'valor-forjado').send({ currentPassword: PASSWORD, newPassword: 'Nova-Senha-Forte-3&' }).expect(403);
    expect(await events('CSRF_REJECTED')).toBeGreaterThanOrEqual(2);
    await agent.post('/api/auth/mfa/setup').set('X-CSRF-Token', csrf).expect(201); // com o token passa
    await http().post('/api/auth/forgot').set('Origin', 'https://evil.example').send({ email: 'x@y.com' }).expect(403);
    await http().post('/api/auth/forgot').set('Origin', 'http://localhost:4200').send({ email: 'x@y.com' }).expect(202);
    await call('post', '/api/auth/mfa/setup', 'sponsorA').expect(201); // Bearer não depende de cookie, portanto não precisa de CSRF
    await prisma.user.updateMany({ where: { id: { in: [id.userA, id.sponsorA] } }, data: { mfaPendingSecretEnc: null } });
  });
  it('12. CORS: só origens autorizadas recebem permissão; cabeçalhos de segurança estão presentes', async () => {
    const evil = await http().options('/api/projects').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET'); expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const good = await http().options('/api/projects').set('Origin', 'http://localhost:4200').set('Access-Control-Request-Method', 'GET'); expect(good.headers['access-control-allow-origin']).toBe('http://localhost:4200'); expect(good.headers['access-control-allow-credentials']).toBe('true');
    const res = await http().get('/api/health/live');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'"); expect(res.headers['x-content-type-options']).toBe('nosniff'); expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY'); expect(res.headers['permissions-policy']).toContain('camera=()'); expect(res.headers['x-powered-by']).toBeUndefined();
    process.env.NODE_ENV = 'production'; process.env.ALLOWED_ORIGINS = 'https://app.exemplo.com.br';
    try {
      const prodGood = await http().options('/api/projects').set('X-Forwarded-Proto', 'https').set('Origin', 'https://app.exemplo.com.br').set('Access-Control-Request-Method', 'GET'); expect(prodGood.headers['access-control-allow-origin']).toBe('https://app.exemplo.com.br');
      const prodLocal = await http().options('/api/projects').set('X-Forwarded-Proto', 'https').set('Origin', 'http://localhost:4200').set('Access-Control-Request-Method', 'GET'); expect(prodLocal.headers['access-control-allow-origin']).toBeUndefined(); // em produção nada de localhost
    } finally { process.env.NODE_ENV = saved.nodeEnv ?? 'test'; delete process.env.ALLOWED_ORIGINS; }
  });
  it('13. produção: cookies Secure/HttpOnly/SameSite=Strict, HSTS e redirecionamento de HTTP para HTTPS', async () => {
    const dev = await http().post('/api/auth/login').send({ email: 'userA@teste.local', password: PASSWORD }).expect(200); expect(cookies(dev).every((item) => !/;\s*Secure/i.test(item))).toBe(true);
    process.env.NODE_ENV = 'production'; process.env.PUBLIC_URL = 'https://app.exemplo.com.br';
    try {
      const prod = await http().post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({ email: 'userA@teste.local', password: PASSWORD }).expect(200);
      const session = cookies(prod).find((item) => item.startsWith('jgm4_session='))!; const refresh = cookies(prod).find((item) => item.startsWith('jgm4_refresh='))!;
      for (const cookie of [session, refresh]) { expect(cookie).toMatch(/;\s*Secure/i); expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=Strict/i); }
      expect(cookies(prod).find((item) => item.startsWith('jgm4_csrf='))).toMatch(/;\s*Secure/i);
      const redirect = await http().get('/api/projects'); expect(redirect.status).toBe(308); expect(String(redirect.headers.location)).toMatch(/^https:/);
      await http().get('/api/health/live').expect(200); // sondas de saúde não redirecionam
    } finally { process.env.NODE_ENV = saved.nodeEnv ?? 'test'; delete process.env.PUBLIC_URL; }
    token.userA = (await loginBody('userA@teste.local')).accessToken;
  });

  // ------------------------------------------------------------------ 14–16: anexos
  it('14 a 16. anexos privados: download autenticado e por projeto; tipos, tamanho e conteúdo são validados', async () => {
    const ok = await upload(id.PA, 'managerA', pdf(), 'Evidência de zoneamento.pdf', 'application/pdf', { entityType: 'Task', entityId: id.TA }).expect(201);
    expect(ok.body).toMatchObject({ name: 'Evidência de zoneamento.pdf', mimeType: 'application/pdf', scanStatus: 'SKIPPED', available: true, uploadedBy: 'Usuário managerA' });
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: ok.body.id } }); expect(stored.storageKey).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/); expect(stored.sha256).toHaveLength(64); expect(stored.uploadedByUserId).toBe(id.managerA);
    expect(await prisma.auditLog.count({ where: { projectId: id.PA, action: 'ATTACHMENT_UPLOADED', userId: id.managerA } })).toBe(1);
    // download: sem token 401, outro tenant 403, membro 200 com cabeçalhos seguros e evento
    await http().get(`/api/projects/${id.PA}/attachments/${ok.body.id}/download`).expect(401);
    await call('get', `/api/projects/${id.PA}/attachments/${ok.body.id}/download`, 'managerB').expect(403);
    const download = await call('get', `/api/projects/${id.PA}/attachments/${ok.body.id}/download`, 'sponsorA').expect(200);
    expect(download.headers['content-disposition']).toContain('attachment'); expect(download.headers['x-content-type-options']).toBe('nosniff'); expect(download.headers['cache-control']).toContain('no-store'); expect(download.headers['content-type']).toContain('application/pdf');
    expect(await events('SENSITIVE_DOWNLOAD', { userId: id.sponsorA, projectId: id.PA })).toBe(1);
    // arquivo de outro projeto: pelo caminho do próprio projeto não existe (404); pelo caminho do outro, sem vínculo (403)
    await call('get', `/api/projects/${id.PA}/attachments/${id.attB}/download`, 'managerA').expect(404);
    await call('get', `/api/projects/${id.PB}/attachments/${id.attB}/download`, 'managerA').expect(403);
    expect((await call('get', `/api/projects/${id.PA}/attachments?entityType=Task&entityId=${id.TA}`, 'userA').expect(200)).body).toHaveLength(1);
    // anexar em item de outro projeto, e perfil sem permissão de execução
    await upload(id.PA, 'managerA', pdf(), 'x.pdf', 'application/pdf', { entityType: 'Task', entityId: id.TB }).expect(404);
    await upload(id.PA, 'userA', pdf(), 'x.pdf', 'application/pdf', { entityType: 'Task', entityId: id.TA }).expect(403);
    await upload(id.PA, 'managerA', pdf(), 'x.pdf', 'application/pdf', { entityType: 'Gate', entityId: id.GA }).expect(400);
  });
  it('15. arquivo inválido é rejeitado: extensão, assinatura, tipo declarado, pacote Office, macros, tamanho e malware', async () => {
    const task = { entityType: 'Task', entityId: id.TA };
    const reject = async (file: Buffer, name: string, mime: string, status = 422) => upload(id.PA, 'managerA', file, name, mime, task).expect(status);
    await reject(Buffer.from('MZ-exe'), 'programa.exe', 'application/octet-stream'); await reject(Buffer.from('texto'), 'notas.txt', 'text/plain'); await reject(Buffer.from('<script>'), 'pagina.html', 'text/html');
    await reject(Buffer.from('não sou um pdf'), 'falso.pdf', 'application/pdf'); await reject(pdf(), 'imagem.png', 'image/png'); await reject(png(), 'doc.pdf', 'application/pdf');
    await reject(pdf(), 'duplo.pdf.exe', 'application/pdf'); await reject(Buffer.alloc(0), 'vazio.pdf', 'application/pdf');
    await reject(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]), 'quebrado.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await reject(await zipDoc({ '[Content_Types].xml': '<x/>', 'word/document.xml': '<d/>', 'word/vbaProject.bin': 'macro' }), 'macro.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await reject(await zipDoc({ '[Content_Types].xml': '<x/>', 'outro.txt': 'x' }), 'zip.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await reject(Buffer.concat([pdf(), Buffer.alloc(3 * 1024 * 1024)]), 'grande.pdf', 'application/pdf', 413);
    await upload(id.PA, 'managerA', pdf(), '../../etc/passwd.pdf', 'application/pdf', task).expect(201).then((res) => expect(res.body.name).toBe('passwd.pdf')); // nome seguro
    await upload(id.PA, 'managerA', png(), 'foto.png', 'image/png', task).expect(201);
    await upload(id.PA, 'managerA', await zipDoc({ '[Content_Types].xml': '<x/>', 'word/document.xml': '<d/>' }), 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', task).expect(201);
    await upload(id.PA, 'managerA', await zipDoc({ '[Content_Types].xml': '<x/>', 'xl/workbook.xml': '<w/>' }), 'dados.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', task).expect(201);
    await http().post(`/api/projects/${id.PA}/attachments`).set('Authorization', `Bearer ${token.managerA}`).field('entityType', 'Task').field('entityId', id.TA).expect(400); // sem arquivo
    expect(await events('ATTACHMENT_REJECTED')).toBeGreaterThanOrEqual(8);
    // malware (gancho antimalware): suspeito é recusado e nada é armazenado; scanner obrigatório sem verificação não libera download
    const scanner = app.get(MALWARE_SCANNER) as { scan: (...args: unknown[]) => Promise<unknown> }; const original = scanner.scan;
    const before = await prisma.attachment.count();
    scanner.scan = async () => ({ status: 'INFECTED', detail: 'Eicar-Test' });
    try { await reject(pdf(), 'infectado.pdf', 'application/pdf'); expect(await prisma.attachment.count()).toBe(before); } finally { scanner.scan = original; }
    process.env.SCAN_REQUIRED = 'true';
    try { const row = await prisma.attachment.findFirstOrThrow({ where: { projectId: id.PA, originalName: 'foto.png' } }); await call('get', `/api/projects/${id.PA}/attachments/${row.id}/download`, 'managerA').expect(409); } finally { delete process.env.SCAN_REQUIRED; }
  });

  // ------------------------------------------------------------------ 17: logs
  it('17. segredos não aparecem em logs: redação de texto/objetos e filtro de exceções sem stack trace', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJl';
    expect(redactString(`Falha ${jwt} e Bearer abc.def.ghi-123456 em postgresql://app:SuperSecreta@db:5432/x?sslmode=require&token=XYZ123456`)).not.toMatch(/eyJ|SuperSecreta|abc\.def|XYZ123/);
    const cleaned = JSON.stringify(redact({ password: 'p', currentPassword: 'q', token: 't', refreshToken: 'r', authorization: `Bearer ${jwt}`, headers: { cookie: 'jgm4_session=abc', 'x-csrf-token': 'z' }, nested: { secret: 's', mfaSecret: 'm', ok: 'visível', url: `/x?token=${jwt}` } }));
    expect(cleaned).not.toMatch(/"p"|"q"|"t"|"r"|abc|"z"|"s"|"m"|eyJ/); expect(cleaned).toContain('visível');
    const logged: string[] = []; const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => { logged.push(String(message)); });
    try {
      const filter = new SecureExceptionFilter(app.get(SecurityEventsService)); let status = 0; let body: Record<string, unknown> = {};
      const response = { status: (code: number) => { status = code; return { json: (value: Record<string, unknown>) => { body = value; } }; } };
      await filter.catch(Object.assign(new Error(`falha com password=Segredo123 e ${jwt} Bearer ${jwt}`), { stack: 'STACK-INTERNO' }), { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'POST', path: '/x', route: { path: '/x' } }) }) } as never);
      expect(status).toBe(500); expect(JSON.stringify(body)).not.toMatch(/STACK|Segredo123|eyJ|password/); expect(body.message).toContain('Erro interno');
      expect(logged.join(' ')).not.toMatch(/eyJ|Segredo123/);
    } finally { spy.mockRestore(); }
    const events = await prisma.securityEvent.findMany(); expect(JSON.stringify(events)).not.toMatch(/eyJ|"password"|Segredo|refreshHash|Bearer /);
  });

  // ------------------------------------------------------------------ 18–19: rate limit e eventos
  it('18. limites de taxa persistentes: bloqueio de conta, reset de senha e limitador por chave', async () => {
    const email = 'victim@teste.local'; let status = 0;
    for (let i = 0; i < 5; i++) status = (await http().post('/api/auth/login').send({ email, password: 'errada-errada' })).status; expect(status).toBe(401);
    await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(429); // conta bloqueada temporariamente (persistente no banco)
    expect(await events('ACCOUNT_LOCKED', { userId: id.victim })).toBe(1); expect((await prisma.user.findUniqueOrThrow({ where: { id: id.victim } })).lockedUntil).toBeTruthy();
    await call('post', `/api/admin/users/${id.victim}/unlock`, 'admin').expect(200); await loginBody(email);
    let last = 0; for (let i = 0; i < 12; i++) last = (await http().post('/api/auth/forgot').send({ email: `alvo${i}@teste.local` })).status; expect(last).toBe(429);
    expect(await events('RATE_LIMITED')).toBeGreaterThanOrEqual(1);
    process.env.RATE_LIMIT_LOGIN_PER_IP = '2'; await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'login:' } } });
    try { const codes = []; for (let i = 0; i < 4; i++) codes.push((await http().post('/api/auth/login').send({ email: 'managerA@teste.local', password: PASSWORD })).status); expect(codes).toEqual([200, 200, 429, 429]); }
    finally { process.env.RATE_LIMIT_LOGIN_PER_IP = '5000'; await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'login:' } } }); }
    const limiter = app.get(require('../src/security/rate-limiter').RateLimiter) as { hit: (key: string, limit: number, window: number) => Promise<{ allowed: boolean; remaining: number }> };
    const key = `teste:${randomUUID()}`; const results = []; for (let i = 0; i < 4; i++) results.push((await limiter.hit(key, 3, 60)).allowed); expect(results).toEqual([true, true, true, false]);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key } })).toMatchObject({ count: 4 }); // o contador está no banco, não na memória
  });
  it('19. eventos de segurança são registrados sem dados sensíveis e consultáveis pelo administrador', async () => {
    await http().post('/api/auth/login').send({ email: 'ninguem@teste.local', password: 'qualquer-coisa-1A!' }).expect(401);
    for (const type of ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET', 'PASSWORD_RESET_REQUESTED', 'SESSION_REVOKED', 'ACCESS_DENIED', 'CSRF_REJECTED', 'RATE_LIMITED', 'SENSITIVE_DOWNLOAD', 'ATTACHMENT_UPLOADED']) expect(await events(type)).toBeGreaterThanOrEqual(1);
    const denied = await prisma.securityEvent.findFirstOrThrow({ where: { type: 'ACCESS_DENIED', userId: id.managerA } }); expect(denied.ip).toBeTruthy(); expect(JSON.stringify(denied.metadata)).toContain('route');
    const list = (await call('get', '/api/admin/security-events?type=LOGIN_FAILED&limit=5', 'admin').expect(200)).body; expect(list.total).toBeGreaterThanOrEqual(1); expect(list.items.length).toBeLessThanOrEqual(5);
    await call('get', '/api/admin/security-events', 'managerA').expect(403); await call('get', '/api/admin/users', 'consIn').expect(403);
    await expect(prisma.securityEvent.updateMany({ data: { type: 'ADULTERADO' } })).rejects.toThrow(); // somente acréscimo para a aplicação
    const unknown = await prisma.securityEvent.findFirstOrThrow({ where: { type: 'LOGIN_FAILED', userId: null } }); expect(JSON.stringify(unknown.metadata)).not.toContain('@'); // e-mail desconhecido só como hash
  });

  // ------------------------------------------------------------------ 20–21: membership e exportação
  it('20. alteração de vínculo é auditada, exige re-autenticação para remover e respeita a empresa', async () => {
    const add = await call('post', `/api/projects/${id.PA}/members`, 'admin', { userId: id.consOut, roleInProject: 'JGM4_CONSULTANT' }).expect(201);
    await call('get', `/api/projects/${id.PA}`, 'consOut').expect(200);
    await call('post', `/api/projects/${id.PA}/members`, 'admin', { userId: id.managerB }).expect(403); // usuário de outra empresa
    await call('post', `/api/projects/${id.PA}/members`, 'admin', { userId: id.consOut }).expect(409);
    await call('post', `/api/projects/${id.PA}/members`, 'consIn', { userId: id.managerB }).expect(403); await call('post', `/api/projects/${id.PA}/members`, 'managerA', { userId: id.consOut }).expect(403);
    await call('patch', `/api/projects/${id.PA}/members/${add.body.membershipId}`, 'admin', { active: false }).expect(403); // sem confirmação de senha
    await call('patch', `/api/projects/${id.PA}/members/${add.body.membershipId}`, 'admin', { active: false, confirmPassword: 'errada' }).expect(403);
    await call('patch', `/api/projects/${id.PA}/members/${add.body.membershipId}`, 'admin', { active: false, confirmPassword: PASSWORD }).expect(200);
    await call('get', `/api/projects/${id.PA}`, 'consOut').expect(403);
    await call('patch', `/api/projects/${id.PA}/members/${add.body.membershipId}`, 'admin', { active: true }).expect(200);
    await call('patch', `/api/projects/${id.PA}/members/${add.body.membershipId}`, 'admin', { active: false, confirmPassword: PASSWORD }).expect(200);
    const logs = await prisma.auditLog.findMany({ where: { projectId: id.PA, entityType: 'ProjectMembership' }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((log) => log.action)).toEqual(['MEMBERSHIP_ADDED', 'MEMBERSHIP_DEACTIVATED', 'MEMBERSHIP_REACTIVATED', 'MEMBERSHIP_DEACTIVATED']); expect(logs.every((log) => log.userId === id.admin && log.actorType === 'JGM4_ADMIN')).toBe(true);
    expect(await events('REAUTH_FAILED', { userId: id.admin })).toBeGreaterThanOrEqual(2);
    const list = (await call('get', `/api/projects/${id.PA}/members`, 'managerA').expect(200)).body as { userId: string; email?: string }[]; expect(list.some((row) => row.userId === id.consOut)).toBe(false); expect(list.every((row) => row.email === undefined)).toBe(true);
  });
  it('21. exportações registram evento de segurança; downloads sensíveis também', async () => {
    const before = await events('EXPORT_GENERATED', { projectId: id.PA });
    await call('get', `/api/projects/${id.PA}/reports/executive/pdf`, 'sponsorA').expect(200); await call('get', `/api/projects/${id.PA}/reports/action-plan/xlsx`, 'consIn').expect(200);
    expect(await events('EXPORT_GENERATED', { projectId: id.PA })).toBe(before + 2);
    await call('get', `/api/projects/${id.PA}/audit/xlsx`, 'admin').expect(200); expect(await events('SENSITIVE_DOWNLOAD', { projectId: id.PA, userId: id.admin })).toBe(1);
    await call('get', '/api/admin/access-review/xlsx', 'admin').expect(200); expect(await events('SENSITIVE_DOWNLOAD', { userId: id.admin })).toBeGreaterThanOrEqual(2);
    expect((await prisma.reportGenerationLog.findFirstOrThrow({ where: { projectId: id.PA, reportType: 'EXECUTIVE' } })).generatedByUserId).toBe(id.sponsorA);
  });

  // ------------------------------------------------------------------ 22–23: produção
  it('22. produção: modo de desenvolvimento recusado e configuração insegura é listada', async () => {
    process.env.ALLOW_DEV_ACTOR_HEADER = 'true'; process.env.NODE_ENV = 'production';
    try {
      await http().get('/api/projects').set('X-Forwarded-Proto', 'https').set('x-actor-role', 'JGM4_ADMIN').expect(401); await http().get('/api/auth/me').set('X-Forwarded-Proto', 'https').set('x-actor-role', 'JGM4_ADMIN').expect(401);
    } finally { process.env.NODE_ENV = saved.nodeEnv ?? 'test'; process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; }
    const secure = { JWT_SECRET: 'a'.repeat(16) + 'Zq9!x'.repeat(8), DATA_ENCRYPTION_KEY: 'ab'.repeat(32), PUBLIC_URL: 'https://app.jgm4consultoria.com.br', ALLOWED_ORIGINS: 'https://app.jgm4consultoria.com.br',
      DATABASE_URL: 'postgresql://app:x@db.interno:5432/jgm4?sslmode=verify-full', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.exemplo.com', SMTP_USER: 'apikey', SMTP_PASSWORD: 'x9Kq-segredo', MAIL_FROM: 'JGM4 Projects <nao-responder@jgm4consultoria.com.br>', APP_ENV: 'production', REQUIRE_MFA_FOR_ADMIN: 'true', BACKUP_ENCRYPTION_KEY: 'cd'.repeat(32), STORAGE_LOCAL_DIR: '/var/lib/jgm4/storage' };
    expect(validateProductionConfig(secure)).toEqual([]);
    const errors = validateProductionConfig({ JWT_SECRET: 'troque-por-um-segredo-longo-e-aleatorio-com-64-caracteres-ou-mais', PUBLIC_URL: 'http://app.exemplo.com', ALLOWED_ORIGINS: '*', DATABASE_URL: 'postgresql://x@h/db', ALLOW_DEV_ACTOR_HEADER: 'true', MAIL_PROVIDER: 'memory' }).join(' | ');
    for (const expected of ['JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'https', 'ALLOWED_ORIGINS', 'TLS', 'ALLOW_DEV_ACTOR_HEADER', 'MAIL_PROVIDER']) expect(errors).toContain(expected);
    expect(validateProductionConfig({ ...secure, ALLOWED_ORIGINS: 'https://a.com,*' }).join(' ')).toContain('ALLOWED_ORIGINS');
    for (const [override, expected] of [[{ APP_ENV: 'development' }, 'APP_ENV'], [{ REQUIRE_MFA_FOR_ADMIN: 'false' }, 'REQUIRE_MFA_FOR_ADMIN'], [{ BACKUP_ENCRYPTION_KEY: '' }, 'BACKUP_ENCRYPTION_KEY'], [{ BACKUP_ENCRYPTION_KEY: 'ab'.repeat(32) }, 'diferente'], [{ MAIL_FROM: 'dev@exemplo.invalid' }, 'MAIL_FROM'], [{ SMTP_PASSWORD: '' }, 'SMTP_PASSWORD']] as [Record<string, string>, string][]) expect(validateProductionConfig({ ...secure, ...override }).join(' ')).toContain(expected);
  });
  it('23. produção não cria usuários nem demonstrações pelo seed (e o bloqueia por padrão)', async () => {
    const seed = (extra: Record<string, string>) => spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 120000,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL!, NODE_ENV: 'production', ...extra } });
    const blocked = seed({}); expect(blocked.status).toBe(0); expect(blocked.stdout).toContain('Seed bloqueado em produção');
    expect(await prisma.user.count({ where: { email: { endsWith: '.local' }, role: { in: ['JGM4_CONSULTANT'] }, name: 'Consultor JGM4' } })).toBe(0); expect(await prisma.project.count({ where: { name: { startsWith: 'Simulação' } } })).toBe(0);
    const allowed = seed({ ALLOW_PRODUCTION_SEED: 'true', SEED_USER_PASSWORD: '' }); expect(allowed.status).toBe(0); expect(allowed.stdout).toContain('NÃO foram criados');
    expect(await prisma.project.count({ where: { name: { startsWith: 'Simulação' } } })).toBe(0); expect(await prisma.user.count({ where: { email: { in: ['admin@jgm4.local', 'consultor@jgm4.local', 'sponsor@ollem.local'] } } })).toBe(0);
    expect(await prisma.project.count({ where: { name: 'Estruturação do Almoxarifado' } })).toBe(1); // seed base (estrutura) disponível só com autorização explícita
  }, 240000);

  // ------------------------------------------------------------------ MFA, senha e administração
  it('MFA TOTP: ativação, desafio no login, falha registrada, secreto cifrado e MFA obrigatório para administrador (opção)', async () => {
    expect(totpAt(base32Encode(Buffer.from('12345678901234567890')), 59000)).toBe('287082'); // vetor do RFC 6238
    const setup = (await call('post', '/api/auth/mfa/setup', 'sponsorA').expect(201)).body as { secret: string; otpauthUri: string }; expect(setup.otpauthUri).toContain('otpauth://totp/');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: id.sponsorA } }); expect(stored.mfaPendingSecretEnc).toBeTruthy(); expect(stored.mfaPendingSecretEnc).not.toContain(setup.secret); // cifrado em repouso
    await call('post', '/api/auth/mfa/enable', 'sponsorA', { code: '000000' }).expect(400);
    await call('post', '/api/auth/mfa/enable', 'sponsorA', { code: totpAt(setup.secret, Date.now()) }).expect(200);
    const challenge = (await http().post('/api/auth/login').send({ email: 'sponsorA@teste.local', password: PASSWORD }).expect(200)).body; expect(challenge).toMatchObject({ mfaRequired: true }); expect(challenge.accessToken).toBeUndefined();
    await http().post('/api/auth/mfa/verify').send({ mfaToken: challenge.mfaToken, code: '123456' }).expect(401); expect(await events('MFA_FAILED', { userId: id.sponsorA })).toBeGreaterThanOrEqual(2);
    const session = (await http().post('/api/auth/mfa/verify').send({ mfaToken: challenge.mfaToken, code: totpAt(setup.secret, Date.now()) }).expect(200)).body; expect(session.accessToken).toBeTruthy(); token.sponsorA = session.accessToken;
    await http().get('/api/auth/me').set('Authorization', `Bearer ${challenge.mfaToken}`).expect(401); // token de desafio não é sessão
    // administrador sem MFA, com a exigência ligada: sessão restrita a /api/auth/* até ativar
    process.env.REQUIRE_MFA_FOR_ADMIN = 'true';
    try {
      const restricted = await loginBody('admin2@teste.local'); expect(restricted.restricted).toBe('MFA_SETUP_REQUIRED');
      const blocked = await call('get', '/api/projects').set('Authorization', `Bearer ${restricted.accessToken}`).expect(403); expect(blocked.body.code).toBe('MFA_SETUP_REQUIRED');
      const adminSetup = (await http().post('/api/auth/mfa/setup').set('Authorization', `Bearer ${restricted.accessToken}`).expect(201)).body;
      await http().post('/api/auth/mfa/enable').set('Authorization', `Bearer ${restricted.accessToken}`).send({ code: totpAt(adminSetup.secret, Date.now()) }).expect(200);
      await http().get('/api/projects').set('Authorization', `Bearer ${restricted.accessToken}`).expect(200);
    } finally { delete process.env.REQUIRE_MFA_FOR_ADMIN; }
    await prisma.user.update({ where: { id: id.admin2 }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  });
  it('senha: troca exige a atual, encerra as outras sessões, registra evento e avisa por e-mail', async () => {
    const first = await loginBody('userA@teste.local'); const second = await loginBody('userA@teste.local'); MailService.memory.length = 0;
    await http().post('/api/auth/change-password').set('Authorization', `Bearer ${first.accessToken}`).send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
    await http().post('/api/auth/change-password').set('Authorization', `Bearer ${first.accessToken}`).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(200);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${first.accessToken}`).expect(200); await http().get('/api/auth/me').set('Authorization', `Bearer ${second.accessToken}`).expect(401);
    expect(MailService.memory.some((message) => message.subject.includes('alterada') && !message.text.includes(NEW_PASSWORD))).toBe(true); expect(await events('PASSWORD_CHANGED', { userId: id.userA })).toBe(1);
    await prisma.user.update({ where: { id: id.userA }, data: { passwordHash: await hash(PASSWORD, 4) } }); token.userA = (await loginBody('userA@teste.local')).accessToken;
  });
  it('administração de usuários: criação por e-mail, estado, anonimização que preserva auditoria e proteção do último administrador', async () => {
    MailService.memory.length = 0;
    const created = (await call('post', '/api/admin/users', 'admin', { name: 'Novo Cliente', email: 'novo.cliente@teste.local', role: 'CLIENT_MANAGER', companyId: id.ollem }).expect(201)).body;
    expect(MailService.memory.find((message) => message.to === 'novo.cliente@teste.local')!.subject).toContain('Defina sua senha'); await call('post', '/api/admin/users', 'admin', { name: 'Dup', email: 'novo.cliente@teste.local', role: 'CLIENT_MANAGER', companyId: id.ollem }).expect(409);
    await call('post', '/api/admin/users', 'admin', { name: 'Sem Empresa', email: 'sem.empresa@teste.local', role: 'CLIENT_MANAGER' }).expect(400); await call('post', '/api/admin/users', 'consIn', { name: 'X Y', email: 'x@y.com', role: 'CLIENT_USER', companyId: id.ollem }).expect(403);
    await call('post', '/api/admin/users', 'admin', { name: 'Perfil Errado', email: 'perfil@teste.local', role: 'CLIENT_MANAGER', companyId: id.ollem }).expect(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).mustChangePassword).toBe(true);
    // estado: exige senha do administrador; inativar derruba sessões
    const target = await loginBody('victim@teste.local');
    await call('patch', `/api/admin/users/${id.victim}/status`, 'admin', { status: 'INACTIVE', reason: 'Desligamento do cliente' }).expect(400);
    await call('patch', `/api/admin/users/${id.victim}/status`, 'admin', { status: 'INACTIVE', reason: 'Desligamento do cliente', confirmPassword: 'errada' }).expect(403);
    await call('patch', `/api/admin/users/${id.victim}/status`, 'admin', { status: 'INACTIVE', reason: 'Desligamento do cliente', confirmPassword: PASSWORD }).expect(200);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${target.accessToken}`).expect(401);
    // anonimização: dados pessoais saem; histórico de auditoria permanece vinculado ao registro anonimizado
    await prisma.auditLog.create({ data: { projectId: id.PA, entityType: 'Task', entityId: id.TA, action: 'START', actorType: 'CLIENT_MANAGER', userId: id.victim } });
    await call('post', `/api/admin/users/${id.victim}/anonymize`, 'admin', { reason: 'Solicitação do titular', confirmPassword: PASSWORD }).expect(200);
    const anon = await prisma.user.findUniqueOrThrow({ where: { id: id.victim } }); expect(anon).toMatchObject({ name: 'Usuário anonimizado', status: 'INACTIVE', active: false }); expect(anon.email).toMatch(/^anonimo-.*@anonimizado\.invalid$/); expect(anon.anonymizedAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { userId: id.victim } })).toBe(1); expect(await prisma.projectMembership.count({ where: { userId: id.victim, active: true } })).toBe(0);
    await call('post', `/api/admin/users/${id.victim}/anonymize`, 'admin', { reason: 'Repetida', confirmPassword: PASSWORD }).expect(409);
    // o último administrador ativo e a própria conta não podem ser desativados/rebaixados
    await call('patch', `/api/admin/users/${id.admin}/status`, 'admin', { status: 'INACTIVE', reason: 'Tentativa', confirmPassword: PASSWORD }).expect(400);
    await call('patch', `/api/admin/users/${id.admin2}/status`, 'admin', { status: 'BLOCKED', reason: 'Conta comprometida', confirmPassword: PASSWORD }).expect(200);
    await call('patch', `/api/admin/users/${id.consIn}/role`, 'admin', { role: 'JGM4_ADMIN', reason: 'Promoção', confirmPassword: PASSWORD }).expect(200); // vira administrador
    await call('patch', `/api/admin/users/${id.consIn}/role`, 'admin', { role: 'CLIENT_USER', reason: 'Troca indevida', confirmPassword: PASSWORD }).expect(400); await call('patch', `/api/admin/users/${id.consIn}/role`, 'admin', { role: 'JGM4_CONSULTANT', reason: 'Reversão', confirmPassword: PASSWORD }).expect(200);
    await prisma.user.update({ where: { id: id.admin2 }, data: { status: 'ACTIVE', active: true } }); token.consIn = (await loginBody('consIn@teste.local')).accessToken;
  });
  it('revisão de acessos identifica usuários sem uso, contas bloqueadas e administradores sem MFA', async () => {
    await prisma.user.update({ where: { id: id.managerB }, data: { lastLoginAt: new Date(Date.now() - 200 * 86400000), lastActivityAt: new Date(Date.now() - 200 * 86400000) } });
    await prisma.user.update({ where: { id: id.userA }, data: { lockedUntil: new Date(Date.now() + 600000) } });
    const rows = (await call('get', '/api/admin/access-review?inactiveDays=90', 'admin').expect(200)).body as { email: string; flags: string[]; memberships: unknown[] }[];
    expect(rows.find((row) => row.email === 'managerb@teste.local')!.flags.join(' ')).toContain('Sem login há mais de 90 dias');
    expect(rows.find((row) => row.email === 'usera@teste.local')!.flags).toContain('Conta bloqueada temporariamente'); expect(rows.find((row) => row.email === 'admin@teste.local')!.flags.join(' ')).toContain('sem verificação em duas etapas');
    expect(rows.find((row) => row.email === 'managera@teste.local')!.memberships.length).toBeGreaterThan(0);
    await prisma.user.update({ where: { id: id.userA }, data: { lockedUntil: null } });
  });
  it('incidentes: ciclo OPEN → CLOSED só avança, exige ações para encerrar e mantém linha do tempo imutável', async () => {
    const created = (await call('post', '/api/admin/incidents', 'admin', { title: 'Tentativas de acesso suspeitas', description: 'Várias tentativas de login falhas.', affectedCompanyIds: [id.ollem], occurredAt: new Date().toISOString() }).expect(201)).body;
    expect(created).toMatchObject({ status: 'OPEN' }); expect(created.events).toHaveLength(1);
    await call('patch', `/api/admin/incidents/${created.id}`, 'admin', { status: 'INVESTIGATING', note: 'Análise iniciada.' }).expect(200);
    await call('patch', `/api/admin/incidents/${created.id}`, 'admin', { status: 'OPEN', note: 'Voltar' }).expect(400);
    await call('patch', `/api/admin/incidents/${created.id}`, 'admin', { status: 'CLOSED', note: 'Encerrar' }).expect(400);
    const closed = (await call('patch', `/api/admin/incidents/${created.id}`, 'admin', { status: 'CLOSED', note: 'Encerrado.', actionsTaken: 'Senhas redefinidas e IP bloqueado.' }).expect(200)).body; expect(closed.status).toBe('CLOSED'); expect(closed.closedAt).toBeTruthy(); expect(closed.events).toHaveLength(3);
    await expect(prisma.incidentEvent.deleteMany({})).rejects.toThrow(); await call('get', '/api/admin/incidents', 'managerA').expect(403);
  });
  it('retenção: remove só dados de segurança vencidos, anonimiza IP antigo e nunca toca a auditoria de negócio', async () => {
    const old = new Date(Date.now() - 400 * 86400000); const midway = new Date(Date.now() - 120 * 86400000);
    await prisma.securityEvent.createMany({ data: [{ type: 'LOGIN_FAILED', ip: '203.0.113.9', userAgent: 'agente-antigo', createdAt: old }, { type: 'LOGIN_SUCCESS', ip: '203.0.113.10', userAgent: 'agente-meio', createdAt: midway }] });
    await prisma.rateLimitBucket.create({ data: { key: `velho:${randomUUID()}`, windowStart: old, count: 1 } });
    await prisma.authSession.create({ data: { userId: id.consIn, refreshHash: randomUUID(), expiresAt: old, idleExpiresAt: old } });
    const auditBefore = await prisma.auditLog.count(); const approvalsBefore = await prisma.approval.count(); const reportsBefore = await prisma.reportGenerationLog.count();
    const dry = await runRetention(true, prisma); expect(dry['eventos_de_seguranca_vencidos']).toBeGreaterThanOrEqual(1); expect(await prisma.securityEvent.count({ where: { ip: '203.0.113.9' } })).toBe(1); // simulação não altera nada
    const report = await runRetention(false, prisma);
    expect(report['eventos_de_seguranca_vencidos']).toBeGreaterThanOrEqual(1); expect(report['sessoes_expiradas']).toBeGreaterThanOrEqual(1); expect(report['contadores_de_rate_limit']).toBeGreaterThanOrEqual(1); expect(report['ips_anonimizados']).toBeGreaterThanOrEqual(1);
    expect(await prisma.securityEvent.count({ where: { ip: '203.0.113.9' } })).toBe(0); const anonymized = await prisma.securityEvent.findFirstOrThrow({ where: { createdAt: midway } }); expect(anonymized).toMatchObject({ ip: null, userAgent: null, type: 'LOGIN_SUCCESS' });
    expect(await prisma.auditLog.count()).toBe(auditBefore); expect(await prisma.approval.count()).toBe(approvalsBefore); expect(await prisma.reportGenerationLog.count()).toBe(reportsBefore);
  });
  it('responsável de atividade só pode ser um membro ativo do projeto; a lista de membros alimenta a seleção', async () => {
    const members = (await call('get', `/api/projects/${id.PA}/members`, 'managerA').expect(200)).body as { userId: string; name: string }[]; expect(members.map((row) => row.userId)).toEqual(expect.arrayContaining([id.managerA, id.sponsorA]));
    await call('post', `/api/tasks/${id.TA}/responsible-change`, 'managerA', { field: 'CLIENT', newUserId: id.managerB, justification: 'Usuário de outra empresa' }).expect(400);
    const ok = await call('post', `/api/tasks/${id.TA}/responsible-change`, 'managerA', { field: 'CLIENT', newUserId: id.sponsorA, justification: 'Patrocinador assume a atividade' }).expect(201); expect(ok.body.type).toBe('RESPONSIBLE_CHANGE');
  });
  it('configuração pública e privacidade: contato só aparece se configurado; sondas não expõem detalhes', async () => {
    expect((await http().get('/api/public-config').expect(200)).body).toEqual({ privacyContactEmail: null });
    process.env.PRIVACY_CONTACT_EMAIL = 'privacidade@exemplo.com.br';
    try { expect((await http().get('/api/public-config').expect(200)).body).toEqual({ privacyContactEmail: 'privacidade@exemplo.com.br' }); } finally { delete process.env.PRIVACY_CONTACT_EMAIL; }
    expect(JSON.stringify((await http().get('/api/health/live')).body)).not.toMatch(/database|postgres|stage|version/i);
  });
});
