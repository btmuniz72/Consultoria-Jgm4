import 'reflect-metadata';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { sign, decode } from 'jsonwebtoken';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureApproval } from '../src/approvals/approval-sync';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 5.1 — autenticação, vínculo usuário-projeto e isolamento', () => {
  const schema = `jgm4_stage51_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, env: process.env.NODE_ENV, actor: process.env.JGM4_LOCAL_ACTOR };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!';
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const api = (method: 'get' | 'post' | 'patch', path: string, who?: string, body?: object) => {
    const r = http()[method](path); if (who) r.set('Authorization', `Bearer ${token[who]}`);
    return body ? r.send(body) : method === 'post' ? r.send({}) : r;
  };
  const login = async (email: string) => (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken as string;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
      for (const folder of ['20261022000100_initial', '20261022000200_requests', '20261023000100_task_workflow', '20261023000200_gates', '20261024000100_approvals', '20261025000100_auth', '20261026000100_project_status_values', '20261026000200_project_status_data', '20261027000100_reports', '20261028000100_security','20261101000100_admin_ops','20261102000100_project_templates']) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${folder}/migration.sql`), 'utf8');
        if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); }
        else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; delete process.env.JGM4_LOCAL_ACTOR;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);

    const passwordHash = await hash(PASSWORD, 4);
    const companyA = (await prisma.company.create({ data: { name: 'Empresa A' } })).id; const companyB = (await prisma.company.create({ data: { name: 'Empresa B' } })).id;
    const user = async (key: string, role: string, companyId: string | null) => { id[key] = (await prisma.user.create({ data: { name: `Usuário ${key}`, email: `${key}@teste.local`.toLowerCase(), passwordHash, role: role as never, companyId } })).id; };
    await user('admin', 'JGM4_ADMIN', null); await user('consIn', 'JGM4_CONSULTANT', null); await user('consOut', 'JGM4_CONSULTANT', null);
    await user('sponsorA', 'CLIENT_SPONSOR', companyA); await user('managerA', 'CLIENT_MANAGER', companyA); await user('userA', 'CLIENT_USER', companyA);
    await user('managerB', 'CLIENT_MANAGER', companyB); await user('rogueA', 'CLIENT_MANAGER', companyA); await user('locked', 'CLIENT_USER', companyA);

    const build = async (key: 'A' | 'B', companyId: string) => {
      const project = await prisma.project.create({ data: { companyId, name: `Projeto ${key}`, description: 'Fixture' } }); id[`P${key}`] = project.id;
      const p0 = await prisma.phase.create({ data: { projectId: project.id, order: 0, name: 'Fase 0', description: 'F0', plannedWeeks: 3, plannedJgm4Hours: 36, status: 'AVAILABLE' } });
      const gate = await prisma.gate.create({ data: { projectId: project.id, phaseId: p0.id, code: 'GATE-0', title: 'Gate 0', question: 'Pronto?', status: 'AVAILABLE', currentOwnerType: 'JGM4' } });
      id[`G${key}`] = gate.id;
      await ensureApproval(prisma, { projectId: project.id, type: 'GATE_TECHNICAL_OPINION', entityType: 'Gate', entityId: gate.id, entityCode: 'GATE-0', title: 'GATE-0', description: 'Pronto?', assignedRole: 'JGM4_CONSULTANT' });
      const task = (code: string, status: string) => prisma.task.create({ data: { projectId: project.id, phaseId: p0.id, code, title: code, objective: code, instructions: 'x', acceptanceCriteria: 'x', status: status as never } });
      id[`TA${key}`] = (await task('TV', 'WAITING_JGM4_VALIDATION')).id; id[`TH${key}`] = (await task('TH', 'IN_PROGRESS')).id;
      await ensureApproval(prisma, { projectId: project.id, type: 'TASK_VALIDATION', entityType: 'Task', entityId: id[`TA${key}`], entityCode: 'TV', title: 'TV', description: 'x', assignedRole: 'JGM4_CONSULTANT' });
      const req = async (code: string, status: string) => {
        const r = await prisma.projectRequest.create({ data: { projectId: project.id, phaseId: p0.id, code, title: code, description: code, instructions: 'x', acceptanceCriteria: 'x', status: status as never, mandatory: false, blocking: false } });
        await prisma.requestRequirement.create({ data: { requestId: r.id, label: 'Item', completed: true } }); return r.id;
      };
      id[`RA${key}`] = await req('SOL-1', 'SENT_TO_JGM4'); id[`RS${key}`] = await req('SOL-2', 'CLIENT_PREPARING');
      await ensureApproval(prisma, { projectId: project.id, type: 'REQUEST_REVIEW', entityType: 'ProjectRequest', entityId: id[`RA${key}`], entityCode: 'SOL-1', title: 'SOL-1', description: 'x', assignedRole: 'JGM4_CONSULTANT' });
      id[`AP${key}`] = (await prisma.approval.findFirstOrThrow({ where: { projectId: project.id, type: 'REQUEST_REVIEW' } })).id;
      return project.id;
    };
    await build('A', companyA); await build('B', companyB);
    // Decisão do patrocinador: Gate de fase 1 já tecnicamente aprovado no projeto A.
    const p1 = await prisma.phase.create({ data: { projectId: id.PA, order: 1, name: 'Fase 1', description: 'F1', plannedWeeks: 3, plannedJgm4Hours: 39, status: 'WAITING_GATE' } });
    await prisma.phase.create({ data: { projectId: id.PA, order: 2, name: 'Fase 2', description: 'F2', plannedWeeks: 3, plannedJgm4Hours: 39, status: 'LOCKED' } });
    id.G1A = (await prisma.gate.create({ data: { projectId: id.PA, phaseId: p1.id, code: 'GATE-1', title: 'Gate 1', question: 'Avançar?', status: 'TECHNICALLY_APPROVED', currentOwnerType: 'CLIENT_SPONSOR' } })).id;
    await ensureApproval(prisma, { projectId: id.PA, type: 'GATE_CLIENT_DECISION', entityType: 'Gate', entityId: id.G1A, entityCode: 'GATE-1', title: 'GATE-1', description: 'Avançar?', assignedRole: 'CLIENT_SPONSOR' });
    // Vínculos: consIn → A; sponsorA/managerA/userA → A; managerB → B; rogueA (empresa A) vinculado indevidamente ao B.
    const member = (userKey: string, projectKey: string) => prisma.projectMembership.create({ data: { projectId: id[projectKey], userId: id[userKey] } });
    for (const [u, p] of [['consIn', 'PA'], ['sponsorA', 'PA'], ['managerA', 'PA'], ['userA', 'PA'], ['managerB', 'PB'], ['rogueA', 'PB']]) await member(u, p);
    for (const key of ['admin', 'consIn', 'consOut', 'sponsorA', 'managerA', 'userA', 'managerB', 'rogueA']) token[key] = await login(`${key}@teste.local`);
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['NODE_ENV', saved.env], ['JGM4_LOCAL_ACTOR', saved.actor]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('1. login válido devolve token mínimo, usuário sem hash e cookie HttpOnly/SameSite=Strict', async () => {
    const response = await http().post('/api/auth/login').send({ email: 'ManagerA@Teste.local', password: PASSWORD }).expect(200);
    expect(response.body.user).toMatchObject({ id: id.managerA, role: 'CLIENT_MANAGER', company: { name: 'Empresa A' } });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const claims = decode(response.body.accessToken) as Record<string, unknown>;
    expect(Object.keys(claims).sort()).toEqual(['companyId', 'exp', 'iat', 'iss', 'role', 'sid', 'sub']);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/jgm4_session=/); expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=Strict/i);
    // o cookie autentica sozinho
    await http().get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
    const hashed = (await prisma.user.findUniqueOrThrow({ where: { id: id.managerA } })).passwordHash;
    expect(hashed).toMatch(/^\$2[aby]\$/); expect(hashed).not.toContain(PASSWORD);
  });
  it('2. login inválido: mesma mensagem, validação de corpo e bloqueio por tentativas', async () => {
    const wrong = await http().post('/api/auth/login').send({ email: 'managerA@teste.local', password: 'errada' }).expect(401);
    const unknown = await http().post('/api/auth/login').send({ email: 'ninguem@teste.local', password: 'qualquer' }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    await http().post('/api/auth/login').send({ email: 'sem-formato', password: 'x' }).expect(400);
    await http().post('/api/auth/login').send({ email: 'managerA@teste.local', password: PASSWORD, role: 'JGM4_ADMIN' }).expect(400);
    for (let i = 0; i < 5; i++) await http().post('/api/auth/login').send({ email: 'locked@teste.local', password: 'errada' }).expect(401);
    await http().post('/api/auth/login').send({ email: 'locked@teste.local', password: PASSWORD }).expect(429);
    await prisma.user.update({ where: { id: id.managerA }, data: { active: false } });
    await http().post('/api/auth/login').send({ email: 'managerA@teste.local', password: PASSWORD }).expect(401);
    await prisma.user.update({ where: { id: id.managerA }, data: { active: true } });
  });
  it('3. endpoints protegidos sem token (ou com token inválido/expirado) retornam 401; health é público', async () => {
    for (const path of ['/api/projects', '/api/companies', '/api/approvals', '/api/approvals/summary', `/api/projects/${id.PA}`]) await http().get(path).expect(401);
    await http().post(`/api/tasks/${id.THA}/start`).send({}).expect(401);
    await http().get('/api/projects').set('Authorization', 'Bearer lixo').expect(401);
    const secret = process.env.JWT_SECRET!;
    const expired = sign({ sub: id.managerA, role: 'CLIENT_MANAGER', companyId: null }, secret, { expiresIn: -10, issuer: 'jgm4-projects' });
    await http().get('/api/projects').set('Authorization', `Bearer ${expired}`).expect(401);
    const foreign = sign({ sub: id.managerA, role: 'CLIENT_MANAGER', companyId: null }, 'outro-segredo-qualquer-0123456789abcdef', { issuer: 'jgm4-projects' });
    await http().get('/api/projects').set('Authorization', `Bearer ${foreign}`).expect(401);
    await http().get('/api/health').expect(200);
  });
  it('4. token válido identifica o usuário; desativar o usuário derruba a sessão', async () => {
    const { body } = await api('get', '/api/auth/me', 'managerA').expect(200);
    expect(body).toMatchObject({ id: id.managerA, name: 'Usuário managerA', role: 'CLIENT_MANAGER', company: { name: 'Empresa A' }, projects: [id.PA] });
    await prisma.user.update({ where: { id: id.userA }, data: { active: false } });
    await api('get', '/api/auth/me', 'userA').expect(401);
    await prisma.user.update({ where: { id: id.userA }, data: { active: true } });
  });
  it('5. CLIENT_MANAGER acessa o projeto da própria empresa', async () => {
    await api('get', `/api/projects/${id.PA}`, 'managerA').expect(200);
    await api('get', `/api/projects/${id.PA}/tasks`, 'managerA').expect(200);
    await api('get', `/api/tasks/${id.THA}`, 'managerA').expect(200);
  });
  it('6. cliente não acessa outra empresa (leitura, escrita, aprovações, horas, Gate de JGM4)', async () => {
    for (const path of [`/api/projects/${id.PB}`, `/api/projects/${id.PB}/tasks`, `/api/projects/${id.PB}/requests`, `/api/projects/${id.PB}/gates`, `/api/tasks/${id.THB}`, `/api/approvals/${id.APB}`, `/api/projects/${id.PB}/approvals/pending`]) await api('get', path, 'managerA').expect(403);
    await api('get', `/api/projects/${randomUUID()}`, 'managerA').expect(403); // não revela se existe
    await api('get', `/api/projects/${id.PA}`, 'managerB').expect(403);
    await api('post', `/api/tasks/${id.THB}/due-date-change`, 'managerA', { requestedDate: '2026-12-01', justification: 'Tentativa cruzada' }).expect(403);
    await api('post', `/api/tasks/${id.THB}/time-entries`, 'managerA', { date: '2026-10-25', hours: 1, description: 'Tentativa' }).expect(403);
    await api('post', `/api/approvals/${id.APB}/approve`, 'managerA').expect(403);
    await api('post', `/api/projects/${id.PB}/requests/${id.RSB}/send`, 'managerA').expect(403);
    await api('get', `/api/approvals?projectId=${id.PB}`, 'managerA').expect(403);
    await api('post', `/api/gates/${id.GA}/technical-opinion`, 'userA', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'Cliente tentando validar como JGM4' }).expect(403);
    // vínculo indevido a projeto de outra empresa não vale: a empresa do usuário é verificada
    await api('get', `/api/projects/${id.PB}`, 'rogueA').expect(403);
    expect((await api('get', '/api/projects', 'managerA').expect(200)).body.map((p: any) => p.id)).toEqual([id.PA]);
    expect((await api('get', '/api/companies', 'managerA').expect(200)).body.map((c: any) => c.name)).toEqual(['Empresa A']);
    expect((await api('get', '/api/projects', 'rogueA').expect(200)).body).toEqual([]);
  });
  it('7. consultor sem vínculo recebe 403 em tudo (parecer, validação, aceite, Central)', async () => {
    await api('get', `/api/projects/${id.PA}`, 'consOut').expect(403);
    await api('post', `/api/tasks/${id.TAA}/validate`, 'consOut').expect(403);
    await api('post', `/api/projects/${id.PA}/requests/${id.RAA}/accept`, 'consOut').expect(403);
    await api('post', `/api/gates/${id.GA}/start-review`, 'consOut').expect(403);
    await api('post', `/api/gates/${id.GA}/technical-opinion`, 'consOut', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'Sem vínculo' }).expect(403);
    await api('post', `/api/approvals/${id.APA}/approve`, 'consOut').expect(403);
    expect((await api('get', '/api/approvals', 'consOut').expect(200)).body).toEqual([]);
    expect((await api('get', '/api/approvals/summary', 'consOut').expect(200)).body.total).toBe(0);
    expect((await api('get', '/api/projects', 'consOut').expect(200)).body).toEqual([]);
  });
  it('8. consultor com vínculo acessa e age somente no projeto vinculado', async () => {
    await api('get', `/api/projects/${id.PA}`, 'consIn').expect(200);
    await api('get', `/api/projects/${id.PB}`, 'consIn').expect(403);
    const { body } = await api('post', `/api/tasks/${id.TAA}/validate`, 'consIn', { comment: 'Conferido' }).expect(201);
    expect(body.status).toBe('VALIDATED');
    await api('post', `/api/tasks/${id.TAB}/validate`, 'consIn').expect(403);
  });
  it('9. JGM4_ADMIN acessa todos os projetos', async () => {
    await api('get', `/api/projects/${id.PA}`, 'admin').expect(200); await api('get', `/api/projects/${id.PB}`, 'admin').expect(200);
    expect((await api('get', '/api/projects', 'admin').expect(200)).body.map((p: any) => p.id)).toEqual(expect.arrayContaining([id.PA, id.PB]));
    await api('get', `/api/projects/${randomUUID()}`, 'admin').expect(404);
  });
  it('10. o ator da aprovação vem do usuário autenticado (solicitante e decisor)', async () => {
    await api('post', `/api/projects/${id.PA}/requests/${id.RSA}/send`, 'managerA').expect(200);
    const created = await prisma.approval.findFirstOrThrow({ where: { entityId: id.RSA, type: 'REQUEST_REVIEW' } });
    expect(created).toMatchObject({ requestedByUserId: id.managerA, requestedByRole: 'CLIENT_MANAGER' });
    await api('post', `/api/approvals/${created.id}/approve`, 'consIn', { comment: 'ok' }).expect(200);
    expect(await prisma.approval.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ status: 'APPROVED', decidedByUserId: id.consIn, decidedByRole: 'JGM4_CONSULTANT' });
  });
  it('11. AuditLog registra o usuário real (id e perfil) em solicitações, aprovações e Gates', async () => {
    const logs = await prisma.auditLog.findMany({ where: { entityType: 'ProjectRequest', entityId: id.RSA }, orderBy: { createdAt: 'asc' } });
    const sent = logs.find((log) => log.action === 'STATUS_CHANGED')!; const accepted = logs.find((log) => log.action === 'ACCEPTED')!;
    expect(sent).toMatchObject({ userId: id.managerA, actorType: 'CLIENT_MANAGER' }); expect(accepted).toMatchObject({ userId: id.consIn, actorType: 'JGM4_CONSULTANT' });
    expect(await prisma.auditLog.count({ where: { entityType: 'Approval', userId: id.consIn, action: 'APPROVAL_APPROVED' } })).toBeGreaterThan(0);
    const validate = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Task', entityId: id.TAA, action: 'VALIDATE' } });
    expect(validate).toMatchObject({ userId: id.consIn, actorType: 'JGM4_CONSULTANT' });
    await api('post', `/api/gates/${id.GA}/start-review`, 'consIn').expect(201);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Gate', entityId: id.GA, action: 'START_REVIEW' } })).toMatchObject({ userId: id.consIn });
  });
  it('12. TimeEntry deriva a organização do usuário e recusa organizationType enviado', async () => {
    const body = { date: '2026-10-25', hours: 2, description: 'Atividade de campo' };
    const client = await api('post', `/api/tasks/${id.THA}/time-entries`, 'managerA', body).expect(201);
    expect(client.body.entry).toMatchObject({ organizationType: 'CLIENT', userId: id.managerA });
    const consultant = await api('post', `/api/tasks/${id.THA}/time-entries`, 'consIn', body).expect(201);
    expect(consultant.body.entry).toMatchObject({ organizationType: 'JGM4', userId: id.consIn });
    await api('post', `/api/tasks/${id.THA}/time-entries`, 'managerA', { ...body, organizationType: 'JGM4' }).expect(400);
    await api('post', `/api/tasks/${id.THA}/time-entries`, 'managerA', { ...body, userId: id.admin }).expect(400);
  });
  it('13. perfil/identidade enviados pelo frontend são ignorados (cabeçalho, corpo e claims do token)', async () => {
    process.env.ALLOW_DEV_ACTOR_HEADER = 'true';
    try {
      // com o modo dev ligado, o token ainda prevalece sobre o cabeçalho
      const header = await http().get('/api/auth/me').set('Authorization', `Bearer ${token.managerA}`).set('x-actor-role', 'JGM4_ADMIN').expect(200);
      expect(header.body.role).toBe('CLIENT_MANAGER');
    } finally { process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; }
    await http().post(`/api/gates/${id.GA}/technical-opinion`).set('Authorization', `Bearer ${token.managerA}`).set('x-actor-role', 'JGM4_ADMIN').send({ technicalRecommendation: 'ADVANCE', technicalOpinion: 'x' }).expect(403);
    await api('post', `/api/approvals/${id.APA}/approve`, 'managerA', { role: 'JGM4_ADMIN' }).expect(400);
    const sid = (decode(token.managerA) as { sid: string }).sid;
    const forged = sign({ sub: id.managerA, sid, role: 'JGM4_ADMIN', companyId: null }, process.env.JWT_SECRET!, { issuer: 'jgm4-projects' });
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(200);
    expect(me.body.role).toBe('CLIENT_MANAGER'); // perfil vem do banco, não do token
    await http().post(`/api/approvals/${id.APB}/approve`).set('Authorization', `Bearer ${forged}`).send({}).expect(403);
  });
  it('14. cabeçalho de desenvolvimento só funciona quando habilitado explicitamente', async () => {
    process.env.ALLOW_DEV_ACTOR_HEADER = 'false';
    await http().get('/api/projects').set('x-actor-role', 'JGM4_ADMIN').expect(401);
    process.env.JGM4_LOCAL_ACTOR = 'JGM4';
    await http().get('/api/projects').expect(401);
    process.env.ALLOW_DEV_ACTOR_HEADER = 'true';
    try {
      await http().get('/api/projects').set('x-actor-role', 'JGM4_ADMIN').expect(200);
      const me = await http().get('/api/auth/me').set('x-actor-role', 'CLIENT_MANAGER').expect(200);
      expect(me.body).toMatchObject({ role: 'CLIENT_MANAGER', dev: true });
    } finally { process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; delete process.env.JGM4_LOCAL_ACTOR; }
  });
  it('15. em produção o cabeçalho de desenvolvimento é recusado mesmo com a flag ligada', async () => {
    process.env.ALLOW_DEV_ACTOR_HEADER = 'true'; process.env.NODE_ENV = 'production';
    try {
      const https = { 'X-Forwarded-Proto': 'https' }; // produção só responde por HTTPS (atrás do proxy)
      await http().get('/api/projects').set(https).set('x-actor-role', 'JGM4_ADMIN').expect(401);
      await http().get('/api/projects').set(https).expect(401);
      await http().get('/api/projects').set(https).set('Authorization', `Bearer ${token.admin}`).expect(200); // autenticação real continua funcionando
      await http().get('/api/projects').set('x-actor-role', 'JGM4_ADMIN').expect(308); // HTTP é redirecionado
    } finally { process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; process.env.NODE_ENV = saved.env ?? 'test'; }
  });
  it('16. a Central de Aprovações respeita vínculo, perfil e destinatário', async () => {
    const consultant = (await api('get', '/api/approvals', 'consIn').expect(200)).body;
    expect(consultant.length).toBeGreaterThan(0); expect(consultant.every((item: any) => item.projectId === id.PA)).toBe(true);
    const admin = (await api('get', '/api/approvals?scope=all', 'admin').expect(200)).body;
    expect(new Set(admin.map((item: any) => item.projectId))).toEqual(new Set([id.PA, id.PB]));
    const sponsor = (await api('get', '/api/approvals', 'sponsorA').expect(200)).body;
    expect(sponsor.map((item: any) => item.type)).toEqual(['GATE_CLIENT_DECISION']);
    expect((await api('get', '/api/approvals', 'managerB').expect(200)).body).toEqual([]);
    expect((await api('get', `/api/approvals/${id.APB}`, 'admin').expect(200)).body.projectId).toBe(id.PB);
    const summary = (await api('get', '/api/approvals/summary', 'consIn').expect(200)).body;
    expect(summary.total).toBe(consultant.length);
    await prisma.approval.update({ where: { id: id.APB }, data: { assignedToUserId: id.admin } });
    expect((await api('get', '/api/approvals?scope=all', 'admin').expect(200)).body.some((item: any) => item.id === id.APB)).toBe(true);
  });
  it('17. Gates respeitam a alçada: só o patrocinador vinculado decide; JGM4 emite parecer; CLIENT_USER não executa', async () => {
    const decide = (who: string) => api('post', `/api/gates/${id.G1A}/client-decision`, who, { clientDecision: 'APPROVE', comment: 'Avançar' });
    await decide('managerA').expect(403); await decide('userA').expect(403); await decide('consIn').expect(403); await decide('admin').expect(403); await decide('managerB').expect(403);
    await api('post', `/api/gates/${id.G1A}/technical-opinion`, 'sponsorA', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'x' }).expect(403);
    await decide('sponsorA').expect(201);
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: id.G1A } })).clientDecisionByUserId).toBe(id.sponsorA);
    const opinion = await api('post', `/api/gates/${id.GA}/technical-opinion`, 'consIn', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'Critérios atendidos.' }).expect(201);
    expect(opinion.body.status).toBe('TECHNICALLY_APPROVED');
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: id.GA } })).technicalApprovedByUserId).toBe(id.consIn);
    await api('post', `/api/tasks/${id.THA}/send-validation`, 'userA').expect(403); // CLIENT_USER não executa atividades
    await api('post', `/api/projects/${id.PA}/requests/${id.RAA}/start`, 'userA').expect(403);
  });
});
