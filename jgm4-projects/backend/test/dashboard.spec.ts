import 'reflect-metadata';
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureApproval } from '../src/approvals/approval-sync';
import { buildHealth, hourAlert } from '../src/dashboard/dashboard.calc';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 6 — dashboard executivo e acompanhamento operacional', () => {
  const schema = `jgm4_stage6_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, actor: process.env.JGM4_LOCAL_ACTOR };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!';
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const get = (path: string, who: string) => http().get(path).set('Authorization', `Bearer ${token[who]}`);
  const now = new Date(); const midnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = (offset: number) => new Date(midnight.getTime() + offset * 86400000);
  const dash = async (projectId: string, who = 'admin') => (await get(`/api/projects/${projectId}/dashboard`, who).expect(200)).body;

  async function buildProject(key: string, companyId: string, name: string) {
    const project = await prisma.project.create({ data: { companyId, name, description: 'Fixture do dashboard', status: 'IN_PROGRESS' } }); id[key] = project.id;
    const phases = [];
    for (const [order, status] of [[0, 'COMPLETED'], [1, 'IN_PROGRESS'], [2, 'LOCKED']] as const) {
      const phase = await prisma.phase.create({ data: { projectId: project.id, order, name: `Fase ${order}`, description: 'F', plannedWeeks: 3, plannedJgm4Hours: 20, status } });
      const gate = await prisma.gate.create({ data: { projectId: project.id, phaseId: phase.id, code: `GATE-${order}`, title: `Gate ${order}`, question: 'Pronto?', status: order === 0 ? 'APPROVED' : 'BLOCKED', currentOwnerType: 'SYSTEM', nextAction: order === 1 ? 'Concluir as atividades da fase.' : null } });
      phases.push({ phase, gate });
    }
    return phases;
  }
  const task = (key: string, projectId: string, phaseId: string, code: string, status: string, extra: Record<string, unknown> = {}) => prisma.task.create({ data: { projectId, phaseId, code, title: `Atividade ${code}`, objective: code, instructions: 'x', acceptanceCriteria: 'x',
    status: status as never, plannedJgm4Hours: 10, plannedClientHours: 4, currentOwnerType: 'CLIENT', ...extra } as never }).then((created) => { id[key] = created.id; return created; });
  const hours = (projectId: string, phaseId: string, taskId: string, org: 'JGM4' | 'CLIENT', value: number) => prisma.timeEntry.create({ data: { projectId, phaseId, taskId, organizationType: org, date: day(-1), hours: value, description: 'Fixture' } });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
      for (const folder of readdirSync(resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${folder}/migration.sql`), 'utf8');
        if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); }
        else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    process.env.ALLOW_DEV_ACTOR_HEADER = 'false'; delete process.env.JGM4_LOCAL_ACTOR;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);

    const companyA = (await prisma.company.create({ data: { name: 'Empresa A' } })).id; const companyB = (await prisma.company.create({ data: { name: 'Empresa B' } })).id;
    const passwordHash = await hash(PASSWORD, 4);
    const user = async (key: string, role: string, companyId: string | null) => { id[key] = (await prisma.user.create({ data: { name: `Usuário ${key}`, email: `${key}@teste.local`.toLowerCase(), passwordHash, role: role as never, companyId } })).id; };
    await user('admin', 'JGM4_ADMIN', null); await user('consIn', 'JGM4_CONSULTANT', null); await user('consOut', 'JGM4_CONSULTANT', null);
    await user('managerA', 'CLIENT_MANAGER', companyA); await user('sponsorA', 'CLIENT_SPONSOR', companyA); await user('managerB', 'CLIENT_MANAGER', companyB);

    // P1: cenário principal. 8 atividades válidas (3 concluídas) + 1 cancelada; horas e atrasos controlados.
    const [p0, p1, p2] = await buildProject('P1', companyA, 'Projeto Um');
    await task('a1', id.P1, p0.phase.id, 'A1', 'COMPLETED', { plannedClientHours: 5, currentOwnerType: 'NONE' }); await task('a2', id.P1, p0.phase.id, 'A2', 'COMPLETED', { plannedClientHours: 5, currentOwnerType: 'NONE' });
    await task('b1', id.P1, p1.phase.id, 'B1', 'COMPLETED', { currentOwnerType: 'NONE' });
    await task('b2', id.P1, p1.phase.id, 'B2', 'IN_PROGRESS', { nextActionDueDate: day(-1), nextAction: 'Executar B2.' });
    await task('b3', id.P1, p1.phase.id, 'B3', 'BLOCKED', { nextActionDueDate: day(-5), currentOwnerType: 'SYSTEM', actualStartDate: day(-10) });
    await task('b4', id.P1, p1.phase.id, 'B4', 'CANCELLED', { currentOwnerType: 'NONE', plannedJgm4Hours: 5 });
    await task('b5', id.P1, p1.phase.id, 'B5', 'WAITING_JGM4_VALIDATION', { nextActionDueDate: day(1), currentOwnerType: 'JGM4', nextAction: 'Validar evidências de B5.', plannedEndDate: day(20) });
    await task('c1', id.P1, p2.phase.id, 'C1', 'BLOCKED', { nextActionDueDate: day(-9), currentOwnerType: 'SYSTEM' });
    await task('c2', id.P1, p2.phase.id, 'C2', 'RELEASED', { nextActionDueDate: day(-7) }); // fase LOCKED: não gera atraso
    await hours(id.P1, p0.phase.id, id.a1, 'JGM4', 18); await hours(id.P1, p0.phase.id, id.a2, 'CLIENT', 6);
    await hours(id.P1, p1.phase.id, id.b1, 'JGM4', 20); await hours(id.P1, p1.phase.id, id.b2, 'JGM4', 13); await hours(id.P1, p1.phase.id, id.b2, 'CLIENT', 12);
    id.p1Phase1 = p1.phase.id; id.p1Gate1 = p1.gate.id; id.p1Phase2 = p2.phase.id;
    const request = async (key: string, code: string, status: string, dueDate: Date | null, extra: Record<string, unknown> = {}) => { id[key] = (await prisma.projectRequest.create({ data: { projectId: id.P1, phaseId: p1.phase.id, code, title: `Solicitação ${code}`, description: 'x', instructions: 'x', acceptanceCriteria: 'x', status: status as never, dueDate, mandatory: false, blocking: false, ...extra } as never })).id; };
    await request('r1', 'SOL-1', 'CLIENT_PREPARING', day(-3)); await request('r2', 'SOL-2', 'ACCEPTED', day(-30)); await request('r3', 'SOL-3', 'SENT_TO_JGM4', day(2), { mandatory: true, blocking: true });
    await request('r4', 'SOL-4', 'BLOCKED', day(-20)); // bloqueada: não gera atraso
    await prisma.gateCriterion.createMany({ data: [
      { gateId: p1.gate.id, code: 'G1-C01', description: 'Manual atendido', sourceType: 'MANUAL', satisfied: true, order: 1 }, { gateId: p1.gate.id, code: 'G1-C02', description: 'Manual pendente', sourceType: 'MANUAL', order: 2 },
      { gateId: p1.gate.id, code: 'G1-C03', description: 'Atividades concluídas', sourceType: 'TASK', order: 3 }, { gateId: p1.gate.id, code: 'G1-C04', description: 'Solicitações aceitas', sourceType: 'REQUEST', order: 4 },
    ] });
    await ensureApproval(prisma, { projectId: id.P1, type: 'TASK_VALIDATION', entityType: 'Task', entityId: id.b5, entityCode: 'B5', title: 'B5 — validação', description: 'x', assignedRole: 'JGM4_CONSULTANT' });
    await ensureApproval(prisma, { projectId: id.P1, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: id.b2, entityCode: 'B2', title: 'B2 — Alteração de prazo', description: 'x', assignedRole: 'JGM4_ADMIN', priority: 'HIGH', dueAt: day(3) });
    // histórico: 12 movimentações com horários distintos (somente 10 devem voltar, da mais recente para a mais antiga)
    for (let i = 0; i < 12; i++) await prisma.auditLog.create({ data: { projectId: id.P1, entityType: 'Task', entityId: id.b2, action: 'START', actorType: 'CLIENT_MANAGER', userId: id.managerA, createdAt: new Date(Date.now() - (i + 1) * 3600000), newValue: { n: i } } });
    await prisma.auditLog.create({ data: { projectId: id.P1, entityType: 'ProjectRequest', entityId: id.r2, action: 'ACCEPTED', actorType: 'JGM4_CONSULTANT', createdAt: new Date(Date.now() - 600000), newValue: {} } });

    // P2: saudável (sem atrasos, horas baixas). P3: outra empresa.
    const [q0, q1] = await buildProject('P2', companyA, 'Projeto Dois');
    await task('q1', id.P2, q1.phase.id, 'Q1', 'IN_PROGRESS', { nextActionDueDate: day(5) }); await hours(id.P2, q1.phase.id, id.q1, 'JGM4', 2); void q0;
    await buildProject('P3', companyB, 'Projeto Três');
    const member = (userKey: string, projectKey: string) => prisma.projectMembership.create({ data: { projectId: id[projectKey], userId: id[userKey], roleInProject: 'x' } });
    for (const [u, p] of [['consIn', 'P1'], ['consIn', 'P2'], ['consOut', 'P2'], ['managerA', 'P1'], ['managerA', 'P2'], ['sponsorA', 'P1'], ['managerB', 'P3']]) await member(u, p);
    for (const key of ['admin', 'consIn', 'consOut', 'managerA', 'sponsorA', 'managerB']) token[key] = (await http().post('/api/auth/login').send({ email: `${key}@teste.local`.toLowerCase(), password: PASSWORD }).expect(200)).body.accessToken;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['JGM4_LOCAL_ACTOR', saved.actor]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('1. progresso geral por atividade (3 de 8 = 38%) e por fase', async () => {
    const body = await dash(id.P1);
    expect(body.progress).toMatchObject({ percent: 38, completed: 3, total: 8 });
    expect(body.phases.map((phase: any) => [phase.order, phase.percent, phase.completed, phase.total])).toEqual([[0, 100, 2, 2], [1, 25, 1, 4], [2, 0, 0, 2]]);
    expect(body.currentPhase).toMatchObject({ order: 1, name: 'Fase 1' }); expect(body.project.status).toBe('IN_PROGRESS');
  });
  it('2. atividade cancelada não entra no denominador (nem no planejado de horas)', async () => {
    const body = await dash(id.P1);
    expect(body.tasks).toMatchObject({ total: 9, cancelled: 1 }); expect(body.progress).toMatchObject({ total: 8, cancelled: 1 });
    expect(body.phases[1].jgm4.planned).toBe(40);
  });
  it('3–5. horas JGM4 e CLIENT vêm de TimeEntry e o saldo bate', async () => {
    const body = await dash(id.P1);
    expect(body.hours.jgm4).toMatchObject({ planned: 80, actual: 51, remaining: 29, percent: 64 });
    expect(body.hours.client).toMatchObject({ planned: 34, actual: 18, remaining: 16, percent: 53 });
    expect(await prisma.timeEntry.aggregate({ where: { projectId: id.P1, organizationType: 'JGM4' }, _sum: { hours: true } }).then((r) => r._sum.hours?.toNumber())).toBe(51);
  });
  it('6. alerta de 80% (atenção) por fase, sem alerta em fases abaixo do limite', async () => {
    const body = await dash(id.P1);
    expect(body.phases[1].jgm4).toMatchObject({ actual: 33, planned: 40, percent: 83, alert: 'ATENCAO' });
    expect(body.phases[0].jgm4.alert).toBe('NORMAL'); expect(hourAlert(100, 79)).toBe('NORMAL'); expect(hourAlert(100, 80)).toBe('ATENCAO'); expect(hourAlert(100, 100)).toBe('ATENCAO');
  });
  it('8–10. bloqueadas e fases bloqueadas não atrasam; itens vencidos atrasam com dias e responsável', async () => {
    const { delays } = await dash(id.P1);
    expect(delays.items.map((item: any) => [item.code, item.daysLate, item.owner.type])).toEqual([['SOL-1', 3, 'CLIENT'], ['B2', 1, 'CLIENT']]);
    const codes = delays.items.map((item: any) => item.code);
    for (const excluded of ['B3', 'C1', 'C2', 'SOL-4', 'SOL-2']) expect(codes).not.toContain(excluded);
    expect(delays.count).toBe(2);
  });
  it('11. saúde NORMAL em projeto sem condições de atenção', async () => {
    const body = await dash(id.P2);
    expect(body.health).toEqual({ level: 'NORMAL', reasons: [] }); expect(body.delays.count).toBe(0);
  });
  it('12 e 14. saúde ATENÇÃO com motivos (horas da fase e itens atrasados)', async () => {
    const { health } = await dash(id.P1);
    expect(health.level).toBe('ATENCAO');
    expect(health.reasons).toEqual(expect.arrayContaining([expect.stringContaining('Fase 1: 83% das horas JGM4'), '2 itens atrasados.']));
  });
  it('13 e 7. saúde CRÍTICO: horas JGM4 > 100% e 3+ itens atrasados, com todos os motivos', async () => {
    await hours(id.P1, id.p1Phase1, id.b2, 'JGM4', 10); // Fase 1: 43 h de 40 h
    await prisma.projectRequest.create({ data: { projectId: id.P1, phaseId: id.p1Phase1, code: 'SOL-9', title: 'Atrasada', description: 'x', instructions: 'x', acceptanceCriteria: 'x', status: 'REQUESTED', dueDate: day(-8), mandatory: false, blocking: false } });
    const body = await dash(id.P1);
    expect(body.phases[1].jgm4).toMatchObject({ actual: 43, alert: 'EXCEDIDO' });
    expect(body.health.level).toBe('CRITICO');
    expect(body.health.reasons).toEqual(expect.arrayContaining(['Fase 1 excedeu as horas JGM4 (43 h de 40 h).', '3 itens atrasados.']));
    // projeto em espera também é crítico (e o motivo aparece)
    await prisma.project.update({ where: { id: id.P2 }, data: { status: 'ON_HOLD' } });
    expect((await dash(id.P2)).health).toEqual({ level: 'CRITICO', reasons: ['Projeto em espera.'] });
    await prisma.project.update({ where: { id: id.P2 }, data: { status: 'IN_PROGRESS' } });
    expect(buildHealth('IN_PROGRESS', [], { planned: 10, actual: 5, percent: 50, alert: 'NORMAL' }, 0, [{ phaseId: 'x', code: 'GATE-2', status: 'REJECTED' }], [{ id: 'x', order: 2 }]).reasons).toEqual(['Gate 2 rejeitado.']);
    expect(buildHealth('IN_PROGRESS', [], { planned: 10, actual: 5, percent: 50, alert: 'NORMAL' }, 0, [{ phaseId: 'x', code: 'GATE-2', status: 'CORRECTION_REQUIRED' }], [{ id: 'x', order: 2 }]).level).toBe('ATENCAO');
  });
  it('15. Gate atual é o da fase corrente, com critérios (automáticos recalculados) e percentual', async () => {
    const { gate } = await dash(id.P1);
    expect(gate).toMatchObject({ id: id.p1Gate1, code: 'GATE-1', title: 'Gate 1', status: 'BLOCKED', phaseOrder: 1, satisfied: 1, total: 4, percent: 25, nextAction: 'Concluir as atividades da fase.' });
  });
  it('16. próxima ação: lista priorizada pelo atraso, com responsável e texto da ação; pendências críticas separadas', async () => {
    const body = await dash(id.P1);
    expect(body.topAction).toMatchObject({ code: 'SOL-9', daysLate: 8 });
    expect(body.nextActions.length).toBeLessThanOrEqual(10);
    const byCode = Object.fromEntries(body.nextActions.map((item: any) => [item.code, item]));
    expect(byCode['SOL-1']).toMatchObject({ owner: { type: 'CLIENT', label: 'Empresa A' }, nextAction: 'Completar os requisitos e enviar a resposta à JGM4.', dueDate: day(-3).toISOString().slice(0, 10) });
    expect(byCode['B5']).toMatchObject({ owner: { type: 'JGM4' }, nextAction: 'Validar evidências de B5.' });
    expect(body.criticalPending.map((item: any) => item.code)).toEqual(expect.arrayContaining(['SOL-3', 'B2']));
    expect(body.criticalPending.every((item: any) => ['HIGH', 'CRITICAL'].includes(item.priority))).toBe(true);
    expect(body.approvals).toMatchObject({ pending: 2, high: 1 });
  });
  it('minha fila respeita o perfil (JGM4 x cliente) e o prazo/estado', async () => {
    const consultant = await get(`/api/projects/${id.P1}/dashboard`, 'consIn').expect(200);
    expect(consultant.body.myQueue.items.map((item: any) => item.code).sort()).toEqual(['B5', 'SOL-3']);
    const client = (await get(`/api/projects/${id.P1}/dashboard`, 'managerA').expect(200)).body;
    expect(client.myQueue.items.map((item: any) => item.code)).toEqual(expect.arrayContaining(['SOL-1', 'B2']));
    expect(client.myQueue.items.some((item: any) => item.owner.type === 'JGM4')).toBe(false);
  });
  it('17. o dashboard do projeto respeita vínculo e empresa (403 sem acesso, inexistente → 404 só para admin)', async () => {
    await get(`/api/projects/${id.P1}/dashboard`, 'managerB').expect(403);
    await get(`/api/projects/${id.P1}/dashboard`, 'consOut').expect(403);
    await get(`/api/projects/${id.P2}/dashboard`, 'consOut').expect(200);
    await get(`/api/projects/${id.P3}/dashboard`, 'managerA').expect(403);
    await http().get(`/api/projects/${id.P1}/dashboard`).expect(401);
    await get(`/api/projects/${randomUUID()}/dashboard`, 'managerA').expect(403);
    await get(`/api/projects/${randomUUID()}/dashboard`, 'admin').expect(404);
  });
  it('18. cliente não acessa o dashboard multi-projeto da JGM4', async () => {
    for (const who of ['managerA', 'sponsorA', 'managerB']) await get('/api/dashboard', who).expect(403);
    await http().get('/api/dashboard').expect(401);
  });
  it('19. JGM4_ADMIN vê todos os projetos; cards agregam os projetos autorizados', async () => {
    const { body } = await get('/api/dashboard', 'admin').expect(200);
    expect(body.projects.map((project: any) => project.name).sort()).toEqual(['Projeto Dois', 'Projeto Três', 'Projeto Um']);
    expect(body.projects[0].name).toBe('Projeto Um'); // crítico primeiro
    expect(body.cards).toMatchObject({ activeProjects: 3, critical: 1, attention: 0, approvalsPending: 2, jgm4Hours: 63, clientHours: 18, overdue: 3 });
    expect(body.projects[0]).toMatchObject({ company: { name: 'Empresa A' }, progress: 38, health: { level: 'CRITICO' }, currentPhase: { order: 1 }, nextAction: { code: 'SOL-9' } });
  });
  it('20. JGM4_CONSULTANT vê somente projetos com vínculo ativo', async () => {
    const consultant = (await get('/api/dashboard', 'consIn').expect(200)).body;
    expect(consultant.projects.map((project: any) => project.name).sort()).toEqual(['Projeto Dois', 'Projeto Um']);
    const outsider = (await get('/api/dashboard', 'consOut').expect(200)).body;
    expect(outsider.projects.map((project: any) => project.name)).toEqual(['Projeto Dois']);
    expect(outsider.cards.approvalsPending).toBe(0);
    await prisma.projectMembership.updateMany({ where: { userId: id.consOut }, data: { active: false } });
    expect((await get('/api/dashboard', 'consOut').expect(200)).body.projects).toEqual([]);
    await prisma.projectMembership.updateMany({ where: { userId: id.consOut }, data: { active: true } });
  });
  it('21. últimas movimentações vêm do AuditLog, da mais recente para a mais antiga, no máximo 10', async () => {
    const { recentActivity } = await dash(id.P1);
    expect(recentActivity).toHaveLength(10);
    const times = recentActivity.map((item: any) => new Date(item.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(recentActivity[0]).toMatchObject({ code: 'SOL-2', text: 'SOL-2 aceita por Consultor JGM4.' });
    expect(recentActivity[1].text).toBe('B2 iniciada por Usuário managerA.');
  });
  it('prazo e previsão: usa a data mais recente entre projeto e atividades', async () => {
    const { schedule } = await dash(id.P1);
    expect(schedule).toMatchObject({ plannedWeeks: 9, forecastEnd: day(20).toISOString().slice(0, 10), started: true });
    await prisma.task.update({ where: { id: id.b5 }, data: { plannedEndDate: day(35) } });
    expect((await dash(id.P1)).schedule.forecastEnd).toBe(day(35).toISOString().slice(0, 10));
  });
  it('resumos de solicitações e atividades', async () => {
    const body = await dash(id.P1);
    expect(body.requests).toMatchObject({ waitingClient: 2, waitingJgm4: 1, accepted: 1, blocked: 1, overdue: 2 });
    expect(body.tasks).toMatchObject({ completed: 3, inProgress: 1, waitingJgm4: 1, blocked: 2, released: 1 });
  });
});
