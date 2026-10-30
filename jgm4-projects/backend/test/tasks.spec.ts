import 'reflect-metadata';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensurePlanCRequests } from '../src/requests/plan-c-requests';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 3 — workflow de atividades e esforço real', () => {
  const schema = `jgm4_stage3_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const originalActor = process.env.JGM4_LOCAL_ACTOR;
  const pool = new Pool({ connectionString: originalUrl });
  let prisma: PrismaService; let app: INestApplication; let projectId: string; let phaseId: string;
  let c05Id: string; let hoursTaskId: string; let adjustmentTaskId: string; let sol006Id: string;
  const task = (id: string) => `/api/tasks/${id}`;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const folder of ['20261022000100_initial', '20261022000200_requests', '20261023000100_task_workflow', '20261023000200_gates', '20261024000100_approvals', '20261025000100_auth', '20261026000100_project_status_values', '20261026000200_project_status_data', '20261027000100_reports', '20261028000100_security','20261101000100_admin_ops','20261102000100_project_templates', '20261103000100_ollem_revision', '20261103000200_gate_required', '20261104000100_client_executive_role', '20261104000200_phase1_modeling']) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${folder}/migration.sql`), 'utf8');
        if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); }
        else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    process.env.JGM4_LOCAL_ACTOR = 'JGM4';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    const company = await prisma.company.create({ data: { name: 'Fixture isolada Etapa 3' } });
    projectId = (await prisma.project.create({ data: { companyId: company.id, name: 'Projeto operacional', description: 'Schema isolado dos testes.' } })).id;
    const phaseIds: string[] = [];
    for (let order = 0; order < 5; order++) {
      const phase = await prisma.phase.create({ data: { projectId, order, name: `Fase ${order}`, description: 'Fixture Etapa 3', plannedWeeks: 3, plannedJgm4Hours: order === 0 ? 36 : 39, status: order <= 1 ? 'AVAILABLE' : 'LOCKED' } });
      phaseIds.push(phase.id); if (order === 0) phaseId = phase.id;
      await prisma.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: 'Gate', question: 'Critérios cumpridos?' } });
    }
    const planned = [
      ['C00', 6, 2], ['C01', 8, 6], ['C02', 4, 4], ['C03', 6, 6], ['C04', 5, 12], ['C05', 4, 8], ['C06', 1, 2], ['G0', 2, 1],
    ] as const;
    for (const [code, jgm4, clientHours] of planned) {
      const created = await prisma.task.create({ data: { projectId, phaseId, code, title: code, objective: code, instructions: code,
        acceptanceCriteria: code, status: code === 'C00' ? 'RELEASED' : 'BLOCKED', plannedJgm4Hours: jgm4, plannedClientHours: clientHours,
        responsibilityType: 'JOINT' } });
      if (code === 'C05') c05Id = created.id;
      if (code === 'C00') hoursTaskId = created.id;
    }
    const adj = await prisma.task.create({ data: { projectId, phaseId, code: 'ADJ', title: 'Atividade de ajuste', objective: 'Teste', instructions: 'Teste', acceptanceCriteria: 'Teste', status: 'WAITING_JGM4_VALIDATION', plannedJgm4Hours: 0, plannedClientHours: 0 } });
    adjustmentTaskId = adj.id;
    await prisma.taskRequirement.create({ data: { taskId: adj.id, label: 'Critério do ajuste' } });
    const hourTask = await prisma.task.create({ data: { projectId, phaseId: phaseIds[1], code: 'HORAS', title: 'Apontamento', objective: 'Teste', instructions: 'Teste', acceptanceCriteria: 'Teste', status: 'IN_PROGRESS', plannedJgm4Hours: 5, plannedClientHours: 10 } });
    hoursTaskId = hourTask.id;
    const c05 = await prisma.task.findUniqueOrThrow({ where: { id: c05Id } });
    await prisma.taskRequirement.createMany({ data: [
      { taskId: c05.id, label: 'Croqui concluído' }, { taskId: c05.id, label: 'Medidas conferidas' },
    ] });
    await prisma.$transaction((tx) => ensurePlanCRequests(tx, projectId));
    sol006Id = (await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-006' } } })).id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    if (originalActor === undefined) delete process.env.JGM4_LOCAL_ACTOR; else process.env.JGM4_LOCAL_ACTOR = originalActor;
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('1. bloqueada por SOL-006 não inicia', async () => {
    await request(app.getHttpServer()).post(`${task(c05Id)}/start`).send({}).expect(409);
  });
  it('2. aceite da última solicitação libera C05 automaticamente e audita', async () => {
    const root = `/api/projects/${projectId}/requests/${sol006Id}`;
    await request(app.getHttpServer()).post(`${root}/request`).send({}).expect(200);
    await request(app.getHttpServer()).post(`${root}/start`).send({}).expect(200);
    let version = 0;
    const { body: before } = await request(app.getHttpServer()).get(root).expect(200); version = before.version;
    for (const requirement of before.requirements) {
      const { body: updated } = await request(app.getHttpServer()).patch(`${root}/requirements/${requirement.id}`).send({ completed: true, expectedVersion: version }).expect(200);
      version = updated.version;
    }
    await request(app.getHttpServer()).post(`${root}/send`).send({ expectedVersion: version }).expect(200);
    await request(app.getHttpServer()).post(`${root}/start-review`).send({}).expect(200);
    await request(app.getHttpServer()).post(`${root}/accept`).send({}).expect(200);
    const { body: activity } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks/${c05Id}`).expect(200);
    expect(activity.status).toBe('RELEASED'); expect(activity.blockedByRequests).toBe(false);
    expect(await prisma.auditLog.count({ where: { projectId, entityType: 'Task', entityId: c05Id, action: 'RELEASED' } })).toBe(1);
  });
  it('3. atividade liberada inicia sem atalho e 4. grava a data real', async () => {
    const { body } = await request(app.getHttpServer()).post(`${task(c05Id)}/start`).send({ expectedVersion: 1 }).expect(201);
    expect(body.status).toBe('IN_PROGRESS'); expect(body.actualStartDate).toBeTruthy();
  });
  it('5. não envia à validação sem checklist obrigatório completo', async () => {
    process.env.JGM4_LOCAL_ACTOR = 'CLIENT';
    const { body } = await request(app.getHttpServer()).post(`${task(c05Id)}/send-validation`).send({}).expect(400);
    expect(body.message).toContain('2 critérios obrigatórios pendentes');
  });
  it('6. checklist completo permite avançar até a etapa de evidências', async () => {
    let { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks/${c05Id}`).expect(200);
    for (const requirement of body.requirements) {
      const { body: updated } = await request(app.getHttpServer()).patch(`${task(c05Id)}/requirements/${requirement.id}`).send({ completed: true, expectedVersion: body.version }).expect(200);
      body = updated;
    }
    const { body: sent } = await request(app.getHttpServer()).post(`${task(c05Id)}/send-validation`).send({ expectedVersion: body.version }).expect(201);
    expect(sent.status).toBe('WAITING_EVIDENCE');
  });
  it('7. exige evidência antes de encaminhar e 8. encaminha à validação após registrar', async () => {
    await request(app.getHttpServer()).post(`${task(c05Id)}/submit-evidence`).send({}).expect(400);
    await request(app.getHttpServer()).post(`${task(c05Id)}/evidence`).send({ description: 'Foto do zoneamento implantado' }).expect(201);
    const { body } = await request(app.getHttpServer()).post(`${task(c05Id)}/submit-evidence`).send({}).expect(201);
    expect(body.status).toBe('WAITING_JGM4_VALIDATION');
  });
  it('9. somente JGM4 valida e 10. validação permite conclusão com data real', async () => {
    process.env.JGM4_LOCAL_ACTOR = 'CLIENT';
    await request(app.getHttpServer()).post(`${task(c05Id)}/validate`).send({}).expect(403);
    process.env.JGM4_LOCAL_ACTOR = 'JGM4';
    const { body: validated } = await request(app.getHttpServer()).post(`${task(c05Id)}/validate`).send({ comment: 'Evidências conferidas' }).expect(201);
    expect(validated.status).toBe('VALIDATED');
    const { body: completed } = await request(app.getHttpServer()).post(`${task(c05Id)}/complete`).send({}).expect(201);
    expect(completed.status).toBe('COMPLETED'); expect(completed.actualEndDate).toBeTruthy();
  });
  it('11. ajuste exige motivo e orientação JGM4; 12. Ollem retoma sem apagar evidências', async () => {
    await request(app.getHttpServer()).post(`${task(adjustmentTaskId)}/request-adjustment`).send({ comment: 'Ajustar', guidance: 'Refazer a identificação' }).expect(201);
    let { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks/${adjustmentTaskId}`).expect(200);
    expect(body.status).toBe('ADJUSTMENT_REQUESTED'); expect(body.nextAction).toBe('Refazer a identificação');
    process.env.JGM4_LOCAL_ACTOR = 'CLIENT';
    const { body: resumed } = await request(app.getHttpServer()).post(`${task(adjustmentTaskId)}/resume`).send({}).expect(201);
    expect(resumed.status).toBe('IN_PROGRESS'); expect(resumed.requirements).toHaveLength(1);
  });
  it('13. soma horas decimais, calcula saldo e alerta em 80%', async () => {
    process.env.JGM4_LOCAL_ACTOR = 'JGM4';
    await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: 4, description: 'Medições e análise' }).expect(201);
    let { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks/${hoursTaskId}`).expect(200);
    expect(body).toMatchObject({ plannedJgm4Hours: 5, actualJgm4Hours: 4, remainingJgm4Hours: 1, jgm4ConsumptionPercent: 80, jgm4Alert: 'ATENÇÃO — 80% das horas planejadas consumidas.' });
    await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: 1.5, description: 'Revisão adicional' }).expect(201);
    process.env.JGM4_LOCAL_ACTOR = 'CLIENT';
    const { body: clientEntry } = await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: 2.25, description: 'Separação de itens' }).expect(201);
    expect(clientEntry.task).toMatchObject({ actualJgm4Hours: 5.5, actualClientHours: 2.25, remainingClientHours: 7.75 });
    expect(clientEntry.task.jgm4Alert).toBe('HORAS PLANEJADAS EXCEDIDAS.');
    expect(clientEntry.entry.organizationType).toBe('CLIENT');
  });
  it('14. exceder o planejado não bloqueia a atividade nem o lançamento', async () => {
    const { body } = await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: 1, description: 'Ajuste final' }).expect(201);
    expect(body.task.status).toBe('IN_PROGRESS'); expect(body.task.actualJgm4Hours).toBe(5.5);
  });
  it('15. rejeita horas negativas e organização informada pelo navegador', async () => {
    await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: -1, description: 'Valor inválido' }).expect(400);
    await request(app.getHttpServer()).post(`${task(hoursTaskId)}/time-entries`).send({ date: '2026-10-23', hours: 1, description: 'Tentativa de perfil', organizationType: 'JGM4' }).expect(400);
  });
  it('16. confirma 36 horas na Fase 0, compara esforço e mantém trilha imutável', async () => {
    const { body: phase } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/activity-summary/phases`).expect(200);
    expect(phase[0]).toMatchObject({ plannedJgm4Hours: 36, actualJgm4Hours: 0, remainingJgm4Hours: 36 });
    const { body: project } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/activity-summary`).expect(200);
    expect(project).toMatchObject({ plannedJgm4Hours: 41, actualJgm4Hours: 5.5, remainingJgm4Hours: 35.5 });
    expect(await prisma.auditLog.count({ where: { projectId, entityType: 'TimeEntry', action: 'TIME_ENTRY_CREATED' } })).toBe(4);
    const logs = await prisma.auditLog.findMany({ where: { projectId, entityType: 'Task', entityId: c05Id } });
    expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining(['RELEASED', 'START', 'SEND_VALIDATION', 'SUBMIT_EVIDENCE', 'VALIDATE', 'COMPLETE', 'CHECKLIST_CHANGED', 'EVIDENCE_ADDED']));
    await expect(prisma.auditLog.deleteMany({ where: { projectId } })).rejects.toThrow();
  });
});
