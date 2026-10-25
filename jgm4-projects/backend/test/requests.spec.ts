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

describe('Etapa 2 — solicitações, transições e auditoria reais', () => {
  const schema = `jgm4_stage2_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: originalUrl });
  let prisma: PrismaService; let app: INestApplication;
  let projectId: string; let otherProjectId: string; let phaseId: string; let taskId: string;
  let sol006: string; let version = 0;
  const base = () => `/api/projects/${projectId}/requests`;
  const endpoint = (id = sol006) => `${base()}/${id}`;
  const action = (name: string, body: Record<string, unknown> = {}, id = sol006) => request(app.getHttpServer()).post(`${endpoint(id)}/${name}`).send(body);

  beforeAll(async () => {
    // Namespace PostgreSQL exclusivo: nenhum estado de teste ou log fica na Ollem.
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const path of ['20261022000100_initial', '20261022000200_requests', '20261023000100_task_workflow', '20261023000200_gates', '20261024000100_approvals']) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${path}/migration.sql`), 'utf8');
        if (path === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); }
        else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    const company = await prisma.company.create({ data: { name: 'Fixture isolada Etapa 2' } });
    const project = await prisma.project.create({ data: { companyId: company.id, name: 'Projeto de teste isolado', description: 'Somente no schema de teste.', methodology: 'PLANO_C' } });
    projectId = project.id;
    otherProjectId = (await prisma.project.create({ data: { companyId: company.id, name: 'Outro projeto isolado', description: 'Verificação de escopo.' } })).id;
    for (let order = 0; order < 5; order++) {
      const phase = await prisma.phase.create({ data: { projectId, order, name: `Fase ${order}`, description: 'Fixture', plannedWeeks: 3, plannedJgm4Hours: 1, status: order === 0 ? 'AVAILABLE' : 'BLOCKED' } });
      if (order === 0) phaseId = phase.id;
      await prisma.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: 'Gate de teste', question: 'Critérios cumpridos?' } });
    }
    taskId = (await prisma.task.create({ data: { projectId, phaseId, code: 'C05', title: 'Zoneamento', objective: 'Teste', instructions: 'Teste', acceptanceCriteria: 'Teste', status: 'BLOCKED' } })).id;
    await prisma.$transaction((tx) => ensurePlanCRequests(tx, projectId));
    sol006 = (await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-006' } } })).id;
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    // Identificador criado acima, validado antes de descartar apenas este namespace.
    if (!/^jgm4_stage2_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  it('gera antecipadamente dez solicitações, requisitos e auditoria de criação', async () => {
    const { body } = await request(app.getHttpServer()).get(base()).expect(200);
    expect(body).toHaveLength(10);
    expect(body.filter((item: { status: string }) => item.status === 'AVAILABLE')).toHaveLength(6);
    expect(body.filter((item: { status: string }) => item.status === 'BLOCKED')).toHaveLength(4);
    expect(await prisma.auditLog.count({ where: { projectId, action: 'CREATED' } })).toBe(10);
    const { body: dimensional } = await request(app.getHttpServer()).get(endpoint()).expect(200);
    expect(dimensional.requirements).toHaveLength(6);
    expect(dimensional.task.code).toBe('C05');
    expect(dimensional.createdByUserId).toBeNull();
    const { body: tasks } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks`).expect(200);
    expect(tasks[0].blockedByRequests).toBe(true);
    expect(tasks[0].blockingRequests[0].code).toBe('SOL-006');
  });
  it('1. BLOCKED não pode ser enviada e explica o Gate pendente', async () => {
    const future = await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-007' } } });
    const { body } = await request(app.getHttpServer()).get(endpoint(future.id)).expect(200);
    expect(body.blockedReason).toContain('GATE-0');
    expect(body.allowedActions).toEqual([]);
    await action('request', {}, future.id).expect(409);
  });
  it('2. AVAILABLE vira REQUESTED pela ação específica', async () => {
    const { body } = await action('request', { expectedVersion: 0 }).expect(200);
    expect(body.status).toBe('REQUESTED'); expect(body.currentOwnerType).toBe('CLIENT'); version = body.version;
  });
  it('3. REQUESTED vira CLIENT_PREPARING', async () => {
    const { body } = await action('start', { expectedVersion: version }).expect(200);
    expect(body.status).toBe('CLIENT_PREPARING'); expect(body.canEditRequirements).toBe(true); version = body.version;
  });
  it('4. impede envio sem os requisitos, sem alterar estado ou auditoria', async () => {
    const before = await prisma.auditLog.count({ where: { projectId, entityId: sol006 } });
    const { body } = await action('send').expect(400);
    expect(body.missingRequirements).toHaveLength(6);
    expect((await prisma.projectRequest.findUniqueOrThrow({ where: { id: sol006 } })).status).toBe('CLIENT_PREPARING');
    expect(await prisma.auditLog.count({ where: { projectId, entityId: sol006 } })).toBe(before);
  });
  it('5. requisitos completos permitem SENT_TO_JGM4', async () => {
    const requirements = await prisma.requestRequirement.findMany({ where: { requestId: sol006 }, orderBy: { order: 'asc' } });
    for (const [index, requirement] of requirements.entries()) {
      const { body } = await request(app.getHttpServer()).patch(`${endpoint()}/requirements/${requirement.id}`).send({ completed: true, expectedVersion: version }).expect(200);
      version = body.version;
      expect(body.requirements.find((req: { id: string }) => req.id === requirement.id).completedAt).not.toBeNull();
      if (index === 0) await action('send').expect(400);
    }
    const { body } = await action('send', { expectedVersion: version, note: 'Dimensões e croqui conferidos.' }).expect(200);
    expect(body.status).toBe('SENT_TO_JGM4'); expect(body.currentOwnerType).toBe('JGM4'); version = body.version;
  });
  it('6. JGM4 inicia revisão', async () => {
    const { body } = await action('start-review').expect(200);
    expect(body.status).toBe('JGM4_REVIEW'); version = body.version;
  });
  it('7. JGM4 solicita ajuste com motivo obrigatório', async () => {
    await action('request-adjustment', { note: '   ' }).expect(400);
    const { body } = await action('request-adjustment', { note: 'Detalhar a largura dos corredores.' }).expect(200);
    expect(body.status).toBe('ADJUSTMENT_REQUESTED'); version = body.version;
  });
  it('8. ajuste retorna ao cliente e percorre preparação, envio e revisão', async () => {
    const { body } = await action('start').expect(200);
    expect(body.status).toBe('CLIENT_PREPARING');
    await action('send', { note: 'Corredores detalhados na resposta revisada.' }).expect(200);
    const review = await action('start-review').expect(200); version = review.body.version;
  });
  it('9. JGM4 aceita somente após a revisão', async () => {
    const { body } = await action('accept', { expectedVersion: version, note: 'Informações suficientes para o zoneamento.' }).expect(200);
    expect(body.status).toBe('ACCEPTED'); expect(body.allowedActions).toEqual([]); version = body.version;
  });
  it('10. ACCEPTED permanece registrada com resposta e histórico', async () => {
    const { body } = await request(app.getHttpServer()).get(endpoint()).expect(200);
    expect(body.status).toBe('ACCEPTED');
    expect(body.history.map((event: { action: string }) => event.action)).toEqual(expect.arrayContaining(['CREATED', 'STATUS_CHANGED', 'REQUIREMENT_CHANGED', 'ADJUSTMENT_REQUESTED', 'ACCEPTED']));
    expect(body.history.some((event: { newValue: { note?: string } }) => event.newValue.note === 'Detalhar a largura dos corredores.')).toBe(true);
    await action('accept').expect(409);
    const requirement = body.requirements[0];
    await request(app.getHttpServer()).patch(`${endpoint()}/requirements/${requirement.id}`).send({ completed: false }).expect(409);
  });
  it('11. ACCEPTED remove o bloqueio por solicitação, preservando o status próprio da atividade', async () => {
    const { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks`).expect(200);
    expect(body[0]).toMatchObject({ id: taskId, blockedByRequests: false, blockingRequests: [], status: 'RELEASED' });
  });
  it('rejeita pulo de revisão, status arbitrário, UUID e payload inválidos', async () => {
    const other = await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-002' } } });
    await action('accept', {}, other.id).expect(409);
    await action('request', { status: 'ACCEPTED' }, other.id).expect(400);
    await action('request', { userId: randomUUID() }, other.id).expect(400);
    await request(app.getHttpServer()).patch(endpoint(other.id)).send({ status: 'ACCEPTED' }).expect(404);
    await request(app.getHttpServer()).get(`${base()}/invalido`).expect(400);
    await request(app.getHttpServer()).get(`${base()}?filter=invalido`).expect(400);
    await action('request', {}, other.id).expect(200); await action('start', {}, other.id).expect(200);
    const requirement = await prisma.requestRequirement.findFirstOrThrow({ where: { requestId: other.id } });
    await request(app.getHttpServer()).patch(`${endpoint(other.id)}/requirements/${requirement.id}`).send({ completed: 'true' }).expect(400);
    await request(app.getHttpServer()).patch(`${endpoint(other.id)}/requirements/${randomUUID()}`).send({ completed: true }).expect(404);
  });
  it('não acessa nem altera uma solicitação através de outro projeto', async () => {
    await request(app.getHttpServer()).get(`/api/projects/${otherProjectId}/requests/${sol006}`).expect(404);
    await request(app.getHttpServer()).post(`/api/projects/${otherProjectId}/requests/${sol006}/accept`).send({}).expect(404);
    await request(app.getHttpServer()).get(`/api/projects/${randomUUID()}/requests`).expect(404);
    await expect(prisma.projectRequest.create({ data: { projectId: otherProjectId, phaseId, code: 'INVALIDA', title: 'Inválida', description: 'Teste', instructions: 'Teste', acceptanceCriteria: 'Teste' } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('conflito de versão impede ações simultâneas duplicadas', async () => {
    const other = await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-001' } } });
    const responses = await Promise.all([action('request', { expectedVersion: 0 }, other.id), action('request', { expectedVersion: 0 }, other.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count({ where: { projectId, entityId: other.id, action: 'STATUS_CHANGED' } })).toBe(1);
  });
  it('revalida o Gate no backend mesmo com status AVAILABLE indevido', async () => {
    const future = await prisma.projectRequest.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'SOL-010' } } });
    await prisma.projectRequest.update({ where: { id: future.id }, data: { status: 'AVAILABLE' } });
    await action('request', {}, future.id).expect(409);
    await prisma.projectRequest.update({ where: { id: future.id }, data: { status: 'BLOCKED' } });
  });
  it('auditoria rejeita UPDATE, DELETE e TRUNCATE', async () => {
    const event = await prisma.auditLog.findFirstOrThrow({ where: { projectId } });
    await expect(prisma.auditLog.update({ where: { id: event.id }, data: { action: 'ALTERADO' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: event.id } })).rejects.toThrow();
    await expect(pool.query(`TRUNCATE "${schema}"."AuditLog"`)).rejects.toThrow('imutável');
    expect(await prisma.auditLog.findUnique({ where: { id: event.id } })).not.toBeNull();
  });
  it('template reexecutável preserva status, requisitos, respostas e auditoria', async () => {
    const before = await prisma.projectRequest.findMany({ where: { projectId }, include: { requirements: { orderBy: { order: 'asc' } } }, orderBy: { code: 'asc' } });
    const auditCount = await prisma.auditLog.count({ where: { projectId } });
    await prisma.$transaction((tx) => ensurePlanCRequests(tx, projectId));
    const after = await prisma.projectRequest.findMany({ where: { projectId }, include: { requirements: { orderBy: { order: 'asc' } } }, orderBy: { code: 'asc' } });
    expect(after).toEqual(before); expect(await prisma.auditLog.count({ where: { projectId } })).toBe(auditCount);
  });
  it('filtros de fila retornam apenas os status correspondentes', async () => {
    const accepted = await request(app.getHttpServer()).get(`${base()}?filter=accepted`).expect(200);
    expect(accepted.body.map((item: { code: string }) => item.code)).toEqual(['SOL-006']);
    const blocked = await request(app.getHttpServer()).get(`${base()}?filter=blocked`).expect(200);
    expect(blocked.body).toHaveLength(4);
    const jgm4 = await request(app.getHttpServer()).get(`${base()}?filter=jgm4`).expect(200); expect(jgm4.body).toEqual([]);
    const client = await request(app.getHttpServer()).get(`${base()}?filter=client`).expect(200); expect(client.body).toHaveLength(2);
  });
});
