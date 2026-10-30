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
import { applyPhase1 } from '../src/commercial/phase1-ollem';
import { can } from '../src/approvals/authority';
import { averageProgress, taskProgress } from '../src/tasks/progress';
import { planCPhases, planCTasks } from '../src/plans/plano-c.data';
config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('10B.1 — modelagem da Fase 1 da Ollem (PostgreSQL real, schema descartável)', () => {
  const originalUrl = process.env.DATABASE_URL!; const schema = `phase1_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: originalUrl }); const password = 'Teste-Fase1-2026!';
  const previousDev = process.env.ALLOW_DEV_ACTOR_HEADER;
  let app: INestApplication; let prisma: PrismaService;
  let projectId: string; let companyId: string; let otherProjectId: string; let otherTaskId: string; let otherMilestoneId: string;
  const token: Record<string, string> = {}; const users: Record<string, string> = {};
  const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const api = (method: 'get' | 'post' | 'patch', path: string, who: string, body?: object) => { const r = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${token[who]}`); return method === 'get' ? r : r.send(body ?? {}); };
  const task = (code: string) => prisma.task.findUniqueOrThrow({ where: { projectId_code: { projectId, code } } });
  const milestone = (code: string) => prisma.phaseMilestone.findUniqueOrThrow({ where: { projectId_code: { projectId, code } }, include: { criteria: true } });
  let before: { phase1Tasks: number; c01: string; gate1: string; gate1Status: string; gate1Criteria: number };
  let firstRun: Awaited<ReturnType<typeof applyPhase1>>;

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

    companyId = (await prisma.company.create({ data: { name: 'Ollem fase 1' } })).id;
    projectId = (await prisma.project.create({ data: { companyId, name: 'Estruturação do Almoxarifado', description: 'Projeto Ollem' } })).id;
    for (const [order, spec] of planCPhases.entries()) {
      const phase = await prisma.phase.create({ data: { projectId, order, name: spec.name, description: spec.description, plannedWeeks: spec.weeks, plannedJgm4Hours: spec.hours, status: order === 0 ? 'AVAILABLE' : 'LOCKED' } });
      await prisma.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: spec.title, question: spec.question } });
    }
    const phases = await prisma.phase.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
    for (const t of planCTasks) await prisma.task.create({ data: { projectId, phaseId: phases[t.phase].id, code: t.code, title: t.title, objective: t.title, instructions: 'Original', acceptanceCriteria: 'Original', plannedJgm4Hours: t.jgm4, status: t.code === 'C00' ? 'RELEASED' : 'BLOCKED' } });

    // Outro cliente/projeto, para provar o isolamento.
    const otherCompany = await prisma.company.create({ data: { name: 'Outro cliente' } });
    otherProjectId = (await prisma.project.create({ data: { companyId: otherCompany.id, name: 'Projeto de outro cliente', description: 'Outro' } })).id;
    const otherPhase = await prisma.phase.create({ data: { projectId: otherProjectId, order: 0, name: 'Fase única', description: 'x', plannedWeeks: 1, plannedJgm4Hours: 1, status: 'AVAILABLE' } });
    otherTaskId = (await prisma.task.create({ data: { projectId: otherProjectId, phaseId: otherPhase.id, code: 'X1', title: 'Outra', objective: 'o', instructions: 'i', acceptanceCriteria: 'a', status: 'RELEASED' } })).id;
    otherMilestoneId = (await prisma.phaseMilestone.create({ data: { projectId: otherProjectId, phaseId: otherPhase.id, code: 'M1', title: 'Marco de outro', question: 'q', order: 1 } })).id;

    const people: Array<[string, 'JGM4_ADMIN' | 'JGM4_CONSULTANT' | 'CLIENT_SPONSOR' | 'CLIENT_MANAGER' | 'CLIENT_USER' | 'CLIENT_EXECUTIVE', string | null]> = [
      ['admin', 'JGM4_ADMIN', null], ['consultant', 'JGM4_CONSULTANT', null], ['sponsor', 'CLIENT_SPONSOR', companyId], ['manager', 'CLIENT_MANAGER', companyId],
      ['operator', 'CLIENT_USER', companyId], ['executive', 'CLIENT_EXECUTIVE', companyId], ['other', 'CLIENT_SPONSOR', otherCompany.id]];
    for (const [key, role, company] of people) {
      const user = await prisma.user.create({ data: { name: key, email: `${key}@fase1.test`, passwordHash: await hash(password, 4), role, companyId: company } }); users[key] = user.id;
      await prisma.projectMembership.create({ data: { projectId: key === 'other' ? otherProjectId : projectId, userId: user.id } });
      token[key] = (await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password }).expect(200)).body.accessToken;
    }

    await reviseOllem(prisma, projectId);
    const c01 = await task('C01'); const gate1 = await prisma.gate.findFirstOrThrow({ where: { projectId, code: 'GATE-1' }, include: { criteria: true } });
    before = { phase1Tasks: await prisma.task.count({ where: { projectId, phase: { order: 1, archived: false } } }), c01: c01.id, gate1: gate1.id, gate1Status: gate1.status, gate1Criteria: gate1.criteria.length };
    firstRun = await applyPhase1(prisma, projectId);
  }, 240000);
  afterAll(async () => { if (app) await app.close(); process.env.DATABASE_URL = originalUrl; process.env.ALLOW_DEV_ACTOR_HEADER = previousDev; await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); });

  // ---------- Carga (ollem:phase1) ----------
  it('carga: corrige datas e nomes, cria 12 atividades e M1–M4, preserva IDs e o GATE-1 contratual', async () => {
    const phases = await prisma.phase.findMany({ where: { projectId, archived: false }, orderBy: { order: 'asc' } });
    expect(phases.map(p => p.name)).toEqual(['Preparação do projeto', 'Estruturação do CD', 'Inventário, processos e treinamentos', 'Estabilização e sustentação']);
    const iso = (d: Date | null) => d?.toISOString().slice(0, 10);
    expect([iso(phases[1].plannedStartDate), iso(phases[1].plannedEndDate)]).toEqual(['2026-11-04', '2027-01-31']);
    expect([iso(phases[2].plannedStartDate), iso(phases[2].plannedEndDate)]).toEqual(['2027-02-01', '2027-03-31']);
    expect(firstRun.tasksCreated).toEqual(['EX-04', 'EX-05', 'EX-06', 'EX-08', 'EX-09', 'EX-10', 'EX-11', 'CAB-01', 'CAB-02', 'CAB-03', 'CAB-04', 'CAB-05']);
    expect(firstRun.milestonesCreated).toHaveLength(4);
    expect(await prisma.task.count({ where: { projectId, phase: { order: 1, archived: false } } })).toBe(before.phase1Tasks + 12);
    // Absorções: mesmo ID, título rastreável, checklist acrescentado.
    const c01 = await task('C01'); expect(c01.id).toBe(before.c01); expect(c01.title).toContain('EX-01'); expect(c01.instructions).toContain('EX-02');
    expect(await prisma.taskRequirement.count({ where: { taskId: c01.id, label: { startsWith: 'EX-0' } } })).toBe(6);
    expect((await task('C12')).title).toContain('EX-03'); expect((await task('C11')).title).toContain('EX-07');
    for (const code of ['EX-01', 'EX-02', 'EX-03', 'EX-07']) expect(await prisma.task.count({ where: { projectId, code } })).toBe(0); // não duplica
    // Novas atividades não exigem o GATE-1 contratual.
    const created = await prisma.task.findMany({ where: { projectId, code: { in: firstRun.tasksCreated } } });
    expect(created.every(t => t.requiredForGate === false && t.status === 'BLOCKED' && t.milestoneId && t.category && t.classification && t.priority)).toBe(true);
    expect((await task('CAB-03')).category).toBe('Controle de Fios e Cabos');
    expect((await task('C05')).predecessorTaskId).toBe((await task('EX-04')).id);
    expect((await task('OL-COMPRAS')).classification).toBe('ACQUISITION'); expect((await task('C32')).classification).toBe('DEVELOPMENT');
    expect((await milestone('M4')).criteria).toHaveLength(4); expect((await milestone('M1')).criteria).toHaveLength(3);
    // Gate contratual intacto.
    const gate1 = await prisma.gate.findUniqueOrThrow({ where: { id: before.gate1 }, include: { criteria: true } });
    expect(gate1.status).toBe(before.gate1Status); expect(gate1.criteria).toHaveLength(before.gate1Criteria);
    expect(await prisma.auditLog.count({ where: { projectId, action: { startsWith: 'OLLEM_PHASE1_' } } })).toBeGreaterThan(30);
  });
  it('carga: é idempotente e não sobrescreve edição manual', async () => {
    await prisma.task.update({ where: { id: (await task('C03')).id }, data: { priority: 'LOW', category: 'Categoria manual' } });
    const counts = async () => ({ tasks: await prisma.task.count({ where: { projectId } }), ms: await prisma.phaseMilestone.count({ where: { projectId } }), crit: await prisma.milestoneCriterion.count(), req: await prisma.taskRequirement.count(), audit: await prisma.auditLog.count({ where: { projectId } }) });
    const first = await counts(); const second = await applyPhase1(prisma, projectId);
    expect(second).toMatchObject({ phasesUpdated: [], datesFixed: false, tasksEnriched: [], tasksCreated: [], milestonesCreated: [], milestoneLinks: 0, requirementsAdded: 0 });
    expect(await counts()).toEqual(first);
    const c03 = await task('C03'); expect(c03.priority).toBe('LOW'); expect(c03.category).toBe('Categoria manual');
  });

  // ---------- Prioridade / classificação / categoria ----------
  it('JGM4 define categoria, classificação, prioridade e marco; valores inválidos e marco de outro projeto são recusados; cliente não altera', async () => {
    const ex05 = await task('EX-05');
    const ok = await api('patch', `/tasks/${ex05.id}/plan`, 'consultant', { category: 'Layout e Estruturas', classification: 'FUTURE', priority: 'CRITICAL' }).expect(200);
    expect(ok.body).toMatchObject({ category: 'Layout e Estruturas', classification: 'FUTURE', priority: 'CRITICAL', progressPercent: 0 });
    await api('patch', `/tasks/${ex05.id}/plan`, 'consultant', { classification: 'EM_2026' }).expect(400);
    await api('patch', `/tasks/${ex05.id}/plan`, 'consultant', { milestoneId: otherMilestoneId }).expect(400);
    await api('patch', `/tasks/${ex05.id}/plan`, 'operator', { priority: 'LOW' }).expect(403);
    await api('patch', `/tasks/${ex05.id}/plan`, 'sponsor', { priority: 'LOW' }).expect(403);
    await api('patch', `/tasks/${ex05.id}/plan`, 'executive', { priority: 'LOW' }).expect(403);
  });

  // ---------- Marcos ----------
  it('marcos: fluxo completo (critérios → análise → parecer → decisão do cliente) sem tocar o GATE-1 nem a Fase 2', async () => {
    const m1 = await milestone('M1'); const base = `/projects/${projectId}/milestones`;
    const list = await api('get', base, 'executive').expect(200); expect(list.body.map((m: any) => m.code)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(list.body[0].allowedActions).toEqual([]); // diretoria só lê
    await api('post', `${base}/${m1.id}/start-review`, 'consultant').expect(409); // critérios pendentes
    for (const criterion of m1.criteria) {
      await api('patch', `${base}/${m1.id}/criteria/${criterion.id}`, 'operator', { satisfied: true }).expect(403);
      await api('patch', `${base}/${m1.id}/criteria/${criterion.id}`, 'consultant', { satisfied: true, evidenceReference: 'Planta anexada' }).expect(200);
    }
    expect((await milestone('M1')).status).toBe('AVAILABLE');
    await api('post', `${base}/${m1.id}/start-review`, 'sponsor').expect(403);
    await api('post', `${base}/${m1.id}/start-review`, 'consultant').expect(200);
    await api('post', `${base}/${m1.id}/client-decision`, 'sponsor', { decision: 'APPROVE' }).expect(409); // sem parecer técnico
    const negative = await api('post', `${base}/${m1.id}/technical-opinion`, 'consultant', { recommendation: 'DO_NOT_ADVANCE', opinion: 'Faltam medidas da doca.' }).expect(200);
    expect(negative.body).toMatchObject({ status: 'CORRECTION_REQUIRED', correctionReason: 'Faltam medidas da doca.' });
    await api('post', `${base}/${m1.id}/start-review`, 'consultant').expect(200);
    await api('post', `${base}/${m1.id}/technical-opinion`, 'consultant', { recommendation: 'ADVANCE', opinion: 'Planta e medidas conferidas.' }).expect(200);
    for (const who of ['operator', 'executive', 'consultant']) await api('post', `${base}/${m1.id}/client-decision`, who, { decision: 'APPROVE' }).expect(403);
    await api('post', `${base}/${m1.id}/client-decision`, 'manager', { decision: 'HOLD' }).expect(400); // exige motivo
    const approved = await api('post', `${base}/${m1.id}/client-decision`, 'sponsor', { decision: 'APPROVE', comment: 'De acordo.' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', progressPercent: 100, clientDecision: 'APPROVE' }); expect(approved.body.actualDate).toBeTruthy();
    await api('post', `${base}/${m1.id}/start-review`, 'consultant').expect(409);
    await api('patch', `${base}/${m1.id}/criteria/${m1.criteria[0].id}`, 'consultant', { satisfied: false }).expect(409);
    const detail = await api('get', `${base}/${m1.id}`, 'sponsor').expect(200); expect(detail.body.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['MILESTONE_REVIEW_STARTED', 'MILESTONE_TECHNICAL_OPINION', 'MILESTONE_CLIENT_DECISION']));
    // Independência: o Gate contratual e a Fase 2 não mudam.
    const gate1 = await prisma.gate.findUniqueOrThrow({ where: { id: before.gate1 } }); expect(gate1.status).toBe(before.gate1Status);
    expect((await prisma.phase.findFirstOrThrow({ where: { projectId, order: 2 } })).status).toBe('LOCKED');
    await api('get', `/projects/${otherProjectId}/milestones`, 'sponsor').expect(403); await api('get', `/projects/${otherProjectId}/milestones/${otherMilestoneId}`, 'executive').expect(403);
    await api('get', `${base}/${otherMilestoneId}`, 'sponsor').expect(404); // marco de outro projeto na rota deste projeto
  });

  // ---------- Comentários ----------
  it('comentários: nota interna nunca chega a perfis da Ollem (lista, atividade, auditoria, marcos)', async () => {
    const ex04 = await task('EX-04'); const secret = 'SEGREDO-JGM4-NOTA-INTERNA-4471';
    const posted = await api('post', `/projects/${projectId}/comments`, 'operator', { taskId: ex04.id, body: 'Medidas enviadas pela Ollem.' }).expect(201);
    expect(posted.body).toMatchObject({ internal: false, authorRole: 'CLIENT_USER' });
    await api('post', `/projects/${projectId}/comments`, 'operator', { taskId: ex04.id, body: secret, internal: true }).expect(403);
    await api('post', `/projects/${projectId}/comments`, 'sponsor', { taskId: ex04.id, body: secret, internal: true }).expect(403);
    await api('post', `/projects/${projectId}/comments`, 'consultant', { taskId: ex04.id, body: secret, internal: true }).expect(201);
    await api('post', `/projects/${projectId}/comments`, 'consultant', { taskId: ex04.id, body: 'Pode seguir, obrigado.' }).expect(201);
    const seenBy = async (who: string) => (await api('get', `/projects/${projectId}/comments?taskId=${ex04.id}`, who).expect(200)).body as Array<{ body: string; internal: boolean }>;
    for (const who of ['operator', 'manager', 'sponsor', 'executive']) { const rows = await seenBy(who); expect(rows).toHaveLength(2); expect(JSON.stringify(rows)).not.toContain(secret); }
    for (const who of ['consultant', 'admin']) { const rows = await seenBy(who); expect(rows).toHaveLength(3); expect(rows.some(r => r.internal && r.body === secret)).toBe(true); }
    // O texto não vaza por nenhuma outra leitura destinada ao cliente.
    for (const path of [`/tasks/${ex04.id}`, `/projects/${projectId}/tasks/${ex04.id}`, `/projects/${projectId}/tasks`, `/projects/${projectId}/milestones`, `/projects/${projectId}/reports/audit`]) {
      const res = await api('get', path, 'sponsor'); expect(res.status).toBeLessThan(500); expect(JSON.stringify(res.body)).not.toContain(secret);
    }
    expect(await prisma.auditLog.count({ where: { projectId, entityType: 'Comment' } })).toBe(3);
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { projectId, entityType: 'Comment' } }))).not.toContain(secret);
  });
  it('comentários: validação de entidade, projeto e permissão', async () => {
    const ex04 = await task('EX-04'); const base = `/projects/${projectId}/comments`; const m2 = await milestone('M2');
    await api('post', base, 'operator', { taskId: ex04.id, milestoneId: m2.id, body: 'duas' }).expect(400);
    await api('post', base, 'operator', { body: 'nenhuma' }).expect(400);
    await api('post', base, 'operator', { taskId: 'nao-e-uuid', body: 'x' }).expect(400);
    await api('post', base, 'operator', { taskId: ex04.id, body: '   ' }).expect(400);
    await api('post', base, 'operator', { taskId: otherTaskId, body: 'cruzado' }).expect(404); // tarefa de outro projeto
    await api('post', base, 'operator', { milestoneId: otherMilestoneId, body: 'cruzado' }).expect(404);
    await api('post', base, 'operator', { milestoneId: m2.id, body: 'Dúvida sobre o zoneamento.' }).expect(201);
    await api('get', `${base}?taskId=${otherTaskId}`, 'sponsor').expect(404);
    await api('get', `${base}?taskId=${ex04.id}`, 'other').expect(403); await api('post', base, 'other', { taskId: ex04.id, body: 'invasor' }).expect(403); // outro cliente
    await api('get', `/projects/${otherProjectId}/comments?taskId=${otherTaskId}`, 'sponsor').expect(403);
    await api('post', base, 'executive', { taskId: ex04.id, body: 'diretoria' }).expect(403); // somente leitura
  });
  it('banco: comentário só aceita 1 entidade do mesmo projeto e é append-only', async () => {
    const ex04 = await task('EX-04'); const m2 = await milestone('M2'); const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${schema}"`);
      const insert = (projectIdValue: string, taskId: string | null, milestoneId: string | null) => client.query(`INSERT INTO "Comment" (id,"projectId","taskId","milestoneId","authorUserId","authorRole",body) VALUES (gen_random_uuid(),$1,$2,$3,$4,'JGM4_ADMIN','x')`, [projectIdValue, taskId, milestoneId, users.admin]);
      await expect(insert(projectId, otherTaskId, null)).rejects.toThrow(/foreign key|Comment_projectId_taskId_fkey/i); // entidade de outro projeto
      await expect(insert(projectId, ex04.id, m2.id)).rejects.toThrow(/comment_one_entity/);
      await expect(insert(projectId, null, null)).rejects.toThrow(/comment_one_entity/);
      await expect(client.query(`UPDATE "Comment" SET body = 'alterado'`)).rejects.toThrow(/imutáveis/);
      await expect(client.query(`DELETE FROM "Comment"`)).rejects.toThrow(/imutáveis/);
      await expect(client.query(`TRUNCATE "Comment"`)).rejects.toThrow(/imutáveis/);
    } finally { client.release(); }
  });

  // ---------- Perfis ----------
  it('perfis: operacional executa/anexa/comenta sem decidir; diretoria só lê', async () => {
    expect(can('CLIENT_USER', 'TASK_EXECUTE')).toBe(true); expect(can('CLIENT_USER', 'GATE_CLIENT_DECISION')).toBe(false); expect(can('CLIENT_USER', 'MILESTONE_CLIENT_DECISION')).toBe(false);
    expect(can('CLIENT_EXECUTIVE', 'TASK_EXECUTE')).toBe(false); expect(can('CLIENT_EXECUTIVE', 'COMMENT_WRITE')).toBe(false); expect(can('CLIENT_MANAGER', 'MILESTONE_CLIENT_DECISION')).toBe(true);
    const ex06 = await task('EX-06'); const m2 = await milestone('M2'); const upload = (who: string, entityType: string, entityId: string) => request(app.getHttpServer()).post(`/api/projects/${projectId}/attachments`).set('Authorization', `Bearer ${token[who]}`).field('entityType', entityType).field('entityId', entityId).attach('file', pdf(), { filename: 'evidencia.pdf', contentType: 'application/pdf' });
    expect((await upload('operator', 'Task', ex06.id).expect(201)).body.name).toBe('evidencia.pdf');
    await upload('operator', 'PhaseMilestone', m2.id).expect(201);
    await upload('consultant', 'PhaseMilestone', otherMilestoneId).expect(404); // marco de outro projeto
    await upload('executive', 'Task', ex06.id).expect(403);
    await upload('other', 'Task', ex06.id).expect(403);
    const listed = await api('get', `/projects/${projectId}/attachments?entityType=PhaseMilestone&entityId=${m2.id}`, 'executive').expect(200); expect(listed.body).toHaveLength(1);
    // Execução: o operacional inicia a atividade liberada (Fase 0); a diretoria recebe 403 de somente leitura.
    const c00 = await task('C00');
    const started = await api('post', `/tasks/${c00.id}/start`, 'operator').expect(201); expect(started.body.status).toBe('IN_PROGRESS');
    const denied = await api('post', `/tasks/${c00.id}/start`, 'executive').expect(403); expect(denied.body.message).toMatch(/somente leitura/i);
    const detail = await api('get', `/tasks/${ex06.id}`, 'executive').expect(200); expect(detail.body.allowedActions).toEqual([]);
    // O operacional não decide Gate, marco, nem altera estrutura/usuários.
    const gate = await prisma.gate.findFirstOrThrow({ where: { projectId, code: 'GATE-1' } });
    await api('post', `/gates/${gate.id}/client-decision`, 'operator', { decision: 'APPROVE' }).expect(403);
    await api('post', `/gates/${gate.id}/client-decision`, 'executive', { decision: 'APPROVE' }).expect(403);
    await api('post', '/admin/users', 'operator', { name: 'x', email: 'x@x.com', role: 'CLIENT_USER' }).expect(403);
    const own = await api('post', '/auth/change-password', 'executive', { currentPassword: 'errada-1', newPassword: 'Outra-Senha-2026!!' }); expect(JSON.stringify(own.body)).not.toMatch(/somente leitura/i); // conta pessoal segue disponível (recusada só pela senha atual)
  });

  // ---------- Percentual calculado ----------
  it('percentual é calculado pelo estado real, nunca gravado', () => {
    const req = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ required: true, completed: i < done }));
    expect(taskProgress({ status: 'NOT_STARTED' })).toBe(0); expect(taskProgress({ status: 'BLOCKED' })).toBe(0);
    expect(taskProgress({ status: 'IN_PROGRESS', requirements: req(1, 2) })).toBe(30); expect(taskProgress({ status: 'IN_PROGRESS', requirements: req(2, 2) })).toBe(60); expect(taskProgress({ status: 'IN_PROGRESS' })).toBe(0);
    expect(taskProgress({ status: 'WAITING_EVIDENCE' })).toBe(60); expect(taskProgress({ status: 'WAITING_JGM4_VALIDATION' })).toBe(80);
    expect(taskProgress({ status: 'VALIDATED' })).toBe(95); expect(taskProgress({ status: 'COMPLETED' })).toBe(100); expect(taskProgress({ status: 'CANCELLED' })).toBeNull();
    expect(averageProgress([{ status: 'COMPLETED' }, { status: 'NOT_STARTED' }, { status: 'CANCELLED' }])).toBe(50); expect(averageProgress([])).toBe(0);
  });
  it('percentual do marco acompanha as atividades vinculadas', async () => {
    const m2 = await milestone('M2'); const linked = await prisma.task.findMany({ where: { milestoneId: m2.id } });
    expect(linked.length).toBeGreaterThanOrEqual(8);
    await prisma.task.update({ where: { id: (await task('CAB-01')).id }, data: { status: 'COMPLETED' } });
    const body = (await api('get', `/projects/${projectId}/milestones/${m2.id}`, 'sponsor').expect(200)).body;
    expect(body.progressPercent).toBe(Math.round(100 / linked.length)); expect(body.tasks.find((t: any) => t.code === 'CAB-01').progressPercent).toBe(100);
    expect((await prisma.phaseMilestone.findUniqueOrThrow({ where: { id: m2.id } })) as Record<string, unknown>).not.toHaveProperty('progressPercent');
  });
});
