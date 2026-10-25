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
import { ensurePlanCTemplate } from '../src/templates/plano-c.template';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 11 — templates reutilizáveis de projetos', () => {
  const schema = `jgm4_stage11_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, actor: process.env.JGM4_LOCAL_ACTOR };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!';
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: string, body?: object) => {
    const r = http()[method](path).set('Authorization', `Bearer ${token[who]}`); return body ? r.send(body) : method === 'get' || method === 'delete' ? r : r.send({});
  };
  const item = (template: string, kind: string, body: object) => call('post', `/api/admin/templates/${template}/items/${kind}`, 'admin', body);
  const project = (name: string, templateId?: string) => call('post', '/api/admin/projects', 'admin', { companyId: id.company, name, description: `Projeto ${name}`, ...(templateId ? { templateId } : {}) });

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
    id.company = (await prisma.company.create({ data: { name: 'Cliente Template' } })).id;
    for (const [key, role, company] of [['admin', 'JGM4_ADMIN', null], ['cons', 'JGM4_CONSULTANT', null], ['client', 'CLIENT_MANAGER', id.company]] as const)
      id[key] = (await prisma.user.create({ data: { name: `Usuário ${key}`, email: `${key}@teste.local`, passwordHash, role, companyId: company } })).id;
    for (const key of ['admin', 'cons', 'client']) token[key] = (await http().post('/api/auth/login').send({ email: `${key}@teste.local`, password: PASSWORD }).expect(200)).body.accessToken;
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['JGM4_LOCAL_ACTOR', saved.actor]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('22 e 23. o Plano C v1 é registrado como template ACTIVE sem seed e o registro é idempotente', async () => {
    const planC = await prisma.projectTemplate.findMany({ where: { code: 'PLAN_C' } });
    expect(planC).toHaveLength(1); expect(planC[0]).toMatchObject({ name: 'Plano C — Implantação Assistida', version: 1, status: 'ACTIVE' }); id.planc = planC[0].id;
    expect(await ensurePlanCTemplate(prisma)).toEqual({ created: false, id: id.planc });
    expect(await prisma.projectTemplate.count({ where: { code: 'PLAN_C' } })).toBe(1);
    expect(await prisma.project.count()).toBe(0); // nenhum projeto/seed necessário
    expect(await prisma.templatePhase.count({ where: { templateId: id.planc } })).toBe(5); expect(await prisma.templateTask.count({ where: { templateId: id.planc } })).toBe(planCTasks.length);
    expect(await prisma.templateRequest.count({ where: { templateId: id.planc } })).toBe(planCRequests.length);
  });

  it('1 e 2. admin cria template (DRAFT, auditado); consultor só lê os ativos; cliente não acessa', async () => {
    const created = await call('post', '/api/admin/templates', 'admin', { code: 'MINI', name: 'Modelo mínimo', description: 'Template de teste' }).expect(201);
    id.mini = created.body.id; expect(created.body).toMatchObject({ code: 'MINI', version: 1, status: 'DRAFT' });
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_CREATED', entityId: id.mini, projectId: null } })).toBe(1);
    await call('post', '/api/admin/templates', 'admin', { code: 'MINI', name: 'Duplicado', description: 'Mesmo código' }).expect(409);
    await call('post', '/api/admin/templates', 'admin', { code: 'minúsculo', name: 'Código inválido', description: 'x' }).expect(400);
    await call('post', '/api/admin/templates', 'cons', { code: 'OUTRO', name: 'Invasor', description: 'x' }).expect(403);
    await call('post', '/api/admin/templates', 'client', { code: 'OUTRO', name: 'Invasor', description: 'x' }).expect(403);
    await call('get', '/api/admin/templates', 'cons').expect(403); await call('get', '/api/admin/templates', 'client').expect(403);
    await call('patch', `/api/admin/templates/${id.mini}`, 'cons', { name: 'x' }).expect(403); await call('post', `/api/admin/templates/${id.planc}/new-version`, 'cons').expect(403);
    const active = (await call('get', '/api/templates/active', 'cons').expect(200)).body; expect(active.map((t: { code: string }) => t.code)).toEqual(['PLAN_C']);
    await call('get', '/api/templates/active', 'client').expect(403); await http().get('/api/admin/templates').expect(401);
  });

  it('3, 6 e 7. rascunho é editável (fases, atividades, Gates, solicitações, checklist, dependências); inválido e circular não ativam', async () => {
    await call('post', `/api/admin/templates/${id.mini}/activate`, 'admin', {}).expect(409); // vazio: sem fases
    const p0 = (await item(id.mini, 'phases', { order: 0, name: 'Início', description: 'Primeira fase', plannedWeeks: 2, plannedJgm4Hours: 12 }).expect(201)).body.id;
    const p1 = (await item(id.mini, 'phases', { order: 1, name: 'Fim', description: 'Segunda fase', plannedWeeks: 1, plannedJgm4Hours: 4 }).expect(201)).body.id;
    await item(id.mini, 'phases', { order: 1, name: 'Repetida', description: 'x' }).expect(409); // ordem duplicada
    await item(id.mini, 'phases', { order: 2, name: 'Horas negativas', description: 'x', plannedJgm4Hours: -1 }).expect(400);
    await item(id.mini, 'phases', { order: 2, name: 'Campo estranho', description: 'x', hacker: true }).expect(400);
    const base = { objective: 'Objetivo', instructions: 'Instruções', acceptanceCriteria: 'Aceite', responsibilityType: 'JOINT' };
    const a = (await item(id.mini, 'tasks', { ...base, phaseId: p0, code: 'A', title: 'Atividade A', plannedJgm4Hours: 8, plannedClientHours: 2, order: 0 }).expect(201)).body.id;
    const b = (await item(id.mini, 'tasks', { ...base, phaseId: p0, code: 'B', title: 'Atividade B', plannedJgm4Hours: 4, plannedClientHours: 1, order: 1 }).expect(201)).body.id;
    await item(id.mini, 'tasks', { ...base, phaseId: p1, code: 'C', title: 'Atividade C', plannedJgm4Hours: 4, order: 0 }).expect(201);
    await item(id.mini, 'checklist', { taskId: a, label: 'Fazer A' }).expect(201);
    const gate = (await item(id.mini, 'gates', { phaseId: p0, code: 'G0', title: 'Gate 0', question: 'Pronto?' }).expect(201)).body.id;
    await item(id.mini, 'criteria', { gateId: gate, code: 'G0-C01', description: 'Critério', order: 1 }).expect(201);
    const req = (await item(id.mini, 'requests', { phaseId: p0, code: 'S1', title: 'Solicitação', description: 'd', instructions: 'i', acceptanceCriteria: 'a', blocking: true, relativeDueDays: 7 }).expect(201)).body.id;
    await item(id.mini, 'requirements', { requestId: req, label: 'Requisito' }).expect(201);
    await item(id.mini, 'dependencies', { kind: 'REQUEST_FOR_TASK', fromCode: 'S1', toCode: 'A' }).expect(201);
    await item(id.mini, 'dependencies', { kind: 'TASK_BLOCKED_BY_GATE', fromCode: 'C', toCode: 'G0' }).expect(201);
    await item(id.mini, 'dependencies', { kind: 'TASK_AFTER_TASK', fromCode: 'A', toCode: 'B' }).expect(201);
    await item(id.mini, 'dependencies', { kind: 'TASK_AFTER_TASK', fromCode: 'B', toCode: 'A' }).expect(201); // fecha o ciclo A↔B
    const invalid = (await call('post', `/api/admin/templates/${id.mini}/validate`, 'admin').expect(200)).body;
    expect(invalid.valid).toBe(false); expect(invalid.errors.join(' ')).toMatch(/circular/i);
    const refused = await call('post', `/api/admin/templates/${id.mini}/activate`, 'admin', {}).expect(409); expect(JSON.stringify(refused.body)).toMatch(/circular/i);
    const cycle = await prisma.templateDependency.findFirstOrThrow({ where: { templateId: id.mini, fromCode: 'B' } });
    await call('delete', `/api/admin/templates/${id.mini}/items/dependencies/${cycle.id}`, 'admin').expect(200);
    await call('patch', `/api/admin/templates/${id.mini}/items/tasks/${b}`, 'admin', { title: 'Atividade B (editada)', plannedJgm4Hours: 4 }).expect(200);
    await call('patch', `/api/admin/templates/${id.planc}/items/tasks/${b}`, 'admin', { title: 'x' }).expect(409); // item de outro template (e o Plano C é ACTIVE)
    const valid = (await call('post', `/api/admin/templates/${id.mini}/validate`, 'admin').expect(200)).body; expect(valid).toMatchObject({ valid: true }); expect(valid.errors).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_VALIDATED', entityId: id.mini } })).toBeGreaterThanOrEqual(3);
    const preview = (await call('get', `/api/admin/templates/${id.mini}/preview`, 'admin').expect(200)).body; expect(preview.totals).toMatchObject({ phases: 2, tasks: 3, requests: 1, gates: 1 }); expect(preview.phases[0].gate.code).toBe('G0');
    const activated = (await call('post', `/api/admin/templates/${id.mini}/activate`, 'admin', {}).expect(200)).body; expect(activated.status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_ACTIVATED', entityId: id.mini } })).toBe(1);
  });

  it('4. template ACTIVE não sofre edição destrutiva da estrutura (metadados continuam editáveis)', async () => {
    const phase = await prisma.templatePhase.findFirstOrThrow({ where: { templateId: id.planc, order: 0 } });
    await item(id.planc, 'phases', { order: 9, name: 'Nova', description: 'x' }).expect(409);
    await call('patch', `/api/admin/templates/${id.planc}/items/phases/${phase.id}`, 'admin', { name: 'Alterada' }).expect(409);
    await call('delete', `/api/admin/templates/${id.planc}/items/phases/${phase.id}`, 'admin').expect(409);
    expect((await prisma.templatePhase.findUniqueOrThrow({ where: { id: phase.id } })).name).toBe('Organizar a base');
    await call('patch', `/api/admin/templates/${id.planc}`, 'admin', { description: 'Descrição ajustada sem mexer na estrutura' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_UPDATED', entityId: id.planc } })).toBe(1);
  });

  it('8–12, 35 e 36. projeto criado do Plano C v1 é equivalente à estrutura aprovada (5 fases, 5 Gates, 33 atividades, 10 solicitações, 198 h)', async () => {
    const created = await project('Projeto Plano C', id.planc).expect(201); id.p1 = created.body.id;
    expect(await prisma.phase.count({ where: { projectId: id.p1 } })).toBe(5); expect(await prisma.gate.count({ where: { projectId: id.p1 } })).toBe(5);
    expect(await prisma.task.count({ where: { projectId: id.p1 } })).toBe(33); expect(await prisma.projectRequest.count({ where: { projectId: id.p1 } })).toBe(10);
    const tasks = await prisma.task.findMany({ where: { projectId: id.p1 }, include: { predecessor: true, gate: true, requirements: true, phase: true } });
    expect(tasks.reduce((total, task) => total + Number(task.plannedJgm4Hours), 0)).toBe(198);
    const byPhase = [0, 1, 2, 3, 4].map((order) => tasks.filter((task) => task.phase.order === order).reduce((total, task) => total + Number(task.plannedJgm4Hours), 0)); expect(byPhase).toEqual([36, 39, 47, 39, 37]);
    expect((await prisma.phase.findMany({ where: { projectId: id.p1 }, orderBy: { order: 'asc' } })).map((phase) => phase.plannedJgm4Hours)).toEqual([36, 39, 47, 39, 37]);
    for (const expected of planCTasks) {
      const task = tasks.find((t) => t.code === expected.code)!;
      expect(task).toBeDefined(); expect(task.phase.order).toBe(expected.phase); expect(Number(task.plannedJgm4Hours)).toBe(expected.jgm4); expect(Number(task.plannedClientHours)).toBe(expected.client);
      expect(task.predecessor?.code ?? null).toBe(expected.predecessor); expect(task.gate?.code ?? null).toBe(expected.phase > 0 ? `GATE-${expected.phase - 1}` : null);
      expect(task.requirements.map((r) => r.label).sort()).toEqual(['Executar as atividades previstas.', 'Registrar evidências do resultado.']);
    }
    const gates = await prisma.gate.findMany({ where: { projectId: id.p1 }, include: { criteria: true }, orderBy: { code: 'asc' } }); gates.forEach((gate, index) => expect(gate.criteria).toHaveLength(planCCriteria[index].length));
    const requests = await prisma.projectRequest.findMany({ where: { projectId: id.p1 }, include: { requirements: true, task: true } });
    for (const definition of planCRequests) { const request = requests.find((r) => r.code === definition.code)!; expect(request.blocking).toBe(definition.blocking); expect(request.requirements).toHaveLength(definition.requirements.length); expect(request.status).toBe(definition.phase === 0 ? 'AVAILABLE' : 'BLOCKED'); }
    expect(requests.find((r) => r.code === 'SOL-006')?.task?.code).toBe('C05');
    expect((await prisma.phase.findFirstOrThrow({ where: { projectId: id.p1, order: 0 } })).status).toBe('AVAILABLE');
    const released = tasks.filter((t) => t.status === 'RELEASED').map((t) => t.code).sort(); expect(released.length).toBeGreaterThan(0); // mesma regra de liberação do seed
    // 19. snapshot
    expect(await prisma.project.findUniqueOrThrow({ where: { id: id.p1 } })).toMatchObject({ templateId: id.planc, templateVersion: 1, templateNameSnapshot: 'Plano C — Implantação Assistida', templateVersionSnapshot: 1, methodology: 'PLANO_C' });
    expect(await prisma.auditLog.count({ where: { projectId: id.p1, action: 'PROJECT_CREATED_FROM_TEMPLATE' } })).toBe(1);
  }, 90000);

  it('13, 14 e 15. nada de execução é copiado (horas, evidências, aprovações, auditoria, usuários e vínculos)', async () => {
    const task = await prisma.task.findFirstOrThrow({ where: { projectId: id.p1, code: 'C00' } });
    await prisma.timeEntry.create({ data: { projectId: id.p1, phaseId: task.phaseId, taskId: task.id, organizationType: 'JGM4', date: new Date(), hours: 2, description: 'Horas reais' } });
    await prisma.taskEvidence.create({ data: { projectId: id.p1, phaseId: task.phaseId, taskId: task.id, description: 'Evidência real' } });
    await prisma.approval.create({ data: { projectId: id.p1, type: 'REQUEST_REVIEW', entityType: 'Task', entityId: task.id, entityCode: 'C00', title: 'Aprovação real', description: 'x', assignedRole: 'JGM4_CONSULTANT' } });
    const second = (await project('Segundo projeto Plano C', id.planc).expect(201)).body.id;
    expect(await prisma.timeEntry.count({ where: { projectId: second } })).toBe(0); expect(await prisma.taskEvidence.count({ where: { projectId: second } })).toBe(0);
    expect(await prisma.approval.count({ where: { projectId: second } })).toBe(0); expect(await prisma.projectMembership.count({ where: { projectId: second } })).toBe(0);
    const actions = new Set((await prisma.auditLog.findMany({ where: { projectId: second } })).map((log) => log.action));
    expect([...actions].sort()).toEqual(['CREATED', 'PLAN_CREATED', 'PROJECT_CREATED', 'PROJECT_CREATED_FROM_TEMPLATE', 'RELEASED']);
    expect(await prisma.task.count({ where: { projectId: second, status: { in: ['COMPLETED', 'IN_PROGRESS'] } } })).toBe(0);
    expect((await prisma.task.findMany({ where: { projectId: second }, select: { actualStartDate: true, actualEndDate: true } })).every((t) => !t.actualStartDate && !t.actualEndDate)).toBe(true);
    id.p2 = second;
  }, 90000);

  it('5, 16 e 13. nova versão copia a estrutura; alterar o rascunho/ativar v2 não altera projetos existentes', async () => {
    await call('post', `/api/admin/templates/${id.mini}/new-version`, 'cons').expect(403);
    const v2 = (await call('post', `/api/admin/templates/${id.planc}/new-version`, 'admin').expect(201)).body; id.planc2 = v2.id;
    expect(v2).toMatchObject({ code: 'PLAN_C', version: 2, status: 'DRAFT', phases: 5, tasks: 33, gates: 5, requests: 10 });
    expect(await prisma.templateChecklistItem.count({ where: { task: { templateId: id.planc2 } } })).toBe(66);
    expect(await prisma.templateDependency.count({ where: { templateId: id.planc2 } })).toBe(await prisma.templateDependency.count({ where: { templateId: id.planc } }));
    await call('post', `/api/admin/templates/${id.planc}/new-version`, 'admin').expect(409); // já existe rascunho
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_VERSION_CREATED', entityId: id.planc2 } })).toBe(1);
    const before = await prisma.task.findMany({ where: { projectId: id.p1 }, orderBy: { code: 'asc' }, select: { code: true, title: true, plannedJgm4Hours: true, plannedClientHours: true } });
    // v2: muda horas e título de C00 e remove uma solicitação; v1 e projetos seguem iguais
    const c00 = await prisma.templateTask.findFirstOrThrow({ where: { templateId: id.planc2, code: 'C00' } });
    await call('patch', `/api/admin/templates/${id.planc2}/items/tasks/${c00.id}`, 'admin', { title: 'Kick-off (v2)', plannedJgm4Hours: 10 }).expect(200);
    const sol = await prisma.templateRequest.findFirstOrThrow({ where: { templateId: id.planc2, code: 'SOL-003' } });
    await call('delete', `/api/admin/templates/${id.planc2}/items/requests/${sol.id}`, 'admin').expect(200);
    const validation = (await call('post', `/api/admin/templates/${id.planc2}/validate`, 'admin').expect(200)).body; expect(validation.valid).toBe(true); expect(validation.warnings.join(' ')).toMatch(/horas JGM4 da fase/);
    await call('post', `/api/admin/templates/${id.planc2}/activate`, 'admin', { inactivatePrevious: true }).expect(200);
    expect((await prisma.projectTemplate.findUniqueOrThrow({ where: { id: id.planc } })).status).toBe('INACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_INACTIVATED', entityId: id.planc } })).toBe(1);
    const after = await prisma.task.findMany({ where: { projectId: id.p1 }, orderBy: { code: 'asc' }, select: { code: true, title: true, plannedJgm4Hours: true, plannedClientHours: true } });
    expect(after).toEqual(before); expect(await prisma.projectRequest.count({ where: { projectId: id.p1 } })).toBe(10);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: id.p1 } })).toMatchObject({ templateVersion: 1, templateVersionSnapshot: 1 });
    // novo projeto usa v2; v1 inativo não pode mais ser usado
    await project('Projeto na v1 inativa', id.planc).expect(409);
    const p3 = (await project('Projeto v2', id.planc2).expect(201)).body.id; expect(await prisma.projectRequest.count({ where: { projectId: p3 } })).toBe(9);
    expect(await prisma.task.findFirstOrThrow({ where: { projectId: p3, code: 'C00' } })).toMatchObject({ title: 'Kick-off (v2)' }); expect(Number((await prisma.task.findFirstOrThrow({ where: { projectId: p3, code: 'C00' } })).plannedJgm4Hours)).toBe(10);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: p3 } })).toMatchObject({ templateVersion: 2, templateVersionSnapshot: 2 });
  }, 120000);

  it('17 e 18. template arquivado some da lista de novos projetos e os projetos existentes continuam funcionando', async () => {
    await call('post', `/api/admin/templates/${id.mini}/archive`, 'admin').expect(200);
    expect((await call('get', '/api/templates/active', 'admin').expect(200)).body.map((t: { code: string; version: number }) => `${t.code}@${t.version}`)).toEqual(['PLAN_C@2']);
    await project('Projeto em template arquivado', id.mini).expect(409);
    await call('post', `/api/admin/templates/${id.mini}/new-version`, 'admin').expect(409); await call('patch', `/api/admin/templates/${id.mini}`, 'admin', { name: 'Nome válido' }).expect(409);
    expect(await prisma.auditLog.count({ where: { action: 'TEMPLATE_ARCHIVED', entityId: id.mini } })).toBe(1);
    // arquiva também a v1 usada pelo projeto p1: o projeto segue consultável e com snapshot
    await call('post', `/api/admin/templates/${id.planc}/archive`, 'admin').expect(200);
    await call('get', `/api/projects/${id.p1}`, 'admin').expect(200); expect((await call('get', `/api/projects/${id.p1}/tasks`, 'admin').expect(200)).body).toHaveLength(33);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: id.p1 } })).toMatchObject({ templateNameSnapshot: 'Plano C — Implantação Assistida', templateVersionSnapshot: 1 });
    // projeto antigo, criado sem template (fluxo da 10A), continua existindo e a compatibilidade usePlanC usa a versão ativa
    const plain = await project('Projeto sem template').expect(201); expect(plain.body).toMatchObject({ hasStructure: false });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: plain.body.id } })).templateId).toBeNull();
    await call('get', `/api/projects/${plain.body.id}`, 'admin').expect(200);
    const applied = await call('post', `/api/admin/projects/${plain.body.id}/apply-template`, 'admin', { templateId: id.planc2 }).expect(200); expect(applied.body).toMatchObject({ phases: 5, tasks: 33 });
    await call('post', `/api/admin/projects/${plain.body.id}/apply-template`, 'admin', { templateId: id.planc2 }).expect(409); // já tem estrutura
    const legacy = await call('post', '/api/admin/projects', 'admin', { companyId: id.company, name: 'Compat 10A', description: 'usePlanC', usePlanC: true }).expect(201); expect(legacy.body.hasStructure).toBe(true);
  }, 120000);
});
