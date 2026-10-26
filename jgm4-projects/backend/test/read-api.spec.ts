import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const companyId = '9f1ead00-1c44-4000-8000-000000000001';

describe('Etapa 1 — API e PostgreSQL reais', () => {
  const originalUrl = process.env.DATABASE_URL!;
  const schema = `jgm4_legacy_read_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: originalUrl });
  let app: INestApplication;
  let prisma: PrismaService;
  const fixtureCompanyId = randomUUID();
  const fixtureProjectId = randomUUID();
  beforeAll(async () => {
    const client = await pool.connect();
    try { await client.query('CREATE SCHEMA "' + schema + '"'); await client.query('SET search_path TO "' + schema + '"');
      for (const folder of readdirSync(resolve(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()) {
        const sql = readFileSync(resolve(__dirname, '../prisma/migrations', folder, 'migration.sql'), 'utf8');
        if (folder === '20261023000200_gates') { const i = sql.indexOf('-- The first phase remains'); await client.query(sql.slice(0, i)); await client.query(sql.slice(i)); } else await client.query(sql);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString();
    const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], { cwd: resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, OLLEM_LEGACY_FIXTURE: 'true' } });
    if (seed.status !== 0) throw new Error('Falha ao preparar fixture legada: ' + seed.stderr);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.company.create({ data: { id: fixtureCompanyId, name: 'Fixture temporária de teste', projects: { create: {
      id: fixtureProjectId, name: 'Fixture temporária de projeto', description: 'Removida ao finalizar os testes.',
    } } } });
  }, 180000);
  afterAll(async () => {
    if (prisma) {
      await prisma.project.deleteMany({ where: { id: fixtureProjectId } });
      await prisma.company.deleteMany({ where: { id: fixtureCompanyId } });
    }
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); await pool.end();
  });

  it('verifica a conexão real do PostgreSQL no health check', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' }); // sem detalhes internos; falha de banco responde 503
  });
  it('lista a Ollem sem dados de usuários ou credenciais', async () => {
    const response = await request(app.getHttpServer()).get('/api/companies').expect(200);
    expect(response.body).toContainEqual({ id: companyId, name: 'Ollem do Brasil', active: true });
    expect(JSON.stringify(response.body)).not.toMatch(/password|Hash|DATABASE_URL/i);
  });
  it('filtra projetos por empresa sem misturar registros', async () => {
    const response = await request(app.getHttpServer()).get(`/api/projects?companyId=${companyId}`).expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(projectId);
    const other = await request(app.getHttpServer()).get(`/api/projects?companyId=${fixtureCompanyId}`).expect(200);
    expect(other.body.map((item: { id: string }) => item.id)).toEqual([fixtureProjectId]);
  });
  it('retorna as durações e horas exatas do Plano C', async () => {
    const { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}`).expect(200);
    expect(body.name).toBe('Estruturação do Almoxarifado');
    expect(body.methodology).toBe('PLANO_C');
    expect(body.summary).toEqual({ plannedWeeks: 16, plannedJgm4Hours: 198, phaseCount: 5, gateCount: 5 });
    expect(body.phases.map((phase: { plannedWeeks: number }) => phase.plannedWeeks)).toEqual([3, 3, 4, 3, 3]);
    expect(body.phases.map((phase: { plannedJgm4Hours: number }) => phase.plannedJgm4Hours)).toEqual([36, 39, 47, 39, 37]);
    expect(body.sponsorUserId).toBeNull();
    expect(body.plannedStartDate).toBeNull();
  });
  it('mantém as fases futuras e todos os Gates bloqueados no seed', async () => {
    const { body: phases } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/phases`).expect(200);
    expect(phases.map((phase: { status: string }) => phase.status)).toEqual(['AVAILABLE', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED']);
    const { body: gates } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/gates`).expect(200);
    expect(gates).toHaveLength(5);
    expect(gates.every((gate: { status: string; question: string }) => gate.status === 'BLOCKED' && gate.question.endsWith('?'))).toBe(true);
    expect(gates.map((gate: { phaseOrder: number }) => gate.phaseOrder)).toEqual([0, 1, 2, 3, 4]);
  });
  it('consulta somente atividades do projeto solicitado', async () => {
    const { body } = await request(app.getHttpServer()).get(`/api/projects/${projectId}/tasks`).expect(200);
    expect(body).toHaveLength(33);
    expect(body.every((task: { projectId: string }) => task.projectId === projectId)).toBe(true);
    expect(body.find((task: { code: string }) => task.code === 'C05')).toMatchObject({ status: 'BLOCKED', blockedByRequests: true });
    expect(body.filter((task: { status: string }) => task.status === 'RELEASED')).toHaveLength(1);
    const other = await request(app.getHttpServer()).get(`/api/projects/${fixtureProjectId}/tasks`).expect(200);
    expect(other.body).toEqual([]);
  });
  it('rejeita UUID e query inválidos com 400', async () => {
    await request(app.getHttpServer()).get('/api/projects/invalido').expect(400);
    await request(app.getHttpServer()).get('/api/projects?companyId=invalido').expect(400);
    await request(app.getHttpServer()).get('/api/projects?role=JGM4_ADMIN').expect(400);
  });
  it('retorna 404 para projeto inexistente em todas as rotas de detalhe', async () => {
    const missing = randomUUID();
    for (const suffix of ['', '/phases', '/gates', '/tasks']) {
      await request(app.getHttpServer()).get(`/api/projects/${missing}${suffix}`).expect(404);
    }
  });
  it('não disponibiliza escrita nem transições de workflow', async () => {
    await request(app.getHttpServer()).post('/api/projects').send({ name: 'Não deve ser criado' }).expect(404);
    await request(app.getHttpServer()).patch(`/api/projects/${projectId}`).send({ status: 'COMPLETED' }).expect(404);
    await request(app.getHttpServer()).delete(`/api/projects/${projectId}`).expect(404);
    await request(app.getHttpServer()).post(`/api/tasks/${randomUUID()}/start`).send({}).expect(404);
  });
  it('garante no banco que Gate e Task pertencem à fase do mesmo projeto', async () => {
    const phase = await prisma.phase.findFirstOrThrow({ where: { projectId, order: 0 } });
    await expect(prisma.$transaction(async (tx) => {
      const temporaryPhase = await tx.phase.create({ data: {
        projectId: fixtureProjectId, order: 0, name: 'Fixture temporária', description: 'Rollback de teste',
        plannedWeeks: 1, plannedJgm4Hours: 1,
      } });
      return tx.gate.create({ data: {
        projectId, phaseId: temporaryPhase.id, code: 'TESTE', title: 'Teste', question: 'Teste?',
      } });
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.task.create({ data: {
      projectId: fixtureProjectId, phaseId: phase.id, code: 'TESTE', title: 'Teste', objective: 'Teste',
      instructions: 'Teste', acceptanceCriteria: 'Teste',
    } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('reexecuta o seed sem duplicar nem sobrescrever os registros existentes', async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { phases: { include: { gate: true } }, tasks: true } });
    const seed = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], {
      cwd: resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, OLLEM_LEGACY_FIXTURE: 'true' },
    });
    expect(seed.status).toBe(0);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { phases: { include: { gate: true } }, tasks: true } });
    expect(after).toEqual(before);
  });
});
