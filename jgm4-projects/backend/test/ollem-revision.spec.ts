import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { reviseOllem } from '../src/commercial/revise-ollem';
import { commercialAmounts } from '../src/commercial/ollem-plan';
import { planCPhases, planCTasks } from '../src/plans/plano-c.data';
import { ReportsData } from '../src/reports/reports-data';
config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Revisão Ollem — proposta, início, dependências e Gates com PostgreSQL real', () => {
  const originalUrl = process.env.DATABASE_URL!; const schema = `ollem_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: originalUrl }); const password = 'Teste-Ollem-2026!';
  const previousDev = process.env.ALLOW_DEV_ACTOR_HEADER;
  let app: INestApplication; let prisma: PrismaService; let projectId: string; let companyId: string; let proposalId: string;
  const token: Record<string, string> = {}; const users: Record<string, string> = {}; let phaseIds: string[]; const oldTasks: Record<string, string> = {};
  const call = (method: 'get' | 'post' | 'patch', suffix: string, who = 'admin', body?: object) => { const r = request(app.getHttpServer())[method](/^(tasks\/[^/]+\/start|gates\/[^/]+\/client-decision)$/.test(suffix) ? `/api/${suffix}` : `/api/projects/${projectId}/${suffix}`).set('Authorization', `Bearer ${token[who]}`); return method === 'get' ? r : r.send(body ?? {}); };
  const phaseConfig = { homeOfficeHours: 10, inCompanyHours: 0, entryPercent: 50, paymentCondition: 'Entrada antes da fase', blocking: false, conditionMet: false };
  const accept = async (p: any) => call('post', `proposals/${p.id}/accept`, 'sponsor', { version: p.version, contentHash: p.contentHash, acknowledgements: [true, true, true, true, true] }).expect(201);
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
      for (const dir of readdirSync(resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()) {
        const sql = readFileSync(resolve(__dirname, '../prisma/migrations', dir, 'migration.sql'), 'utf8');
        if (dir === '20261023000200_gates') { const i = sql.indexOf('-- The first phase remains'); await client.query(sql.slice(0, i)); await client.query(sql.slice(i)); } else await client.query(sql);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString(); process.env.ALLOW_DEV_ACTOR_HEADER = 'false';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    companyId = (await prisma.company.create({ data: { name: 'Ollem teste isolado' } })).id;
    projectId = (await prisma.project.create({ data: { companyId, name: 'Implantação assistida', description: 'Teste com histórico preservado' } })).id;
    for (const [order, spec] of planCPhases.entries()) {
      const phase = await prisma.phase.create({ data: { projectId, order, name: spec.name, description: spec.description, plannedWeeks: spec.weeks, plannedJgm4Hours: spec.hours, status: order === 0 ? 'AVAILABLE' : 'LOCKED' } });
      await prisma.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: spec.title, question: spec.question, criteria: { create: { code: 'LEGACY', description: 'Critério e evidência legados', satisfied: true, evidenceReference: 'Documento original' } } } });
    }
    const originalPhases = await prisma.phase.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
    for (const t of planCTasks) oldTasks[t.code] = (await prisma.task.create({ data: { projectId, phaseId: originalPhases[t.phase].id, code: t.code, title: t.title, objective: t.title, instructions: 'Original', acceptanceCriteria: 'Original', plannedJgm4Hours: t.jgm4, status: t.code === 'C00' ? 'RELEASED' : 'BLOCKED' } })).id;
    await prisma.timeEntry.create({ data: { projectId, phaseId: originalPhases[0].id, taskId: oldTasks.C01, organizationType: 'JGM4', date: new Date(), hours: 2, description: 'Apontamento anterior à revisão' } });
    await prisma.taskEvidence.create({ data: { projectId, phaseId: originalPhases[0].id, taskId: oldTasks.C01, description: 'Evidência anterior à revisão' } });
    await prisma.projectRequest.create({ data: { projectId, phaseId: originalPhases[0].id, taskId: oldTasks.C01, code: 'HIST', title: 'Planta', description: 'Original', instructions: 'Original', acceptanceCriteria: 'Original' } });
    for (const [key, role] of [['admin', 'JGM4_ADMIN'], ['sponsor', 'CLIENT_SPONSOR'], ['manager', 'CLIENT_MANAGER'], ['consultant', 'JGM4_CONSULTANT'], ['outsider', 'CLIENT_SPONSOR']] as const) {
      const user = await prisma.user.create({ data: { name: key, email: `${key}@ollem.test`, passwordHash: await hash(password, 4), role, companyId: role.startsWith('CLIENT') ? companyId : null } }); users[key] = user.id;
      if (key !== 'outsider') await prisma.projectMembership.create({ data: { projectId, userId: user.id } });
      token[key] = (await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password }).expect(200)).body.accessToken;
    }
    await reviseOllem(prisma, projectId);
    phaseIds = (await prisma.phase.findMany({ where: { projectId, archived: false }, orderBy: { order: 'asc' } })).map(p => p.id);
  }, 180000);
  afterAll(async () => { if (app) await app.close(); process.env.DATABASE_URL = originalUrl; process.env.ALLOW_DEV_ACTOR_HEADER = previousDev; await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); });

  it('1–5. preparação gratuita, meses corretos e treinamento somente em janeiro', async () => {
    const { body } = await call('get', 'proposal').expect(200); const phases = body.preview.phases;
    expect(phases).toHaveLength(4); expect(phases[0]).toMatchObject({ total: 0, homeOfficeHours: 0, inCompanyHours: 0 });
    expect(phases[1].period).toBe('Novembro e dezembro de 2026'); expect(phases[2].period).toBe('Janeiro de 2027');
    expect(phases[1].tasks.some((t: any) => t.code === 'C14')).toBe(false); expect(phases[2].tasks.find((t: any) => t.code === 'C14').title).toContain('janeiro');
    expect(phases[1].tasks.some((t: any) => t.code === 'OL-COMPRAS')).toBe(true); expect(phases[2].tasks.some((t: any) => t.code === 'OL-PICK')).toBe(true);
    expect(body.preview.total).toBeNull();
    await call('patch', `commercial/phases/${phaseIds[0]}`, 'admin', phaseConfig).expect(400);
  });
  it('preserva identidades, evidências, solicitações, apontamentos e critérios anteriores; revisão é idempotente', async () => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: oldTasks.C01 }, include: { timeEntries: true, evidence: true, requests: true } });
    expect(task.phaseId).toBe(phaseIds[1]); expect(task.timeEntries[0].hours.toNumber()).toBe(2); expect(task.timeEntries[0].phaseId).toBe(phaseIds[1]); expect(task.evidence[0].description).toContain('anterior'); expect(task.requests[0].code).toBe('HIST');
    expect(await prisma.gateCriterion.count({ where: { gate: { projectId }, code: 'LEGACY', archived: true } })).toBe(4);
    const count = await prisma.auditLog.count({ where: { projectId } }); expect(await reviseOllem(prisma, projectId)).toEqual({ revised: false }); expect(await prisma.auditLog.count({ where: { projectId } })).toBe(count);
  });
  it('12–14. tarifas corretas, preparação e horas cliente não geram valor; horas pendentes não viram zero contratado', () => {
    expect(commercialAmounts(0, 80, 20).total).toBe(0); expect(commercialAmounts(1, 1, 0).total).toBe(120); expect(commercialAmounts(2, 0, 1).total).toBe(220);
    expect(commercialAmounts(1, 20, 10, 100, 'CLIENT').total).toBe(0); expect(commercialAmounts(1, null, null).total).toBeNull();
  });
  it('protege tenant, perfil, valores e assinatura; rascunho incompleto não pode ser enviado', async () => {
    await call('get', 'proposal', 'outsider').expect(403);
    await call('patch', `commercial/phases/${phaseIds[1]}`, 'manager', phaseConfig).expect(403);
    await call('patch', `commercial/phases/${phaseIds[1]}`, 'admin', { ...phaseConfig, homeOfficeHours: -1 }).expect(400);
    const draft = (await call('post', 'proposals', 'admin', {}).expect(201)).body;
    await call('post', `proposals/${draft.id}/send`).expect(409);
    await call('post', `proposals/${draft.id}/accept`, 'manager', {}).expect(403);
  });
  it('6–7. dependência externa coexiste com projeto ativo e só bloqueia atividade vinculada', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: 'IN_PROGRESS', startExceptionReason: 'Autorização de teste', startExceptionByUserId: users.admin, startExceptionAt: new Date() } });
    await prisma.phase.update({ where: { id: phaseIds[1] }, data: { status: 'AVAILABLE' } });
    const gate = await prisma.gate.findFirstOrThrow({ where: { projectId, phaseId: phaseIds[0] } }); await prisma.gate.update({ where: { id: gate.id }, data: { status: 'APPROVED' } });
    await prisma.task.updateMany({ where: { id: { in: [oldTasks.C10, oldTasks.C12] } }, data: { status: 'RELEASED' } });
    const dep = (await call('post', 'external-dependencies', 'admin', { description: 'Compra de estantes — 45 dias', responsible: 'Ollem', impact: 'Só a instalação depende', dueDate: '2099-01-01', status: 'WAITING_EXTERNAL', blocksProject: false, blocksTask: true, taskId: oldTasks.C10, stage: 'Prazo fornecedor' }).expect(201)).body;
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe('IN_PROGRESS');
    await call('post', `tasks/${oldTasks.C10}/start`, 'manager').expect(409);
    await call('post', `tasks/${oldTasks.C12}/start`, 'manager').expect(201);
    const dashboard = (await call('get', 'dashboard').expect(200)).body; expect(dashboard.externalDependencies[0].id).toBe(dep.id);
    expect(dashboard.health.reasons.some((r: string) => r.includes('estantes'))).toBe(false);
    await prisma.project.update({ where: { id: projectId }, data: { status: 'PLANNING', startExceptionAt: null, startExceptionByUserId: null, startExceptionReason: null } });
  });
  it('não permite movimentação estrutural sem aceite autenticado e auditado', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { startExceptionAt: new Date(), startExceptionByUserId: users.admin, startExceptionReason: 'Autorização de teste' } });
    await prisma.task.update({ where: { id: oldTasks.C04 }, data: { status: 'RELEASED' } });
    await call('post', `tasks/${oldTasks.C04}/start`, 'manager').expect(409);
    await call('post', `tasks/${oldTasks.C04}/movement-acceptance`, 'consultant', { text: 'Layout aprovado para movimentação.' }).expect(403);
    await call('post', `tasks/${oldTasks.C04}/movement-acceptance`, 'sponsor', { text: 'Layout aprovado para movimentação.' }).expect(201);
    await call('post', `tasks/${oldTasks.C04}/start`, 'manager').expect(201);
    expect(await prisma.auditLog.count({ where: { projectId, action: 'STRUCTURAL_MOVEMENT_ACCEPTED', userId: users.sponsor } })).toBe(1);
    await prisma.project.update({ where: { id: projectId }, data: { startExceptionAt: null, startExceptionByUserId: null, startExceptionReason: null } });
  });
  it('8. aceite exige cinco confirmações, versão, hash e usuário; registra cópia exata e auditoria', async () => {
    for (const [order, phaseId] of phaseIds.entries()) if (order > 0) await call('patch', `commercial/phases/${phaseId}`, 'admin', { ...phaseConfig, ...(order === 2 ? { homeOfficeHours: 2, inCompanyHours: 8 } : {}) }).expect(200);
    const p = (await call('post', 'proposals', 'admin', { notes: 'Versão comercial configurada.' }).expect(201)).body; proposalId = p.id;
    await call('post', `proposals/${p.id}/send`).expect(201);
    await call('post', `proposals/${p.id}/comments`, 'manager', { text: 'Podemos revisar o cronograma?' }).expect(201);
    await call('post', `proposals/${p.id}/review`, 'manager').expect(201);
    await call('post', `proposals/${p.id}/accept`, 'sponsor', { version: p.version, contentHash: p.contentHash, acknowledgements: [true, true, false, true, true] }).expect(400);
    await call('post', `proposals/${p.id}/accept`, 'sponsor', { version: 999, contentHash: p.contentHash, acknowledgements: [true, true, true, true, true] }).expect(400);
    await accept(p);
    const stored = await prisma.proposal.findUniqueOrThrow({ where: { id: p.id } }); expect(stored.approvedByUserId).toBe(users.sponsor); expect(stored.acceptedText).toMatchObject({ version: p.version, contentHash: p.contentHash, snapshot: p.snapshot });
    expect(await prisma.auditLog.count({ where: { projectId, entityId: p.id, action: 'PROPOSAL_ACCEPT', userId: users.sponsor } })).toBe(1);
    await call('post', `proposals/${p.id}/accept`, 'sponsor', { version: p.version, contentHash: p.contentHash, acknowledgements: [true, true, true, true, true] }).expect(409);
  });
  it('9–10. proposta aprovada não assina contrato nem inicia projeto; contrato é exigido no início e na retomada', async () => {
    let p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } }); expect(p.contractStatus).toBe('NOT_CREATED'); expect(p.status).toBe('PLANNING');
    await call('post', 'commercial/start').expect(409);
    await prisma.project.update({ where: { id: projectId }, data: { status: 'ON_HOLD' } });
    await call('post', 'status/resume', 'admin', { reason: 'Retomar após aceite' }).expect(409);
    await prisma.project.update({ where: { id: projectId }, data: { status: 'PLANNING' } });
    await call('patch', 'commercial/contract', 'sponsor', { status: 'SIGNED', reference: 'Contrato de teste assinado' }).expect(403);
    await call('patch', 'commercial/contract', 'admin', { status: 'SIGNED', reference: 'Contrato de teste assinado' }).expect(200);
    await call('post', 'commercial/start').expect(201);
    p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } }); expect(p.status).toBe('IN_PROGRESS');
  });
  it('11. condição comercial não altera Gate; Gate pode aprovar sem liberar fase comercialmente bloqueada', async () => {
    await call('patch', `commercial/phases/${phaseIds[2]}`, 'admin', { ...phaseConfig, blocking: true }).expect(200);
    const gate = await prisma.gate.findFirstOrThrow({ where: { projectId, phaseId: phaseIds[1] } });
    await prisma.gate.update({ where: { id: gate.id }, data: { status: 'TECHNICALLY_APPROVED' } });
    await call('post', `gates/${gate.id}/client-decision`, 'sponsor', { clientDecision: 'APPROVE' }).expect(201);
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: gate.id } })).status).toBe('APPROVED');
    expect((await prisma.phase.findUniqueOrThrow({ where: { id: phaseIds[2] } })).status).toBe('LOCKED');
    await call('patch', `commercial/phases/${phaseIds[2]}`, 'admin', { ...phaseConfig, blocking: true, conditionMet: true, conditionNote: 'Entrada comprovada no registro comercial' }).expect(200);
    expect((await prisma.phase.findUniqueOrThrow({ where: { id: phaseIds[2] } })).status).toBe('AVAILABLE');
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: gate.id } })).status).toBe('APPROVED');
    const gate2 = await prisma.gate.findFirstOrThrow({ where: { projectId, phaseId: phaseIds[2] } }); expect(gate2.status).toBe('BLOCKED');
  });
  it('alterar configuração não altera versão aceita; nova versão substitui sem apagar aceite anterior', async () => {
    const before = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    await call('patch', `commercial/phases/${phaseIds[1]}`, 'admin', { ...phaseConfig, homeOfficeHours: 12 }).expect(200);
    const after = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } }); expect(after.snapshot).toEqual(before.snapshot); expect(after.acceptedText).toEqual(before.acceptedText);
    const p = (await call('post', 'proposals', 'admin', {}).expect(201)).body;
    await call('post', `proposals/${p.id}/send`).expect(201);
    const superseded = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } }); expect(superseded.status).toBe('SUPERSEDED'); expect(superseded.acceptedText).toEqual(before.acceptedText);
    await accept(p);
  });
  it('exceção formal exige administrador autenticado e registra autorização sem presumir contrato', async () => {
    const p = await prisma.project.create({ data: { companyId, name: 'Exceção formal isolada', description: 'Teste de autorização', commercialControlEnabled: true } });
    const path = `/api/projects/${p.id}/commercial/`;
    const post = (action: string, body: object, who = 'admin') => request(app.getHttpServer()).post(path + action).set('Authorization', `Bearer ${token[who]}`).send(body);
    await post('start', {}).expect(409);
    await post('start-exception', { text: 'Autorização formal de teste.' }, 'manager').expect(403);
    await post('start-exception', { text: '     ' }).expect(400);
    await post('start-exception', { text: 'Autorização formal de teste.' }).expect(201);
    const result = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(result).toMatchObject({ status: 'IN_PROGRESS', contractStatus: 'NOT_CREATED', startExceptionByUserId: users.admin });
    expect(await prisma.auditLog.count({ where: { projectId: p.id, action: 'COMMERCIAL_START_EXCEPTION', userId: users.admin } })).toBe(1);
  });
  it('versões concorrentes recebem números únicos e sequenciais', async () => {
    const responses = await Promise.all([call('post', 'proposals', 'admin', {}).expect(201), call('post', 'proposals', 'admin', {}).expect(201)]);
    const versions = responses.map(r => r.body.version).sort((a, b) => a - b);
    expect(versions[1]).toBe(versions[0] + 1);
  });
  it('Gate final usa última fase ativa e preserva a fase histórica', async () => {
    const gate = await prisma.gate.findFirstOrThrow({ where: { projectId, phaseId: phaseIds[3] } }); await prisma.gate.update({ where: { id: gate.id }, data: { status: 'TECHNICALLY_APPROVED' } });
    await call('post', `gates/${gate.id}/client-decision`, 'sponsor', { clientDecision: 'APPROVE' }).expect(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe('IMPLEMENTATION_COMPLETED');
    expect(await prisma.phase.count({ where: { projectId, archived: true } })).toBe(1);
    const plan = await app.get(ReportsData).actionPlan(projectId);
    expect(plan.map(t => t.code)).not.toContain('G4');
    const report = await call('get', 'reports/final').expect(200);
    expect(JSON.stringify(report.body)).not.toContain('Fase 4');
  });
});
