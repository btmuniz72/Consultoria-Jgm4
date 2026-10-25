import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { planCCriteria, planCTasks } from '../src/plans/plano-c.data';
import { planCRequests } from '../src/requests/plan-c-requests';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

// Etapa 10A — administração operacional SEM seed: o banco do teste começa vazio (só usuários mínimos para autenticar).
describe('Etapa 10A — administração de empresas, usuários, projetos e vínculos', () => {
  const schema = `jgm4_stage10a_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, actor: process.env.JGM4_LOCAL_ACTOR };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!';
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch', path: string, who: string, body?: object) => {
    const r = http()[method](path).set('Authorization', `Bearer ${token[who]}`); return body ? r.send(body) : method === 'get' ? r : r.send({});
  };
  const loginStatus = async (email: string, password = PASSWORD) => (await http().post('/api/auth/login').send({ email, password })).status;
  const login = async (email: string) => (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken as string;

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
    const passwordHash = await hash(PASSWORD, 4);
    for (const [key, role] of [['admin', 'JGM4_ADMIN'], ['admin2', 'JGM4_ADMIN'], ['cons', 'JGM4_CONSULTANT'], ['cons2', 'JGM4_CONSULTANT']] as const)
      id[key] = (await prisma.user.create({ data: { name: `Usuário ${key}`, email: `${key}@teste.local`, passwordHash, role } })).id;
    for (const key of ['admin', 'admin2', 'cons', 'cons2']) token[key] = await login(`${key}@teste.local`);
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['JGM4_LOCAL_ACTOR', saved.actor]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('21. o fluxo funciona sem seed: nenhum projeto/empresa pré-existente', async () => {
    expect(await prisma.project.count()).toBe(0); expect(await prisma.company.count()).toBe(0);
  });

  it('1 e 2. admin cria empresa; consultor e cliente não criam (403) e a listagem filtra por nome/status', async () => {
    const created = await call('post', '/api/admin/companies', 'admin', { name: 'Ollem do Brasil', displayName: 'Ollem', internalCode: 'OLLEM', notes: 'Cliente piloto' }).expect(201);
    id.ollem = created.body.id; expect(created.body).toMatchObject({ name: 'Ollem do Brasil', status: 'ACTIVE', internalCode: 'OLLEM' });
    id.clienteB = (await call('post', '/api/admin/companies', 'admin', { name: 'Cliente B' }).expect(201)).body.id;
    await call('post', '/api/admin/companies', 'cons', { name: 'Invasora' }).expect(403);
    await call('get', '/api/admin/companies', 'cons').expect(403);
    await call('post', '/api/admin/companies', 'admin', { name: 'ollem do brasil' }).expect(409); // duplicada (sem diferenciar maiúsculas)
    expect((await call('get', '/api/admin/companies?q=olle', 'admin').expect(200)).body.map((c: { name: string }) => c.name)).toEqual(['Ollem do Brasil']);
    expect((await call('get', '/api/admin/companies?status=INACTIVE', 'admin').expect(200)).body).toHaveLength(0);
    await call('patch', `/api/admin/companies/${id.ollem}`, 'admin', { notes: 'Cliente piloto do Plano C' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'COMPANY_CREATED', projectId: null } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'COMPANY_UPDATED', entityId: id.ollem } })).toBe(1);
  });

  it('3, 4 e 5. admin cria usuário por convite (sem senha visível); e-mail duplicado e perfil JGM4 para cliente são rejeitados', async () => {
    const body = { name: 'Patrocinador Ollem', email: 'sponsor@ollem.teste', role: 'CLIENT_SPONSOR', companyId: id.ollem };
    const created = await call('post', '/api/admin/users', 'admin', body).expect(201);
    id.sponsor = created.body.id; expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|"password"|"senha"/i); expect(created.body.devLink).toContain('/reset-password?token=');
    expect(await prisma.auditLog.count({ where: { action: 'USER_CREATED', entityId: id.sponsor, projectId: null } })).toBe(1);
    expect(await prisma.securityEvent.count({ where: { type: 'USER_CREATED' } })).toBeGreaterThanOrEqual(1);
    await call('post', '/api/admin/users', 'admin', { ...body, email: 'SPONSOR@ollem.teste' }).expect(409);
    await call('post', '/api/admin/users', 'admin', { name: 'Falso Admin', email: 'falso@ollem.teste', role: 'JGM4_ADMIN', companyId: id.ollem }).expect(400);
    await call('post', '/api/admin/users', 'admin', { name: 'Sem Empresa', email: 'semempresa@ollem.teste', role: 'CLIENT_USER' }).expect(400);
    await call('post', '/api/admin/users', 'cons', body).expect(403);
    // O usuário define a própria senha pelo link de uso único e consegue entrar.
    const link = new URL(created.body.devLink); await http().post('/api/auth/reset').send({ token: link.searchParams.get('token'), password: PASSWORD }).expect(200);
    expect(await loginStatus('sponsor@ollem.teste')).toBe(200);
    for (const [key, role] of [['manager', 'CLIENT_MANAGER'], ['userB', 'CLIENT_USER']] as const) {
      const company = key === 'userB' ? id.clienteB : id.ollem;
      const row = await call('post', '/api/admin/users', 'admin', { name: `Usuário ${key}`, email: `${key}@ollem.teste`, role, companyId: company }).expect(201); id[key] = row.body.id;
      await prisma.user.update({ where: { id: id[key] }, data: { passwordHash: await hash(PASSWORD, 4), mustChangePassword: false } });
    }
    const filtered = await call('get', '/api/admin/users?role=CLIENT_MANAGER&q=manager', 'admin').expect(200); expect(filtered.body).toHaveLength(1);
    await call('patch', `/api/admin/users/${id.manager}`, 'admin', { name: 'Gestor Ollem' }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: id.manager } })).name).toBe('Gestor Ollem');
  });

  it('6 e 7. admin cria projeto (sem estrutura); exige empresa existente e ativa, nome/código únicos e datas coerentes', async () => {
    await call('post', '/api/admin/projects', 'admin', { name: 'Sem empresa', description: 'Descrição' }).expect(400);
    await call('post', '/api/admin/projects', 'admin', { companyId: randomUUID(), name: 'Empresa inexistente', description: 'Descrição' }).expect(400);
    await call('post', '/api/admin/projects', 'cons', { companyId: id.ollem, name: 'Invasor', description: 'Descrição' }).expect(403);
    await call('post', '/api/admin/projects', 'admin', { companyId: id.ollem, name: 'Datas ruins', description: 'Descrição', plannedStartDate: '2026-12-01', plannedEndDate: '2026-11-01' }).expect(400);
    const created = await call('post', '/api/admin/projects', 'admin', { companyId: id.ollem, name: 'Projeto básico', code: 'olm-001', description: 'Projeto sem estrutura', plannedStartDate: '2026-11-01', plannedEndDate: '2027-02-01' }).expect(201);
    id.basic = created.body.id; expect(created.body).toMatchObject({ code: 'OLM-001', status: 'PLANNING', hasStructure: false, company: 'Ollem do Brasil' });
    await call('post', '/api/admin/projects', 'admin', { companyId: id.ollem, name: 'Projeto básico', description: 'Duplicado' }).expect(409);
    await call('post', '/api/admin/projects', 'admin', { companyId: id.clienteB, name: 'Outro', code: 'OLM-001', description: 'Código repetido' }).expect(409);
    expect(await prisma.auditLog.count({ where: { action: 'PROJECT_CREATED', projectId: id.basic } })).toBe(1);
    await call('patch', `/api/admin/projects/${id.basic}`, 'admin', { description: 'Descrição administrativa atualizada' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'PROJECT_UPDATED', projectId: id.basic } })).toBe(1);
    const activated = await call('post', `/api/admin/projects/${id.basic}/activate`, 'admin', { reason: 'Início acordado com o cliente' }).expect(200); expect(activated.body.status).toBe('IN_PROGRESS');
    await call('post', `/api/admin/projects/${id.basic}/activate`, 'admin', { reason: 'Repetido' }).expect(409);
  });

  it('8, 9, 10, 11 e 12. clonar o Plano C cria 5 fases, 5 Gates com critérios e as atividades/solicitações, sem copiar dados de execução', async () => {
    // Dados de execução em OUTRO projeto nunca podem aparecer no clone.
    const donor = await call('post', '/api/admin/projects', 'admin', { companyId: id.clienteB, name: 'Projeto doador', description: 'Com execução', usePlanC: true }).expect(201); id.donor = donor.body.id;
    const donorTask = await prisma.task.findFirstOrThrow({ where: { projectId: id.donor, code: 'C00' } });
    await prisma.timeEntry.create({ data: { projectId: id.donor, phaseId: donorTask.phaseId, taskId: donorTask.id, organizationType: 'JGM4', date: new Date(), hours: 3, description: 'Horas reais' } });
    await prisma.taskEvidence.create({ data: { projectId: id.donor, phaseId: donorTask.phaseId, taskId: donorTask.id, description: 'Evidência real' } });
    const created = await call('post', '/api/admin/projects', 'admin', { companyId: id.ollem, name: 'Plano C', code: 'OLM-PLANOC', description: 'Plano C da Ollem', usePlanC: true }).expect(201); id.planc = created.body.id;
    expect(await prisma.phase.count({ where: { projectId: id.planc } })).toBe(5);
    const gates = await prisma.gate.findMany({ where: { projectId: id.planc }, include: { criteria: true }, orderBy: { code: 'asc' } });
    expect(gates.map((g) => g.code)).toEqual(['GATE-0', 'GATE-1', 'GATE-2', 'GATE-3', 'GATE-4']); gates.forEach((gate, index) => expect(gate.criteria).toHaveLength(planCCriteria[index].length));
    expect(await prisma.task.count({ where: { projectId: id.planc } })).toBe(planCTasks.length);
    expect(await prisma.projectRequest.count({ where: { projectId: id.planc } })).toBe(planCRequests.length);
    const c01 = await prisma.task.findFirstOrThrow({ where: { projectId: id.planc, code: 'C01' }, include: { predecessor: true } }); expect(c01.predecessor?.code).toBe('C00');
    const phase0 = await prisma.phase.findFirstOrThrow({ where: { projectId: id.planc, order: 0 } }); expect(phase0.status).toBe('AVAILABLE');
    expect(await prisma.timeEntry.count({ where: { projectId: id.planc } })).toBe(0); expect(await prisma.taskEvidence.count({ where: { projectId: id.planc } })).toBe(0);
    expect(await prisma.approval.count({ where: { projectId: id.planc } })).toBe(0); expect(await prisma.projectMembership.count({ where: { projectId: id.planc } })).toBe(0);
    expect(await prisma.task.count({ where: { projectId: id.planc, status: { in: ['COMPLETED', 'IN_PROGRESS'] } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { projectId: id.planc, action: 'PROJECT_CREATED_FROM_TEMPLATE' } })).toBe(1);
    // Projeto que já tem estrutura não é clonado de novo; o projeto básico pode receber a estrutura pela ação específica.
    await call('post', `/api/admin/projects/${id.planc}/clone-plan-c`, 'admin').expect(409);
    const cloned = await call('post', `/api/admin/projects/${id.basic}/clone-plan-c`, 'admin').expect(200); expect(cloned.body).toMatchObject({ phases: 5, gates: 5, tasks: planCTasks.length });
    await call('post', `/api/admin/projects/${id.basic}/clone-plan-c`, 'cons').expect(403);
    const list = await call('get', `/api/admin/projects?companyId=${id.ollem}`, 'admin').expect(200);
    expect(list.body.find((p: { id: string }) => p.id === id.planc)).toMatchObject({ hasStructure: true, currentPhase: 'Fase 0 — Organizar a base', progress: 0 });
  }, 90000);

  it('13 e 14. cliente só entra em projetos da própria empresa; consultor atua em vários; responsabilidades únicas', async () => {
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.userB, roleInProject: 'TEAM_MEMBER' }).expect(403); // usuário do Cliente B no projeto da Ollem
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.sponsor, roleInProject: 'CONSULTANT_LEAD' }).expect(400); // cliente como consultor principal
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.cons, roleInProject: 'CLIENT_SPONSOR' }).expect(400);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.cons, roleInProject: 'INVALIDO' }).expect(400);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'cons', { userId: id.cons, roleInProject: 'TEAM_MEMBER' }).expect(403);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.cons, roleInProject: 'CONSULTANT_LEAD' }).expect(201);
    await call('post', `/api/admin/projects/${id.basic}/members`, 'admin', { userId: id.cons, roleInProject: 'CONSULTANT_LEAD' }).expect(201); // mesmo consultor em outro projeto
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.sponsor, roleInProject: 'CLIENT_SPONSOR' }).expect(201);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.manager, roleInProject: 'CLIENT_MANAGER' }).expect(201);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.manager, roleInProject: 'CLIENT_MANAGER' }).expect(201); // idempotente (reaplica)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: id.planc } })).sponsorUserId).toBe(id.sponsor);
    // trocar o consultor principal rebaixa o anterior e audita
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.cons2, roleInProject: 'CONSULTANT_LEAD' }).expect(201);
    const roles = Object.fromEntries((await call('get', `/api/admin/projects/${id.planc}/members`, 'admin').expect(200)).body.map((m: { userId: string; roleInProject: string }) => [m.userId, m.roleInProject]));
    expect(roles[id.cons2]).toBe('CONSULTANT_LEAD'); expect(roles[id.cons]).toBe('TEAM_MEMBER');
    expect(await prisma.auditLog.count({ where: { projectId: id.planc, action: 'RESPONSIBLE_CHANGED' } })).toBeGreaterThanOrEqual(1);
    const row = (await call('get', `/api/admin/projects?consultantId=${id.cons}`, 'admin').expect(200)).body; expect(row.map((p: { id: string }) => p.id)).toEqual([id.basic]);
    // quem foi vinculado enxerga o projeto; quem não foi, não
    token.sponsor = await login('sponsor@ollem.teste'); token.manager = await login('manager@ollem.teste'); token.userB = await login('userB@ollem.teste');
    await call('get', `/api/projects/${id.planc}`, 'sponsor').expect(200); await call('get', `/api/projects/${id.planc}`, 'userB').expect(403);
    const full = (await call('get', '/api/admin/projects', 'admin').expect(200)).body.find((p: { id: string }) => p.id === id.planc);
    expect(full).toMatchObject({ consultant: 'Usuário cons2', sponsor: 'Patrocinador Ollem', manager: 'Gestor Ollem', activeUsers: 4 });
  }, 60000);

  it('18 e 20. remover vínculo exige senha, é auditado (AuditLog) e gera SecurityEvent', async () => {
    const membership = await prisma.projectMembership.findFirstOrThrow({ where: { projectId: id.planc, userId: id.manager } });
    await call('patch', `/api/admin/projects/${id.planc}/members/${membership.id}`, 'admin', { active: false }).expect(403);
    await call('patch', `/api/admin/projects/${id.planc}/members/${membership.id}`, 'admin', { active: false, confirmPassword: PASSWORD }).expect(200);
    expect(await prisma.auditLog.count({ where: { projectId: id.planc, entityId: membership.id, action: 'MEMBERSHIP_REMOVED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { projectId: id.planc, action: 'MEMBERSHIP_ADDED' } })).toBeGreaterThanOrEqual(4);
    expect(await prisma.securityEvent.count({ where: { type: 'MEMBERSHIP_CHANGED', projectId: id.planc } })).toBeGreaterThanOrEqual(5);
    await call('get', `/api/projects/${id.planc}`, 'manager').expect(403); // sem vínculo → sem acesso
  });

  it('19, 20, 15 e 16. alteração de perfil e de status é confirmada, auditada e protegida contra auto-bloqueio', async () => {
    await call('patch', `/api/admin/users/${id.userB}/status`, 'admin', { status: 'INACTIVE', reason: 'Desligamento' }).expect(400); // sem senha (validação do DTO)
    await call('post', `/api/admin/users/${id.cons2}/anonymize`, 'admin', { reason: 'x', confirmPassword: PASSWORD }).expect(400); // reason curta (validação)
    await call('patch', `/api/admin/users/${id.cons2}/role`, 'admin', { role: 'JGM4_ADMIN', reason: 'Promoção administrativa', confirmPassword: PASSWORD }).expect(200);
    const roleLog = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_ROLE_CHANGED', entityId: id.cons2 } });
    expect(roleLog.oldValue).toMatchObject({ role: 'JGM4_CONSULTANT' }); expect(roleLog.newValue).toMatchObject({ role: 'JGM4_ADMIN' }); expect(roleLog.userId).toBe(id.admin); expect(roleLog.projectId).toBeNull();
    expect(await prisma.securityEvent.count({ where: { type: 'USER_ROLE_CHANGED' } })).toBe(1);
    await call('patch', `/api/admin/users/${id.cons2}/role`, 'admin', { role: 'JGM4_CONSULTANT', reason: 'Reverter', confirmPassword: PASSWORD }).expect(200);
    await call('patch', `/api/admin/users/${id.userB}/role`, 'admin', { role: 'JGM4_ADMIN', reason: 'Tentativa', confirmPassword: PASSWORD }).expect(400); // cliente não vira JGM4
    // auto-bloqueio / último administrador
    await call('patch', `/api/admin/users/${id.admin}/status`, 'admin', { status: 'INACTIVE', reason: 'Auto bloqueio', confirmPassword: PASSWORD }).expect(400);
    await call('patch', `/api/admin/users/${id.admin}/role`, 'admin', { role: 'JGM4_CONSULTANT', reason: 'Auto rebaixamento', confirmPassword: PASSWORD }).expect(400);
    await call('patch', `/api/admin/users/${id.admin2}/status`, 'admin', { status: 'INACTIVE', reason: 'Saída do administrador', confirmPassword: PASSWORD }).expect(200);
    expect(await prisma.user.count({ where: { role: 'JGM4_ADMIN', status: 'ACTIVE' } })).toBeGreaterThanOrEqual(1);
    await call('get', '/api/admin/users', 'admin2').expect(401); // sessão do administrador inativado foi revogada
    expect(await loginStatus('admin2@teste.local')).toBe(401);
    // usuário bloqueado/inativo não autentica, com motivo visível só para o administrador
    await call('patch', `/api/admin/users/${id.userB}/status`, 'admin', { status: 'BLOCKED', reason: 'Acesso indevido suspeito', confirmPassword: PASSWORD }).expect(200);
    expect(await loginStatus('userB@ollem.teste')).toBe(401);
    const login = await http().post('/api/auth/login').send({ email: 'userB@ollem.teste', password: PASSWORD }); expect(JSON.stringify(login.body)).not.toContain('indevido');
    const row = (await call('get', '/api/admin/users?status=BLOCKED', 'admin').expect(200)).body[0]; expect(row.statusReason).toBe('Acesso indevido suspeito');
    expect(await prisma.auditLog.count({ where: { action: 'USER_BLOCKED', entityId: id.userB } })).toBe(1); expect(await prisma.auditLog.count({ where: { action: 'USER_DISABLED', entityId: id.admin2 } })).toBe(1);
    await call('patch', `/api/admin/users/${id.userB}/status`, 'admin', { status: 'ACTIVE', reason: 'Revisado e liberado', confirmPassword: PASSWORD }).expect(200);
    expect(await loginStatus('userB@ollem.teste')).toBe(200);
    // reset administrativo de acesso (link de uso único; auditado)
    const reset = await call('post', `/api/admin/users/${id.userB}/reset-access`, 'admin').expect(200); expect(reset.body.devLink).toContain('reset-password');
    expect(await prisma.auditLog.count({ where: { action: 'USER_ACCESS_RESET', entityId: id.userB } })).toBe(1); expect(await prisma.securityEvent.count({ where: { type: 'ADMIN_ACCESS_RESET' } })).toBe(1);
  }, 60000);

  it('17. empresa inativa: usuários cliente não autenticam, não recebe projetos, e o histórico fica consultável pelo admin', async () => {
    expect(await loginStatus('sponsor@ollem.teste')).toBe(200);
    await call('patch', `/api/admin/companies/${id.ollem}/status`, 'admin', { status: 'INACTIVE', reason: 'Contrato encerrado' }).expect(400); // exige senha
    await call('patch', `/api/admin/companies/${id.ollem}/status`, 'admin', { status: 'INACTIVE', reason: 'Contrato encerrado', confirmPassword: PASSWORD }).expect(200);
    expect(await loginStatus('sponsor@ollem.teste')).toBe(401);
    await call('get', `/api/projects/${id.planc}`, 'sponsor').expect(401); // sessão anterior revogada
    await call('post', '/api/admin/projects', 'admin', { companyId: id.ollem, name: 'Novo após inativar', description: 'Não deve criar' }).expect(409);
    await call('post', `/api/admin/projects/${id.planc}/members`, 'admin', { userId: id.sponsor, roleInProject: 'TEAM_MEMBER' }).expect(409);
    const list = (await call('get', `/api/admin/projects?companyId=${id.ollem}`, 'admin').expect(200)).body; expect(list.length).toBeGreaterThanOrEqual(2); expect(list[0].companyActive).toBe(false);
    expect(await prisma.project.count({ where: { companyId: id.ollem } })).toBe(list.length); // nada foi apagado
    expect(await prisma.auditLog.count({ where: { action: 'COMPANY_DEACTIVATED', entityId: id.ollem } })).toBe(1); expect(await prisma.securityEvent.count({ where: { type: 'COMPANY_STATUS_CHANGED' } })).toBe(1);
    await call('patch', `/api/admin/companies/${id.ollem}/status`, 'admin', { status: 'ACTIVE', reason: 'Contrato renovado', confirmPassword: PASSWORD }).expect(200);
    expect(await loginStatus('sponsor@ollem.teste')).toBe(200);
  }, 60000);

  it('28. todas as rotas /api/admin/* exigem JGM4_ADMIN no backend (consultor e cliente recebem 403; sem token, 401)', async () => {
    token.sponsor = await login('sponsor@ollem.teste');
    const paths = ['/api/admin/companies', '/api/admin/users', '/api/admin/projects', `/api/admin/projects/${id.planc}/members`, '/api/admin/access-review', '/api/admin/security-events', '/api/admin/incidents'];
    for (const path of paths) { await http().get(path).expect(401); await call('get', path, 'cons').expect(403); await call('get', path, 'sponsor').expect(403); await call('get', path, 'admin').expect(200); }
  });
});
