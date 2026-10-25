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
import { ensureApproval } from '../src/approvals/approval-sync';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

describe('Etapa 5 — Central de Aprovações, alçadas e próxima ação', () => {
  const schema = `jgm4_stage5_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!; const originalActor = process.env.JGM4_LOCAL_ACTOR;
  const pool = new Pool({ connectionString: originalUrl });
  let app: INestApplication; let prisma: PrismaService;
  let P: string; let Q: string; let R: string; let companyId: string;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const post = (path: string, role?: string, body: object = {}) => { const r = http().post(path); if (role) r.set('x-actor-role', role); return r.send(body); };
  const get = (path: string, role?: string) => { const r = http().get(path); if (role) r.set('x-actor-role', role); return r; };
  const approvalOf = (entityId: string, type: string) => prisma.approval.findFirstOrThrow({ where: { entityId, type: type as never }, orderBy: { requestedAt: 'desc' } });
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

  async function task(projectId: string, phaseId: string, code: string, data: Record<string, unknown> = {}) {
    return prisma.task.create({ data: { projectId, phaseId, code, title: `Atividade ${code}`, objective: `Objetivo ${code}`, instructions: 'Teste', acceptanceCriteria: 'Teste', ...data } as never });
  }

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
      for (const folder of ['20261022000100_initial', '20261022000200_requests', '20261023000100_task_workflow', '20261023000200_gates', '20261024000100_approvals', '20261025000100_auth', '20261026000100_project_status_values', '20261026000200_project_status_data', '20261027000100_reports', '20261028000100_security','20261101000100_admin_ops','20261102000100_project_templates', '20261103000100_ollem_revision', '20261103000200_gate_required']) {
        const migration = readFileSync(resolve(__dirname, `../prisma/migrations/${folder}/migration.sql`), 'utf8');
        if (folder === '20261023000200_gates') { const boundary = migration.indexOf('-- The first phase remains'); await client.query(migration.slice(0, boundary)); await client.query(migration.slice(boundary)); }
        else await client.query(migration);
      }
    } finally { client.release(); }
    const url = new URL(originalUrl); url.searchParams.set('schema', schema); process.env.DATABASE_URL = url.toString(); process.env.JGM4_LOCAL_ACTOR = 'JGM4';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);

    const company = await prisma.company.create({ data: { name: 'Cliente Etapa 5' } }); companyId = company.id;
    const user = (name: string, role: string, withCompany: boolean) => prisma.user.create({ data: { name, email: `${randomUUID()}@teste.local`, passwordHash: 'x', role: role as never, companyId: withCompany ? companyId : null } });
    ids.jgm4User = (await user('Consultor JGM4', 'JGM4_CONSULTANT', false)).id;
    ids.client1 = (await user('Gestor Um', 'CLIENT_MANAGER', true)).id; ids.client2 = (await user('Gestor Dois', 'CLIENT_MANAGER', true)).id;

    // Projeto P: fluxo de solicitações, atividades e alterações (fase 0 aberta, Gate 0 bloqueado por tarefas pendentes).
    P = (await prisma.project.create({ data: { companyId, name: 'Projeto P', description: 'Fixture Etapa 5' } })).id;
    const p0 = await prisma.phase.create({ data: { projectId: P, order: 0, name: 'Fase 0', description: 'F0', plannedWeeks: 3, plannedJgm4Hours: 36, status: 'AVAILABLE' } });
    await prisma.gate.create({ data: { projectId: P, phaseId: p0.id, code: 'GATE-0', title: 'Gate P0', question: 'Pronto?' } });
    const withEvidence = async (code: string) => {
      const t = await task(P, p0.id, code, { status: 'WAITING_EVIDENCE', currentOwnerType: 'CLIENT' });
      await prisma.taskEvidence.create({ data: { projectId: P, phaseId: p0.id, taskId: t.id, description: `Evidência de ${code}` } });
      ids[code] = t.id;
    };
    for (const code of ['TV', 'TB', 'TX']) await withEvidence(code);
    ids.TD = (await task(P, p0.id, 'TD', { status: 'IN_PROGRESS', plannedStartDate: new Date('2026-01-05'), plannedEndDate: new Date('2026-01-15') })).id;
    ids.TE = (await task(P, p0.id, 'TE', { status: 'IN_PROGRESS', plannedStartDate: new Date('2026-01-05'), plannedEndDate: new Date('2026-01-20') })).id;
    ids.TR = (await task(P, p0.id, 'TR', { status: 'IN_PROGRESS', clientResponsibleUserId: ids.client1 })).id;
    ids.TC = (await task(P, p0.id, 'TC', { status: 'COMPLETED', actualEndDate: new Date('2026-01-10') })).id;
    const req = async (code: string, data: Record<string, unknown> = {}) => {
      const r = await prisma.projectRequest.create({ data: { projectId: P, phaseId: p0.id, code, title: `Solicitação ${code}`, description: `Descrição ${code}`, instructions: 'Teste', acceptanceCriteria: 'Teste', mandatory: false, blocking: false, ...data } as never });
      await prisma.requestRequirement.create({ data: { requestId: r.id, label: 'Item único', completed: true } });
      ids[code] = r.id;
    };
    await req('SOL-1', { status: 'CLIENT_PREPARING' }); await req('SOL-2', { status: 'CLIENT_PREPARING', mandatory: true, blocking: true });
    await req('SOL-3', { status: 'REQUESTED' }); await req('SOL-4', { status: 'REQUESTED', mandatory: true, blocking: true });

    // Projeto Q: Gate com todas as atividades concluídas → fica disponível ao consultar.
    Q = (await prisma.project.create({ data: { companyId, name: 'Projeto Q', description: 'Fixture de Gate' } })).id;
    const q0 = await prisma.phase.create({ data: { projectId: Q, order: 0, name: 'Fase 0', description: 'F0', plannedWeeks: 3, plannedJgm4Hours: 36, status: 'AVAILABLE' } });
    const q1 = await prisma.phase.create({ data: { projectId: Q, order: 1, name: 'Fase 1', description: 'F1', plannedWeeks: 3, plannedJgm4Hours: 39, status: 'LOCKED' } });
    ids.gateQ = (await prisma.gate.create({ data: { projectId: Q, phaseId: q0.id, code: 'GATE-0', title: 'Base organizada', question: 'A base está organizada?' } })).id;
    await prisma.gate.create({ data: { projectId: Q, phaseId: q1.id, code: 'GATE-1', title: 'Controle', question: 'Controle funciona?' } });
    await prisma.gateCriterion.create({ data: { gateId: ids.gateQ, code: 'G0-C01', description: 'Atividades concluídas', sourceType: 'TASK' } });
    ids.QC = (await task(Q, q0.id, 'QC', { status: 'COMPLETED' })).id;
    R = (await prisma.project.create({ data: { companyId, name: 'Projeto R', description: 'Fixture de reabertura e correção' } })).id;
    const r0 = await prisma.phase.create({ data: { projectId: R, order: 0, name: 'Fase 0', description: 'F0', plannedWeeks: 3, plannedJgm4Hours: 36, status: 'AVAILABLE' } });
    ids.gateR = (await prisma.gate.create({ data: { projectId: R, phaseId: r0.id, code: 'GATE-0', title: 'Base R', question: 'Pronto?' } })).id;
    await prisma.gateCriterion.create({ data: { gateId: ids.gateR, code: 'G0-C01', description: 'Atividades concluídas', sourceType: 'TASK' } });
    ids.RC = (await task(R, r0.id, 'RC', { status: 'COMPLETED' })).id;
    ids.Q1 = (await task(Q, q1.id, 'Q1', { status: 'BLOCKED', blockedByGateId: ids.gateQ })).id;
  }, 90000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    if (originalActor === undefined) delete process.env.JGM4_LOCAL_ACTOR; else process.env.JGM4_LOCAL_ACTOR = originalActor;
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('1. envio de solicitação cria Approval REQUEST_REVIEW para a JGM4', async () => {
    await post(`/api/projects/${P}/requests/${ids['SOL-1']}/send`, 'CLIENT_MANAGER').expect(200);
    await post(`/api/projects/${P}/requests/${ids['SOL-2']}/send`, 'CLIENT_MANAGER').expect(200);
    const approval = await approvalOf(ids['SOL-1'], 'REQUEST_REVIEW');
    expect(approval).toMatchObject({ status: 'PENDING', entityCode: 'SOL-1', assignedRole: 'JGM4_CONSULTANT', requestedByRole: 'CLIENT_MANAGER', priority: 'NORMAL' });
    expect((await approvalOf(ids['SOL-2'], 'REQUEST_REVIEW')).priority).toBe('HIGH');
  });
  it('2. envio de atividade para validação cria Approval TASK_VALIDATION', async () => {
    for (const code of ['TV', 'TB', 'TX']) await post(`/api/tasks/${ids[code]}/submit-evidence`, 'CLIENT_MANAGER').expect(201);
    const approval = await approvalOf(ids.TV, 'TASK_VALIDATION');
    expect(approval).toMatchObject({ status: 'PENDING', entityCode: 'TV', assignedRole: 'JGM4_CONSULTANT' });
  });
  it('3. Gate que fica disponível cria o parecer técnico JGM4', async () => {
    const { body } = await get(`/api/projects/${Q}/gates`).expect(200);
    expect(body[0].status).toBe('AVAILABLE');
    expect(await approvalOf(ids.gateQ, 'GATE_TECHNICAL_OPINION')).toMatchObject({ status: 'PENDING', priority: 'HIGH', assignedRole: 'JGM4_CONSULTANT', entityCode: 'GATE-0' });
  });
  it('5. não cria Approval duplicada (workflow, função e índice do banco)', async () => {
    await get(`/api/projects/${Q}/gates`).expect(200); await get(`/api/projects/${Q}/gates/${ids.gateQ}`).expect(200);
    const input = { projectId: Q, type: 'GATE_TECHNICAL_OPINION' as const, entityType: 'Gate', entityId: ids.gateQ, title: 'x', description: 'x', assignedRole: 'JGM4_CONSULTANT' as const };
    const again = await prisma.$transaction((tx) => ensureApproval(tx, input));
    expect(again.created).toBe(false);
    expect(await prisma.approval.count({ where: { entityId: ids.gateQ, type: 'GATE_TECHNICAL_OPINION' } })).toBe(1);
    await expect(prisma.approval.create({ data: { ...input, status: 'PENDING' } })).rejects.toThrow();
  });
  it('17. contagem de pendências por perfil (cards e badge) é correta', async () => {
    const open = await prisma.approval.findMany({ where: { status: { in: ['PENDING', 'IN_REVIEW'] } } });
    const jgm4Types = ['REQUEST_REVIEW', 'TASK_VALIDATION', 'GATE_TECHNICAL_OPINION'];
    const expected = open.filter((item) => jgm4Types.includes(item.type));
    const { body: consultant } = await get('/api/approvals/summary', 'JGM4_CONSULTANT').expect(200);
    expect(consultant).toMatchObject({ role: 'JGM4_CONSULTANT', total: expected.length, requests: 2, tasks: 3, gates: 1, changes: 0 });
    const { body: admin } = await get('/api/approvals/summary').expect(200);
    expect(admin).toMatchObject({ role: 'JGM4_ADMIN', total: 6 });
    expect((await get('/api/approvals/summary', 'CLIENT_MANAGER').expect(200)).body.total).toBe(0);
    expect((await get('/api/approvals/summary', 'CLIENT_SPONSOR').expect(200)).body.total).toBe(0);
    expect((await get(`/api/approvals/summary?projectId=${Q}`).expect(200)).body).toMatchObject({ total: 1, gates: 1 });
    const { body: list } = await get('/api/approvals?category=TASKS', 'JGM4_ADMIN').expect(200);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ category: 'TASKS', owner: { type: 'JGM4' }, nextAction: expect.any(String), impact: expect.any(String), canDecide: true });
    expect((await get('/api/approvals?priority=high', 'JGM4_ADMIN').expect(200)).body.every((item: any) => ['HIGH', 'CRITICAL'].includes(item.priority))).toBe(true);
    await get('/api/approvals?category=INVALIDA').expect(400);
  });
  it('6. perfil sem alçada não aprova', async () => {
    const approval = await approvalOf(ids['SOL-1'], 'REQUEST_REVIEW');
    for (const role of ['CLIENT_MANAGER', 'CLIENT_SPONSOR', 'CLIENT_USER']) await post(`/api/approvals/${approval.id}/approve`, role).expect(403);
    const gateApproval = await approvalOf(ids.gateQ, 'GATE_TECHNICAL_OPINION');
    await post(`/api/approvals/${gateApproval.id}/approve`, 'CLIENT_MANAGER', { technicalOpinion: 'Tentativa' }).expect(403);
    await post(`/api/approvals/${gateApproval.id}/approve`, 'CLIENT_SPONSOR', { technicalOpinion: 'Cliente não emite parecer técnico' }).expect(403);
    expect((await approvalOf(ids['SOL-1'], 'REQUEST_REVIEW')).status).toBe('PENDING');
    expect((await prisma.projectRequest.findUniqueOrThrow({ where: { id: ids['SOL-1'] } })).status).toBe('SENT_TO_JGM4');
  });
  it('7. JGM4 aprova solicitação pela Central', async () => {
    const approval = await approvalOf(ids['SOL-1'], 'REQUEST_REVIEW');
    const { body: detail } = await get(`/api/approvals/${approval.id}`, 'JGM4_CONSULTANT').expect(200);
    expect(detail.context).toMatchObject({ kind: 'REQUEST', code: 'SOL-1' }); expect(detail.context.requirements).toHaveLength(1);
    const { body } = await post(`/api/approvals/${approval.id}/approve`, 'JGM4_CONSULTANT', { comment: 'Conforme' }).expect(200);
    expect(body).toMatchObject({ status: 'APPROVED', decision: 'APPROVED', decidedByRole: 'JGM4_CONSULTANT' });
    expect((await prisma.projectRequest.findUniqueOrThrow({ where: { id: ids['SOL-1'] } })).status).toBe('ACCEPTED');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN').expect(409);
  });
  it('8. JGM4 solicita ajuste (motivo + instrução) e o workflow original registra', async () => {
    const approval = await approvalOf(ids.TB, 'TASK_VALIDATION');
    await post(`/api/approvals/${approval.id}/request-adjustment`, 'JGM4_CONSULTANT', { comment: 'Foto ilegível' }).expect(400);
    const { body } = await post(`/api/approvals/${approval.id}/request-adjustment`, 'JGM4_CONSULTANT', { comment: 'Foto ilegível', instructions: 'Refazer o registro fotográfico', suggestedDueDate: '2026-11-20' }).expect(200);
    expect(body).toMatchObject({ status: 'ADJUSTMENT_REQUESTED', decision: 'ADJUSTMENT_REQUESTED' });
    expect(body.decisionComment).toContain('Refazer o registro fotográfico'); expect(body.decisionComment).toContain('20/11/2026');
    const t = await prisma.task.findUniqueOrThrow({ where: { id: ids.TB } });
    expect(t.status).toBe('ADJUSTMENT_REQUESTED'); expect(t.nextAction).toContain('Refazer o registro fotográfico');
    expect(await prisma.auditLog.count({ where: { entityType: 'Task', entityId: ids.TB, action: 'REQUEST_ADJUSTMENT' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: 'Approval', entityId: approval.id, action: 'APPROVAL_ADJUSTMENT_REQUESTED' } })).toBe(1);
    // solicitação: ajuste também é registrado na própria solicitação
    const sol = await approvalOf(ids['SOL-2'], 'REQUEST_REVIEW');
    await post(`/api/approvals/${sol.id}/request-adjustment`, 'JGM4_ADMIN', { comment: 'Falta croqui', instructions: 'Anexar croqui' }).expect(200);
    expect((await prisma.projectRequest.findUniqueOrThrow({ where: { id: ids['SOL-2'] } })).status).toBe('ADJUSTMENT_REQUESTED');
    expect(await prisma.auditLog.count({ where: { entityType: 'ProjectRequest', entityId: ids['SOL-2'], action: 'ADJUSTMENT_REQUESTED' } })).toBe(1);
  });
  it('rejeitar exige motivo, devolve a atividade e registra a decisão como REJECTED', async () => {
    const approval = await approvalOf(ids.TX, 'TASK_VALIDATION');
    await post(`/api/approvals/${approval.id}/reject`, 'JGM4_ADMIN').expect(400);
    const { body } = await post(`/api/approvals/${approval.id}/reject`, 'JGM4_ADMIN', { comment: 'Evidência não corresponde à atividade' }).expect(200);
    expect(body).toMatchObject({ status: 'REJECTED', decision: 'REJECTED' });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.TX } })).status).toBe('ADJUSTMENT_REQUESTED');
  });
  it('9. cliente não valida atividade que aguarda a JGM4', async () => {
    await post(`/api/tasks/${ids.TV}/validate`, 'CLIENT_MANAGER').expect(403);
    await post(`/api/tasks/${ids.TV}/validate`, 'CLIENT_SPONSOR').expect(403);
    const approval = await approvalOf(ids.TV, 'TASK_VALIDATION');
    await post(`/api/approvals/${approval.id}/approve`, 'CLIENT_MANAGER').expect(403);
    const { body } = await post(`/api/approvals/${approval.id}/approve`, 'JGM4_CONSULTANT', { comment: 'Evidências conferidas' }).expect(200);
    expect(body.status).toBe('APPROVED'); expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.TV } })).status).toBe('VALIDATED');
  });
  it('4. parecer técnico favorável cria a decisão do patrocinador Ollem (e só ela)', async () => {
    const tech = await approvalOf(ids.gateQ, 'GATE_TECHNICAL_OPINION');
    await post(`/api/approvals/${tech.id}/approve`, 'JGM4_CONSULTANT', {}).expect(400);
    const { body } = await post(`/api/approvals/${tech.id}/approve`, 'JGM4_CONSULTANT', { technicalOpinion: 'Critérios e evidências atendidos.' }).expect(200);
    expect(body.status).toBe('APPROVED');
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: ids.gateQ } })).status).toBe('TECHNICALLY_APPROVED');
    const client = await approvalOf(ids.gateQ, 'GATE_CLIENT_DECISION');
    expect(client).toMatchObject({ status: 'PENDING', assignedRole: 'CLIENT_SPONSOR', entityCode: 'GATE-0' });
    expect((await prisma.phase.findFirstOrThrow({ where: { projectId: Q, order: 1 } })).status).toBe('LOCKED');
    const { body: sponsor } = await get('/api/approvals', 'CLIENT_SPONSOR').expect(200);
    expect(sponsor.map((item: any) => item.type)).toEqual(['GATE_CLIENT_DECISION']);
    expect((await get('/api/approvals', 'JGM4_ADMIN').expect(200)).body.some((item: any) => item.type === 'GATE_CLIENT_DECISION')).toBe(false);
  });
  it('11. CLIENT_MANAGER (e a JGM4) não decidem o Gate', async () => {
    const client = await approvalOf(ids.gateQ, 'GATE_CLIENT_DECISION');
    await post(`/api/gates/${ids.gateQ}/client-decision`, 'CLIENT_MANAGER', { clientDecision: 'APPROVE' }).expect(403);
    await post(`/api/approvals/${client.id}/approve`, 'CLIENT_MANAGER').expect(403);
    await post(`/api/approvals/${client.id}/approve`, 'JGM4_ADMIN').expect(403);
    await post(`/api/gates/${ids.gateQ}/technical-opinion`, 'CLIENT_SPONSOR', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'x' }).expect(403);
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: ids.gateQ } })).status).toBe('TECHNICALLY_APPROVED');
  });
  it('10. CLIENT_SPONSOR decide o Gate pela Central e libera a fase seguinte', async () => {
    const client = await approvalOf(ids.gateQ, 'GATE_CLIENT_DECISION');
    const hold = await post(`/api/approvals/${client.id}/request-adjustment`, 'CLIENT_SPONSOR', { comment: 'Aguardar reunião', instructions: 'Retomar na segunda' }).expect(200);
    expect(hold.body.status).toBe('PENDING');
    const { body } = await post(`/api/approvals/${client.id}/approve`, 'CLIENT_SPONSOR', { comment: 'Avançar' }).expect(200);
    expect(body).toMatchObject({ status: 'APPROVED', decidedByRole: 'CLIENT_SPONSOR' });
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: ids.gateQ } })).status).toBe('APPROVED');
    expect((await prisma.phase.findFirstOrThrow({ where: { projectId: Q, order: 1 } })).status).toBe('AVAILABLE');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.Q1 } })).status).toBe('RELEASED');
  });
  it('12. alteração de prazo exige aprovação: atividade ativa não muda direto', async () => {
    await post(`/api/tasks/${ids.TD}/due-date-change`, 'CLIENT_USER', { requestedDate: '2026-11-05', justification: 'Sem permissão' }).expect(403);
    await post(`/api/tasks/${ids.TD}/due-date-change`, 'CLIENT_MANAGER', { requestedDate: '2026-01-15', justification: 'Mesmo prazo' }).expect(400);
    const { body } = await post(`/api/tasks/${ids.TD}/due-date-change`, 'CLIENT_MANAGER', { requestedDate: '2026-11-05', justification: 'Dependência de fornecedor', expectedImpact: 'Gate 0 atrasa 3 semanas' }).expect(201);
    expect(body).toMatchObject({ type: 'DUE_DATE_CHANGE', status: 'PENDING', assignedRole: 'JGM4_ADMIN', priority: 'HIGH', overdue: true });
    expect(body.payload).toMatchObject({ currentDate: '2026-01-15', newDate: '2026-11-05' });
    await post(`/api/tasks/${ids.TD}/due-date-change`, 'CLIENT_MANAGER', { requestedDate: '2026-12-01', justification: 'Duplicada' }).expect(409);
    const direct = await http().patch(`/api/tasks/${ids.TD}/plan`).send({ plannedEndDate: '2026-11-05' });
    expect(direct.status).toBe(409);
    expect(iso((await prisma.task.findUniqueOrThrow({ where: { id: ids.TD } })).plannedEndDate)).toBe('2026-01-15');
    const { body: list } = await get('/api/approvals?category=CHANGES&due=overdue', 'JGM4_ADMIN').expect(200);
    expect(list.map((item: any) => item.type)).toContain('DUE_DATE_CHANGE');
    expect((await get('/api/approvals?category=CHANGES', 'JGM4_CONSULTANT').expect(200)).body).toHaveLength(0);
  });
  it('13. alteração aprovada atualiza o prazo e registra anterior, novo, solicitante e aprovador', async () => {
    const approval = await approvalOf(ids.TD, 'DUE_DATE_CHANGE');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_CONSULTANT').expect(403);
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN', { comment: 'Aceito' }).expect(200);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: ids.TD } });
    expect(iso(updated.plannedEndDate)).toBe('2026-11-05');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Task', entityId: ids.TD, action: 'DUE_DATE_CHANGED' } });
    expect(log.oldValue).toMatchObject({ plannedEndDate: '2026-01-15' });
    expect(log.newValue).toMatchObject({ plannedEndDate: '2026-11-05', requestedByRole: 'CLIENT_MANAGER', decidedByRole: 'JGM4_ADMIN', approvalId: approval.id });
    // agora que a mudança foi decidida, uma nova solicitação é permitida
    await post(`/api/tasks/${ids.TD}/due-date-change`, 'JGM4_CONSULTANT', { requestedDate: '2026-11-10', justification: 'Novo pedido legítimo' }).expect(201);
  });
  it('14. alteração rejeitada preserva o prazo', async () => {
    await post(`/api/tasks/${ids.TE}/due-date-change`, 'CLIENT_SPONSOR', { requestedDate: '2026-12-31', justification: 'Atraso geral' }).expect(201);
    const approval = await approvalOf(ids.TE, 'DUE_DATE_CHANGE');
    const { body } = await post(`/api/approvals/${approval.id}/reject`, 'JGM4_ADMIN', { comment: 'Prazo contratual' }).expect(200);
    expect(body).toMatchObject({ status: 'REJECTED', decision: 'REJECTED' });
    expect(iso((await prisma.task.findUniqueOrThrow({ where: { id: ids.TE } })).plannedEndDate)).toBe('2026-01-20');
    expect(await prisma.auditLog.count({ where: { entityType: 'Task', entityId: ids.TE, action: 'DUE_DATE_CHANGE_REJECTED' } })).toBe(1);
  });
  it('troca de responsável só é aplicada após aprovação e valida a organização do usuário', async () => {
    await post(`/api/tasks/${ids.TR}/responsible-change`, 'CLIENT_MANAGER', { field: 'CLIENT', newUserId: ids.jgm4User, justification: 'Usuário errado' }).expect(400);
    await post(`/api/tasks/${ids.TR}/responsible-change`, 'CLIENT_MANAGER', { field: 'CLIENT', newUserId: ids.client2, justification: 'Sem vínculo com o projeto' }).expect(400); // novo responsável precisa ter vínculo ativo
    await prisma.projectMembership.create({ data: { projectId: P, userId: ids.client2 } });
    await post(`/api/tasks/${ids.TR}/responsible-change`, 'CLIENT_MANAGER', { field: 'CLIENT', newUserId: ids.client2, justification: 'Férias do responsável' }).expect(201);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.TR } })).clientResponsibleUserId).toBe(ids.client1);
    const approval = await approvalOf(ids.TR, 'RESPONSIBLE_CHANGE');
    expect(approval.payload).toMatchObject({ currentName: 'Gestor Um', newName: 'Gestor Dois' });
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN').expect(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.TR } })).clientResponsibleUserId).toBe(ids.client2);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Task', entityId: ids.TR, action: 'RESPONSIBLE_CHANGED' } });
    expect(log.oldValue).toMatchObject({ clientResponsibleUserId: ids.client1, name: 'Gestor Um' }); expect(log.newValue).toMatchObject({ clientResponsibleUserId: ids.client2, name: 'Gestor Dois' });
  });
  it('15. reabertura exige JGM4_ADMIN, motivo, e COMPLETED não volta direto', async () => {
    await post(`/api/tasks/${ids.TC}/start`, undefined).expect(409);
    await post(`/api/tasks/${ids.TC}/reopen`, 'CLIENT_MANAGER', { reason: '' }).expect(400);
    await post(`/api/tasks/${ids.TV}/reopen`, 'CLIENT_MANAGER', { reason: 'Atividade não concluída' }).expect(409);
    await post(`/api/tasks/${ids.TC}/reopen`, 'CLIENT_MANAGER', { reason: 'Medidas incorretas no croqui' }).expect(201);
    const approval = await approvalOf(ids.TC, 'TASK_REOPEN');
    expect(approval).toMatchObject({ assignedRole: 'JGM4_ADMIN', priority: 'HIGH' });
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_CONSULTANT').expect(403);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.TC } })).status).toBe('COMPLETED');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN', { comment: 'Reabrir' }).expect(200);
    const reopened = await prisma.task.findUniqueOrThrow({ where: { id: ids.TC } });
    expect(reopened).toMatchObject({ status: 'IN_PROGRESS', actualEndDate: null });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Task', entityId: ids.TC, action: 'REOPENED' } });
    expect(log.oldValue).toMatchObject({ status: 'COMPLETED' }); expect(log.newValue).toMatchObject({ status: 'IN_PROGRESS', reason: 'Medidas incorretas no croqui', requestedByRole: 'CLIENT_MANAGER', decidedByRole: 'JGM4_ADMIN' });
  });
  it('reabertura é negada quando o Gate da fase já foi aprovado', async () => {
    await post(`/api/tasks/${ids.QC}/reopen`, 'JGM4_CONSULTANT', { reason: 'Revisão tardia solicitada' }).expect(201);
    const approval = await approvalOf(ids.QC, 'TASK_REOPEN');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN').expect(409);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.QC } })).status).toBe('COMPLETED');
    expect((await approvalOf(ids.QC, 'TASK_REOPEN')).status).toBe('PENDING');
  });
  it('cancelamento de solicitação: bloqueante é recusada; demais exigem JGM4_ADMIN', async () => {
    await post(`/api/projects/${P}/requests/${ids['SOL-4']}/cancellation`, 'CLIENT_MANAGER', { reason: 'Não precisamos mais' }).expect(409);
    await post(`/api/projects/${P}/requests/${ids['SOL-3']}/cancellation`, 'CLIENT_MANAGER', { reason: 'Fora do escopo' }).expect(201);
    const approval = await approvalOf(ids['SOL-3'], 'REQUEST_CANCEL');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_CONSULTANT').expect(403);
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN').expect(200);
    expect((await prisma.projectRequest.findUniqueOrThrow({ where: { id: ids['SOL-3'] } })).status).toBe('CANCELLED');
    expect(await prisma.auditLog.count({ where: { entityType: 'ProjectRequest', entityId: ids['SOL-3'], action: 'CANCELLED' } })).toBe(1);
  });
  it('filtro "hoje", bloco do projeto e matriz de alçadas', async () => {
    const now = new Date(); const todayDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    await prisma.$transaction((tx) => ensureApproval(tx, { projectId: P, type: 'OTHER', entityType: 'Project', entityId: P, entityCode: 'OUT-1', title: 'Conflito de escopo', description: 'Resolver', assignedRole: 'JGM4_ADMIN', dueAt: todayDate }));
    const { body } = await get('/api/approvals?due=today', 'JGM4_ADMIN').expect(200);
    expect(body.map((item: any) => item.code)).toContain('OUT-1');
    const { body: pending } = await get(`/api/projects/${P}/approvals/pending`, 'CLIENT_MANAGER').expect(200);
    expect(pending.total).toBeGreaterThan(0); expect(pending.items[0]).toHaveProperty('code');
    await get(`/api/projects/${randomUUID()}/approvals/pending`).expect(404);
    const { body: authority } = await get('/api/approvals/authority', 'JGM4_CONSULTANT').expect(200);
    expect(authority.permissions).toEqual(expect.arrayContaining(['REQUEST_VALIDATE', 'TASK_VALIDATE', 'GATE_TECHNICAL_OPINION']));
    expect(authority.permissions).not.toEqual(expect.arrayContaining(['TASK_REOPEN_APPROVE']));
    const { body: sponsor } = await get('/api/approvals/authority', 'CLIENT_SPONSOR').expect(200);
    expect(sponsor.permissions).toContain('GATE_CLIENT_DECISION');
    expect((await get('/api/approvals/authority', 'CLIENT_MANAGER').expect(200)).body.permissions).not.toContain('GATE_CLIENT_DECISION');
  });
  it('parecer contrário gera correção e a retomada abre novo parecer técnico (histórico preservado)', async () => {
    await get(`/api/projects/${R}/gates`).expect(200);
    const first = await approvalOf(ids.gateR, 'GATE_TECHNICAL_OPINION');
    const { body } = await post(`/api/approvals/${first.id}/reject`, 'JGM4_CONSULTANT', { comment: 'Falta evidência de zoneamento' }).expect(200);
    expect(body.status).toBe('REJECTED');
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: ids.gateR } })).status).toBe('CORRECTION_REQUIRED');
    await post(`/api/gates/${ids.gateR}/resume-review`, 'JGM4_CONSULTANT').expect(201);
    const second = await approvalOf(ids.gateR, 'GATE_TECHNICAL_OPINION');
    expect(second.id).not.toBe(first.id); expect(second.status).toBe('IN_REVIEW');
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('REJECTED');
  });
  it('reabrir atividade com Gate em análise devolve o Gate a bloqueado e cancela suas aprovações', async () => {
    await post(`/api/tasks/${ids.RC}/reopen`, 'CLIENT_MANAGER', { reason: 'Correção de medidas' }).expect(201);
    const approval = await approvalOf(ids.RC, 'TASK_REOPEN');
    await post(`/api/approvals/${approval.id}/approve`, 'JGM4_ADMIN').expect(200);
    expect((await prisma.gate.findUniqueOrThrow({ where: { id: ids.gateR } })).status).toBe('BLOCKED');
    const technical = await approvalOf(ids.gateR, 'GATE_TECHNICAL_OPINION');
    expect(technical.status).toBe('CANCELLED'); expect(technical.decision).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityType: 'Gate', entityId: ids.gateR, action: 'GATE_RETURNED_TO_BLOCKED' } })).toBe(1);
  });
  it('remetente da aprovação reflete o perfil real que enviou', async () => {
    const approval = await approvalOf(ids.TV, 'TASK_VALIDATION');
    expect(approval.requestedByRole).toBe('CLIENT_MANAGER');
  });
  it('16. toda decisão gera AuditLog e as decisões nunca são apagadas nem reescritas', async () => {
    const decided = await prisma.approval.findMany({ where: { status: { in: ['APPROVED', 'ADJUSTMENT_REQUESTED', 'REJECTED'] } } });
    expect(decided.length).toBeGreaterThanOrEqual(10);
    for (const approval of decided) {
      expect(await prisma.auditLog.count({ where: { entityType: 'Approval', entityId: approval.id, action: { startsWith: 'APPROVAL_' } } })).toBeGreaterThanOrEqual(2); // CREATED + decisão
      expect(approval.decidedAt).toBeTruthy(); expect(approval.decidedByRole).toBeTruthy();
    }
    const one = decided[0];
    await expect(prisma.approval.delete({ where: { id: one.id } })).rejects.toThrow();
    await expect(prisma.approval.update({ where: { id: one.id }, data: { decisionComment: 'adulterado' } })).rejects.toThrow();
    await expect(prisma.approval.deleteMany({})).rejects.toThrow();
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow();
    const { body: history } = await get('/api/approvals?status=all&scope=all', 'JGM4_ADMIN').expect(200);
    expect(history.filter((item: any) => ['APPROVED', 'ADJUSTMENT_REQUESTED', 'REJECTED'].includes(item.status)).length).toBe(decided.length);
  });
});
