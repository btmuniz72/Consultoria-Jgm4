import 'reflect-metadata';
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureApproval } from '../src/approvals/approval-sync';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

// Texto de um PDF sem compressão (PDF_COMPRESS=false no ambiente de teste): junta as strings hexadecimais dos operadores de texto.
const pdfText = (buffer: Buffer) => [...buffer.toString('latin1').matchAll(/<([0-9a-fA-F]{2,})>/g)].map((match) => Buffer.from(match[1], 'hex').toString('latin1')).join('');

describe('Etapa 7 — relatórios, exportações, auditoria e ciclo de vida do projeto', () => {
  const schema = `jgm4_stage7_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL!;
  const saved = { dev: process.env.ALLOW_DEV_ACTOR_HEADER, actor: process.env.JGM4_LOCAL_ACTOR };
  const pool = new Pool({ connectionString: originalUrl });
  const PASSWORD = 'Senha-Local-Teste-1!';
  let app: INestApplication; let prisma: PrismaService;
  const id: Record<string, string> = {}; const token: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch', path: string, who?: string, body?: object) => { const r = http()[method](path); if (who) r.set('Authorization', `Bearer ${token[who]}`); return body ? r.send(body) : method === 'post' ? r.send({}) : r; };
  const get = (path: string, who?: string) => call('get', path, who);
  const binary = async (path: string, who: string, status = 200) => {
    const res = await http().get(path).set('Authorization', `Bearer ${token[who]}`).buffer(true).parse((response, done) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks))); }).expect(status);
    return { buffer: res.body as Buffer, headers: res.headers };
  };
  const workbook = async (buffer: Buffer) => { const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never); return book; };
  const day = (offset: number) => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset)); };
  const sectionOf = (doc: any, title: string) => doc.sections.find((section: any) => section.title === title) ?? doc.sections.find((section: any) => section.title?.includes(title));

  async function buildProject(key: string, companyId: string, name: string, status = 'IN_PROGRESS') {
    const project = await prisma.project.create({ data: { companyId, name, description: `Descrição ${name}`, status: status as never, plannedStartDate: day(-60), plannedEndDate: day(60) } }); id[key] = project.id;
    return project;
  }
  const phase = (projectId: string, order: number, status: string) => prisma.phase.create({ data: { projectId, order, name: `Fase ${order}`, description: `Objetivo da fase ${order}`, plannedWeeks: 3, plannedJgm4Hours: 20, status: status as never,
    actualStartDate: status === 'LOCKED' ? null : day(-50 + order * 10), actualEndDate: status === 'COMPLETED' ? day(-45 + order * 10) : null } });
  const gate = (projectId: string, phaseId: string, order: number, status: string, extra: Record<string, unknown> = {}) => prisma.gate.create({ data: { projectId, phaseId, code: `GATE-${order}`, title: `Gate ${order}`, question: `Pergunta do Gate ${order}?`, status: status as never, currentOwnerType: 'SYSTEM', ...extra } as never });

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

    const companyA = (await prisma.company.create({ data: { name: 'Ollem Teste' } })).id; const companyB = (await prisma.company.create({ data: { name: 'Empresa B' } })).id;
    const passwordHash = await hash(PASSWORD, 4);
    const user = async (key: string, role: string, companyId: string | null) => { id[key] = (await prisma.user.create({ data: { name: `Usuário ${key}`, email: `${key}@teste.local`.toLowerCase(), passwordHash, role: role as never, companyId } })).id; };
    await user('admin', 'JGM4_ADMIN', null); await user('consIn', 'JGM4_CONSULTANT', null); await user('consOut', 'JGM4_CONSULTANT', null);
    await user('sponsorA', 'CLIENT_SPONSOR', companyA); await user('managerA', 'CLIENT_MANAGER', companyA); await user('userA', 'CLIENT_USER', companyA); await user('managerB', 'CLIENT_MANAGER', companyB);

    // PA: projeto principal.
    await buildProject('PA', companyA, 'Plano C Almoxarifado');
    const a0 = await phase(id.PA, 0, 'COMPLETED'); const a1 = await phase(id.PA, 1, 'IN_PROGRESS'); const a2 = await phase(id.PA, 2, 'LOCKED');
    id.phase0 = a0.id; id.phase1 = a1.id;
    id.gate0 = (await gate(id.PA, a0.id, 0, 'APPROVED', { technicalRecommendation: 'ADVANCE', technicalOpinion: 'Critérios atendidos.', technicalApprovedAt: day(-40), technicalApprovedByUserId: id.consIn,
      clientDecision: 'APPROVE', clientDecisionComment: 'Seguir para a Fase 1.', clientDecisionAt: day(-39), clientDecisionByUserId: id.sponsorA })).id;
    id.gate1 = (await gate(id.PA, a1.id, 1, 'BLOCKED')).id; await gate(id.PA, a2.id, 2, 'BLOCKED');
    await prisma.gateCriterion.createMany({ data: [{ gateId: id.gate0, code: 'G0-C01', description: 'Responsáveis definidos', sourceType: 'MANUAL', satisfied: true, evidenceReference: 'Ata 01', satisfiedByUserId: id.consIn, satisfiedAt: day(-40), order: 1 },
      { gateId: id.gate1, code: 'G1-C01', description: 'Piloto concluído', sourceType: 'MANUAL', order: 1 }, { gateId: id.gate1, code: 'G1-C02', description: 'Atividades concluídas', sourceType: 'TASK', order: 2 }] });
    const task = (code: string, phaseId: string, status: string, extra: Record<string, unknown> = {}) => prisma.task.create({ data: { projectId: id.PA, phaseId, code, title: `Atividade ${code}`, objective: `Objetivo ${code}`, instructions: 'x', acceptanceCriteria: 'x', status: status as never,
      plannedJgm4Hours: 10, plannedClientHours: 5, plannedStartDate: day(-30), plannedEndDate: day(-20), currentOwnerType: 'CLIENT', ...extra } as never }).then((created) => { id[code] = created.id; return created; });
    await task('A1', a0.id, 'COMPLETED', { actualStartDate: day(-48), actualEndDate: day(-42), currentOwnerType: 'NONE' }); await task('A2', a0.id, 'COMPLETED', { actualStartDate: day(-47), actualEndDate: day(-30), plannedEndDate: day(-35), currentOwnerType: 'NONE' });
    await task('B1', a1.id, 'IN_PROGRESS', { nextActionDueDate: day(-2), actualStartDate: day(-8), nextAction: 'Concluir B1.' });
    await task('B2', a1.id, 'BLOCKED', { currentOwnerType: 'SYSTEM', predecessorTaskId: id.B1 });
    await task('C1', a2.id, 'BLOCKED', { currentOwnerType: 'SYSTEM' });
    await prisma.taskEvidence.create({ data: { projectId: id.PA, phaseId: a0.id, taskId: id.A1, description: 'Foto do zoneamento', referenceUrl: 'https://exemplo.local/foto', createdByUserId: id.managerA } });
    const entry = (taskCode: string, phaseId: string, org: 'JGM4' | 'CLIENT', hours: number, offset: number, userId: string | null) => prisma.timeEntry.create({ data: { projectId: id.PA, phaseId, taskId: id[taskCode], organizationType: org, userId, date: day(offset), hours, description: `Trabalho ${taskCode}` } });
    await entry('A1', a0.id, 'JGM4', 9, -44, id.consIn); await entry('A2', a0.id, 'CLIENT', 4, -40, id.managerA); await entry('B1', a1.id, 'JGM4', 6, -3, id.consIn); await entry('B1', a1.id, 'CLIENT', 2.5, -2, id.managerA);
    const request = (code: string, status: string, dueDate: Date | null) => prisma.projectRequest.create({ data: { projectId: id.PA, phaseId: a1.id, code, title: `Solicitação ${code}`, description: 'x', instructions: 'x', acceptanceCriteria: 'x', status: status as never, dueDate, mandatory: true, blocking: false } });
    id.reqOverdue = (await request('SOL-1', 'CLIENT_PREPARING', day(-4))).id; await request('SOL-2', 'ACCEPTED', day(-10));
    await ensureApproval(prisma, { projectId: id.PA, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: id.B1, entityCode: 'B1', title: 'B1 — Alteração de prazo', description: 'x', assignedRole: 'JGM4_ADMIN', priority: 'HIGH', dueAt: day(2) });
    await prisma.auditLog.create({ data: { projectId: id.PA, entityType: 'Task', entityId: id.B1, action: 'START', actorType: 'CLIENT_MANAGER', userId: id.managerA, newValue: { status: 'IN_PROGRESS' }, createdAt: day(-8) } });
    await prisma.auditLog.create({ data: { projectId: id.PA, entityType: 'ProjectRequest', entityId: id.reqOverdue, action: 'STATUS_CHANGED', actorType: 'CLIENT_MANAGER', userId: id.managerA, newValue: { status: 'REQUESTED' }, createdAt: day(-12) } });

    // PB: outra empresa (isolamento).
    await buildProject('PB', companyB, 'Projeto Outra Empresa'); const b0 = await phase(id.PB, 0, 'IN_PROGRESS'); id.gateB = (await gate(id.PB, b0.id, 0, 'BLOCKED')).id;
    // PF: implantação concluída (Relatório Final). PG: Gate final não aprovado.
    await buildProject('PF', companyA, 'Plano C Concluído', 'IMPLEMENTATION_COMPLETED');
    for (const order of [0, 1]) { const p = await phase(id.PF, order, 'COMPLETED'); await gate(id.PF, p.id, order, 'APPROVED', { technicalRecommendation: 'ADVANCE', technicalOpinion: `Parecer ${order}`, clientDecision: 'APPROVE', clientDecisionComment: `Decisão ${order}`, clientDecisionAt: day(-5 + order) });
      await prisma.task.create({ data: { projectId: id.PF, phaseId: p.id, code: `F${order}`, title: `Melhoria implantada ${order}`, objective: 'x', instructions: 'x', acceptanceCriteria: 'x', status: 'COMPLETED', actualEndDate: day(-6 + order) } }); }
    await prisma.sustainmentItem.create({ data: { projectId: id.PF, routine: 'Inventário cíclico semanal', frequency: 'Semanal', responsible: 'Supervisor', indicator: 'Acuracidade', criterion: '98%', nextReviewDate: day(30) } });
    await buildProject('PG', companyA, 'Plano C Quase Concluído', 'IN_PROGRESS'); const g0 = await phase(id.PG, 0, 'COMPLETED'); const g1 = await phase(id.PG, 1, 'WAITING_GATE'); await gate(id.PG, g0.id, 0, 'APPROVED'); await gate(id.PG, g1.id, 1, 'TECHNICALLY_APPROVED');

    const member = (userKey: string, projectKey: string) => prisma.projectMembership.create({ data: { projectId: id[projectKey], userId: id[userKey] } });
    for (const p of ['PA', 'PF', 'PG']) for (const u of ['consIn', 'sponsorA', 'managerA', 'userA']) await member(u, p);
    await member('managerB', 'PB');
    for (const key of ['admin', 'consIn', 'consOut', 'sponsorA', 'managerA', 'userA', 'managerB']) token[key] = (await http().post('/api/auth/login').send({ email: `${key}@teste.local`.toLowerCase(), password: PASSWORD }).expect(200)).body.accessToken;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [['ALLOW_DEV_ACTOR_HEADER', saved.dev], ['JGM4_LOCAL_ACTOR', saved.actor]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const client = await pool.connect();
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { client.release(); await pool.end(); }
  });

  it('1. relatório executivo retorna o projeto correto, nome de arquivo legível e PDF paginado', async () => {
    const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'managerA').expect(200);
    const identification = body.sections[0].rows as [string, string][];
    expect(Object.fromEntries(identification)).toMatchObject({ Cliente: 'Ollem Teste', Projeto: 'Plano C Almoxarifado', 'Fase atual': 'Fase 1 — Fase 1', Status: 'Em andamento' });
    expect(body.fileName).toMatch(/^Ollem_Plano_C_Relatorio_Executivo_\d{4}-\d{2}-\d{2}\.pdf$/);
    const { buffer, headers } = await binary(`/api/projects/${id.PA}/reports/executive/pdf`, 'managerA');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-'); expect(headers['content-type']).toContain('application/pdf'); expect(headers['content-disposition']).toContain('Ollem_Plano_C_Relatorio_Executivo_');
    const text = pdfText(buffer);
    expect(text).toContain('Relatório Executivo do Projeto'); expect(text).toContain('Plano C Almoxarifado'); expect(text).toMatch(/Página 1 de \d/); expect(text).toContain('JGM4 Consultoria Logística');
  });
  it('2. usuário sem membership recebe 403 em todos os relatórios e exportações', async () => {
    for (const path of ['reports/executive', 'reports/executive/pdf', `reports/phases/${id.phase0}`, `reports/gates/${id.gate0}/pdf`, 'reports/action-plan/xlsx', 'reports/hours/xlsx', 'reports/requests/xlsx', 'audit', 'audit/xlsx', 'reports/history', 'reports/final']) await get(`/api/projects/${id.PA}/${path}`, 'consOut').expect(403);
  });
  it('3 e 19. cliente de outra empresa, CLIENT_USER e anônimo não acessam (inclui acesso externo indevido)', async () => {
    for (const path of ['reports/executive', 'reports/executive/pdf', 'reports/action-plan/xlsx', 'audit/xlsx', `reports/gates/${id.gate0}`]) await get(`/api/projects/${id.PA}/${path}`, 'managerB').expect(403);
    await get(`/api/projects/${id.PB}/reports/executive`, 'managerA').expect(403);
    for (const path of ['reports/executive', 'reports/hours/xlsx', 'audit']) await get(`/api/projects/${id.PA}/${path}`, 'userA').expect(403);
    await get(`/api/projects/${id.PA}/reports/executive/pdf`).expect(401); await get(`/api/projects/${id.PA}/audit/xlsx`).expect(401);
    await get(`/api/projects/${id.PA}/reports/gates/${id.gateB}`, 'consIn').expect(404); // Gate de outro projeto, mesmo com acesso ao projeto
    await get(`/api/projects/${id.PA}/reports/executive`, 'consIn').expect(200); await get(`/api/projects/${id.PA}/audit`, 'sponsorA').expect(200);
  });
  it('4. as horas do relatório vêm de TimeEntry (JGM4 15 h, cliente 6,5 h) e acompanham novos apontamentos', async () => {
    const hours = async () => { const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'admin').expect(200); return sectionOf(body, 'Horas').rows as Record<string, string>[]; };
    let rows = await hours();
    expect(rows[0]).toMatchObject({ org: 'JGM4', actual: '15 h', planned: '50 h', remaining: '35 h' }); expect(rows[1]).toMatchObject({ org: 'Cliente', actual: '6.5 h' });
    await prisma.timeEntry.create({ data: { projectId: id.PA, phaseId: id.phase1, taskId: id.B1, organizationType: 'JGM4', date: day(-1), hours: 5, description: 'Novo apontamento' } });
    rows = await hours(); expect(rows[0].actual).toBe('20 h');
    expect(JSON.stringify(await get(`/api/projects/${id.PA}/reports/executive`, 'admin').then((r) => r.body))).not.toMatch(/R\$|valor hora|faturamento/i);
  });
  it('5. o progresso do relatório coincide com o dashboard', async () => {
    const dashboard = (await get(`/api/projects/${id.PA}/dashboard`, 'admin').expect(200)).body; const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'admin').expect(200);
    const summary = Object.fromEntries(sectionOf(body, 'Resumo executivo').rows as [string, string][]);
    expect(summary['Progresso geral']).toBe(`${dashboard.progress.percent}% (${dashboard.progress.completed} de ${dashboard.progress.total} atividades concluídas)`);
    expect(Object.fromEntries(sectionOf(body, 'Progresso').rows as [string, string][])['Progresso geral']).toBe(`${dashboard.progress.percent}%`);
    expect(summary['Saúde do projeto']).toBe('Atenção');
  });
  it('6. Gates aparecem com status, parecer, decisão e pendências atuais', async () => {
    const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'admin').expect(200);
    const rows = sectionOf(body, 'Gates').rows as Record<string, string>[];
    expect(rows[0]).toMatchObject({ gate: 'GATE-0 — Gate 0', status: 'Aprovado', criteria: '1/1', decision: 'Aprovado — avanço autorizado' }); expect(rows[0].opinion).toContain('Critérios atendidos.');
    expect(rows[1]).toMatchObject({ gate: 'GATE-1 — Gate 1', status: 'Bloqueado', criteria: '0/2' });
    const pending = sectionOf(body, 'Pendências atuais do GATE-1'); expect(pending.items.join(' ')).toContain('Piloto concluído');
  });
  it('7. pendências críticas (atrasos, prioridade alta e aprovações) entram no relatório; riscos e próximos passos existem', async () => {
    const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'admin').expect(200);
    const rows = sectionOf(body, 'Principais pendências').rows as Record<string, string>[];
    expect(rows.map((row) => row.item.split(' — ')[0])).toEqual(expect.arrayContaining(['B1', 'SOL-1']));
    expect(rows.find((row) => row.item.includes('Atividade B1'))!.reason).toMatch(/Atrasado 2 dias/);
    expect(rows.find((row) => row.item.includes('Alteração de prazo'))!.reason).toMatch(/Aprovação pendente/);
    expect(sectionOf(body, 'Principais riscos').items.length).toBeGreaterThan(0);
    expect((sectionOf(body, 'Próximos passos').rows as unknown[]).length).toBeLessThanOrEqual(10);
    expect(sectionOf(body, 'Próximos passos').rows[0].priority).toMatch(/Alta|Crítica/);
  });
  it('8. XLSX do plano de ação é um arquivo real, com as colunas pedidas, cabeçalho, filtro, painel congelado e tipos corretos', async () => {
    const { buffer, headers } = await binary(`/api/projects/${id.PA}/reports/action-plan/xlsx`, 'admin');
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); expect(headers['content-type']).toContain('spreadsheetml'); expect(headers['content-disposition']).toContain('Ollem_Plano_C_Plano_de_Acao.xlsx');
    const sheet = (await workbook(buffer)).getWorksheet('Plano de Ação')!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(['Código', 'Fase', 'Atividade', 'Descrição', 'Responsável', 'Organização', 'Status', 'Prioridade', 'Início planejado', 'Fim planejado', 'Início real', 'Fim real', 'Próxima ação', 'Responsável pela próxima ação', 'Prazo da próxima ação',
      'Horas JGM4 planejadas', 'Horas JGM4 realizadas', 'Horas Cliente planejadas', 'Horas Cliente realizadas', 'Dependências', 'Observações']);
    expect(sheet.autoFilter).toBeTruthy(); expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 }); expect(sheet.rowCount).toBe(6);
    const b1 = sheet.getRows(2, 5)!.find((row) => row.getCell(1).value === 'B1')!;
    expect(b1.getCell(9).value).toBeInstanceOf(Date); expect(b1.getCell(9).numFmt).toBe('dd/mm/yyyy'); expect(typeof b1.getCell(16).value).toBe('number'); expect(b1.getCell(17).value).toBe(11); expect(b1.getCell(8).value).toBe('Alta');
    const b2 = sheet.getRows(2, 5)!.find((row) => row.getCell(1).value === 'B2')!; expect(b2.getCell(20).value).toContain('Atividade B1');
  });
  it('9. XLSX de horas tem os registros e respeita filtros (período, fase, organização, usuário)', async () => {
    const rowsOf = async (query: string) => { const { buffer } = await binary(`/api/projects/${id.PA}/reports/hours/xlsx${query}`, 'managerA'); const sheet = (await workbook(buffer)).getWorksheet('Horas')!; return { sheet, count: sheet.rowCount - 1 }; };
    const all = await rowsOf(''); expect(all.count).toBe(5);
    expect((all.sheet.getRow(1).values as unknown[]).slice(1)).toEqual(['Data', 'Cliente', 'Projeto', 'Fase', 'Atividade', 'Usuário', 'Organização', 'Horas', 'Descrição']);
    expect((await rowsOf('?organization=CLIENT')).count).toBe(2); expect((await rowsOf(`?phaseId=${id.phase0}`)).count).toBe(2); expect((await rowsOf(`?userId=${id.consIn}`)).count).toBe(2);
    expect((await rowsOf(`?from=${day(-5).toISOString().slice(0, 10)}`)).count).toBe(3);
    const hoursCell = all.sheet.getRow(2).getCell(8); expect(typeof hoursCell.value).toBe('number'); expect(all.sheet.getRow(2).getCell(1).value).toBeInstanceOf(Date);
    await get(`/api/projects/${id.PA}/reports/hours/xlsx?organization=OUTRA`, 'managerA').expect(400);
    const history = await binary(`/api/projects/${id.PA}/reports/requests/xlsx`, 'admin'); const requests = (await workbook(history.buffer)).getWorksheet('Solicitações')!; expect(requests.rowCount).toBe(3);
    const overdue = requests.getRows(2, 2)!.find((row) => row.getCell(1).value === 'SOL-1')!; expect(overdue.getCell(11).value).toBe(4); expect(overdue.getCell(12).value).toBe('Em andamento'); expect(overdue.getCell(7).value).toBeInstanceOf(Date);
  });
  it('10. a auditoria pode ser filtrada (tipo, ação, usuário, período) e é exportável; não há rota de edição', async () => {
    const all = (await get(`/api/projects/${id.PA}/audit`, 'consIn').expect(200)).body; expect(all.total).toBeGreaterThanOrEqual(2);
    const tasks = (await get(`/api/projects/${id.PA}/audit?entityType=Task`, 'consIn').expect(200)).body; expect(tasks.items.every((item: any) => item.entityType === 'Task')).toBe(true); expect(tasks.items[0].entity).toBe('Task B1');
    expect((await get(`/api/projects/${id.PA}/audit?action=status_changed`, 'consIn').expect(200)).body.items.map((item: any) => item.action)).toEqual(['STATUS_CHANGED']);
    expect((await get(`/api/projects/${id.PA}/audit?userId=${id.managerA}`, 'consIn').expect(200)).body.items.every((item: any) => item.userId === id.managerA)).toBe(true);
    expect((await get(`/api/projects/${id.PA}/audit?to=${day(-30).toISOString().slice(0, 10)}`, 'consIn').expect(200)).body.total).toBe(0);
    expect((await get(`/api/projects/${id.PA}/audit?limit=1`, 'consIn').expect(200)).body.items).toHaveLength(1);
    const { buffer } = await binary(`/api/projects/${id.PA}/audit/xlsx?entityType=Task`, 'admin'); const sheet = (await workbook(buffer)).getWorksheet('Auditoria')!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(['Data/hora', 'Usuário', 'Perfil', 'Ação', 'Entidade', 'Valor anterior', 'Valor novo', 'Contexto']); expect(sheet.rowCount).toBeGreaterThan(1);
    await call('patch', `/api/projects/${id.PA}/audit/${randomUUID()}`, 'admin', { action: 'x' }).expect(404);
    await expect(prisma.auditLog.updateMany({ where: { projectId: id.PA }, data: { action: 'ADULTERADO' } })).rejects.toThrow();
  });
  it('11. Gate aprovado permite o relatório da fase e o de encerramento (parecer e decisão separados)', async () => {
    const phaseDoc = (await get(`/api/projects/${id.PA}/reports/phases/${id.phase0}`, 'sponsorA').expect(200)).body; expect(phaseDoc.title).toBe('Relatório da Fase 0');
    const { body } = await get(`/api/projects/${id.PA}/reports/phases/${id.phase0}/closure`, 'sponsorA').expect(200);
    expect(body.title).toBe('Relatório de Encerramento da Fase 0');
    const callouts = body.sections.filter((section: any) => section.type === 'callout');
    expect(callouts.map((section: any) => section.title)).toEqual(expect.arrayContaining(['PARECER TÉCNICO JGM4', 'DECISÃO DO CLIENTE']));
    expect(callouts.find((section: any) => section.title === 'DECISÃO DO CLIENTE').lines.join(' ')).toContain('Seguir para a Fase 1.');
    expect(sectionOf(body, 'Desvios').items.join(' ')).toContain('A2 concluída'); // concluída após o prazo planejado
    const { buffer } = await binary(`/api/projects/${id.PA}/reports/phases/${id.phase0}/closure/pdf`, 'admin'); expect(pdfText(buffer)).toContain('Relatório de Encerramento da Fase 0');
    // Pendência transferida registrada pela API aparece no encerramento e nunca é apagada.
    const carried = await call('post', `/api/projects/${id.PA}/carried-items`, 'consIn', { fromPhaseId: id.phase0, toPhaseId: id.phase1, description: 'Rever cadastro de itens', responsible: 'Analista', dueDate: day(10).toISOString().slice(0, 10) }).expect(201);
    expect((await get(`/api/projects/${id.PA}/reports/phases/${id.phase0}/closure`, 'admin')).body.sections.find((section: any) => section.title === 'Pendências transferidas').rows[0]).toMatchObject({ description: 'Rever cadastro de itens', status: 'Em aberto' });
    await call('post', `/api/projects/${id.PA}/carried-items`, 'consIn', { fromPhaseId: id.phase1, toPhaseId: id.phase0, description: 'Inválida', responsible: 'X' }).expect(400);
    await call('post', `/api/projects/${id.PA}/carried-items`, 'managerA', { fromPhaseId: id.phase0, toPhaseId: id.phase1, description: 'Cliente não cadastra', responsible: 'X' }).expect(403);
    await call('post', `/api/projects/${id.PA}/carried-items/${carried.body.id}/resolve`, 'consIn').expect(200);
    expect(await prisma.carriedOverItem.count({ where: { projectId: id.PA } })).toBe(1);
  });
  it('12. Gate não aprovado não gera encerramento definitivo (nem o Gate bloqueado)', async () => {
    const { body } = await get(`/api/projects/${id.PA}/reports/phases/${id.phase1}/closure`, 'admin').expect(409); expect(body.message).toContain('Gate');
    await get(`/api/projects/${id.PA}/reports/phases/${id.phase1}/closure/pdf`, 'admin').expect(409);
    expect((await get(`/api/projects/${id.PA}/reports/phases/${id.phase1}`, 'admin').expect(200)).body.title).toBe('Relatório da Fase 1'); // relatório parcial da fase continua disponível
  });
  it('13. relatório final só existe com Gate final aprovado e projeto concluído', async () => {
    await get(`/api/projects/${id.PA}/reports/final`, 'admin').expect(409); await get(`/api/projects/${id.PG}/reports/final`, 'admin').expect(409);
    const { body } = await get(`/api/projects/${id.PF}/reports/final`, 'sponsorA').expect(200);
    expect(body.sections.map((section: any) => section.title?.match(/^([0-9]+)[.]/)?.[1]).filter(Boolean)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(sectionOf(body, 'Plano de sustentação').rows[0]).toMatchObject({ routine: 'Inventário cíclico semanal', frequency: 'Semanal' });
    expect(sectionOf(body, 'Principais melhorias').rows).toHaveLength(2); expect(body.fileName).toBe('Ollem_Plano_C_Relatorio_Final.pdf');
    const { buffer } = await binary(`/api/projects/${id.PF}/reports/final/pdf`, 'admin'); expect(pdfText(buffer)).toContain('Relatório Final de Implantação');
  });
  it('14. ON_HOLD exige motivo, data e observação e só o administrador altera; o relatório mostra a suspensão', async () => {
    const hold = (who: string, body: object) => call('post', `/api/projects/${id.PA}/status/hold`, who, body);
    await hold('admin', { effectiveDate: day(0).toISOString().slice(0, 10), note: 'Sem motivo' }).expect(400);
    await hold('admin', { reason: 'Aguardando contrato', note: 'x' }).expect(400); await hold('admin', { reason: 'Aguardando contrato', effectiveDate: day(0).toISOString().slice(0, 10) }).expect(400);
    for (const who of ['consIn', 'sponsorA', 'managerA']) await hold(who, { reason: 'Aguardando contrato', effectiveDate: day(0).toISOString().slice(0, 10), note: 'obs' }).expect(403);
    const ok = await hold('admin', { reason: 'Aguardando contrato', effectiveDate: day(0).toISOString().slice(0, 10), note: 'Cliente pediu pausa', expectedResumeDate: day(30).toISOString().slice(0, 10) }).expect(200);
    expect(ok.body.status).toBe('ON_HOLD'); expect(ok.body.events[0]).toMatchObject({ from: 'IN_PROGRESS', to: 'ON_HOLD', reason: 'Aguardando contrato', by: 'Usuário admin' });
    await hold('admin', { reason: 'Outra suspensão', effectiveDate: day(0).toISOString().slice(0, 10), note: 'observação válida' }).expect(409);
    const { body } = await get(`/api/projects/${id.PA}/reports/executive`, 'managerA').expect(200);
    const callout = body.sections.find((section: any) => section.type === 'callout'); expect(callout.title).toBe('Projeto temporariamente suspenso'); expect(callout.lines.join(' ')).toContain('Aguardando contrato'); expect(callout.lines.join(' ')).toContain('Previsão de retomada');
    expect((await get(`/api/projects/${id.PA}/dashboard`, 'admin')).body.health).toMatchObject({ level: 'CRITICO' });
  });
  it('17. retomar exige motivo, é só do administrador e registra auditoria e histórico', async () => {
    const resume = (who: string, body: object) => call('post', `/api/projects/${id.PA}/status/resume`, who, body);
    await resume('admin', {}).expect(400); await resume('consIn', { reason: 'Contrato assinado' }).expect(403);
    const { body } = await resume('admin', { reason: 'Contrato assinado' }).expect(200); expect(body.status).toBe('IN_PROGRESS'); expect(body.events.map((event: any) => event.to)).toEqual(['IN_PROGRESS', 'ON_HOLD']);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { projectId: id.PA, action: 'PROJECT_RESUMED' } })).toMatchObject({ userId: id.admin, actorType: 'JGM4_ADMIN', entityType: 'Project' });
    expect(await prisma.auditLog.count({ where: { projectId: id.PA, action: 'PROJECT_ON_HOLD' } })).toBe(1);
    await resume('admin', { reason: 'Já retomado' }).expect(409);
    await expect(prisma.projectStatusEvent.updateMany({ where: { projectId: id.PA }, data: { reason: 'x' } })).rejects.toThrow();
  });
  it('15 e 16. CANCELLED exige motivo e torna o projeto somente consulta (sem atividades, apontamentos, Gates ou aprovações), preservando relatórios', async () => {
    const cancel = (who: string, body: object) => call('post', `/api/projects/${id.PG}/status/cancel`, who, body);
    await cancel('admin', { effectiveDate: day(0).toISOString().slice(0, 10), note: 'Sem motivo' }).expect(400); await cancel('consIn', { reason: 'Encerrado pelo cliente', effectiveDate: day(0).toISOString().slice(0, 10), note: 'x' }).expect(403);
    await cancel('admin', { reason: 'Encerrado pelo cliente', effectiveDate: day(0).toISOString().slice(0, 10), note: 'Distrato' }).expect(403); // exige confirmação de senha
    const ok = await cancel('admin', { reason: 'Encerrado pelo cliente', effectiveDate: day(0).toISOString().slice(0, 10), note: 'Distrato', confirmPassword: PASSWORD }).expect(200); expect(ok.body.status).toBe('CANCELLED');
    const task = await prisma.task.create({ data: { projectId: id.PG, phaseId: (await prisma.phase.findFirstOrThrow({ where: { projectId: id.PG, order: 1 } })).id, code: 'X1', title: 'X', objective: 'x', instructions: 'x', acceptanceCriteria: 'x', status: 'RELEASED' } });
    await call('post', `/api/tasks/${task.id}/start`, 'admin').expect(409);
    await call('post', `/api/tasks/${task.id}/time-entries`, 'managerA', { date: day(0).toISOString().slice(0, 10), hours: 1, description: 'Apontamento' }).expect(409);
    const gateId = (await prisma.gate.findFirstOrThrow({ where: { projectId: id.PG, code: 'GATE-1' } })).id;
    await call('post', `/api/gates/${gateId}/client-decision`, 'sponsorA', { clientDecision: 'APPROVE' }).expect(409);
    await call('post', `/api/tasks/${task.id}/due-date-change`, 'managerA', { requestedDate: day(20).toISOString().slice(0, 10), justification: 'Tentativa em projeto cancelado' }).expect(409);
    await call('post', `/api/projects/${id.PG}/status/resume`, 'admin', { reason: 'Reativar cancelado' }).expect(409);
    expect((await prisma.timeEntry.count({ where: { projectId: id.PG } }))).toBe(0);
    await get(`/api/projects/${id.PG}/dashboard`, 'managerA').expect(200); const exec = (await get(`/api/projects/${id.PG}/reports/executive`, 'managerA').expect(200)).body;
    expect(exec.sections.find((section: any) => section.type === 'callout').title).toBe('Projeto cancelado — somente consulta'); await binary(`/api/projects/${id.PG}/reports/executive/pdf`, 'managerA'); await get(`/api/projects/${id.PG}/audit`, 'sponsorA').expect(200);
  });
  it('18. cada exportação registra usuário, tipo, formato e data; o histórico é consultável e imutável', async () => {
    const logs = await prisma.reportGenerationLog.findMany({ where: { projectId: id.PA }, orderBy: { generatedAt: 'asc' } });
    expect(logs.length).toBeGreaterThanOrEqual(8);
    const executivePdf = logs.find((log) => log.reportType === 'EXECUTIVE' && log.format === 'PDF')!; expect(executivePdf).toMatchObject({ generatedByUserId: id.managerA, generatedByRole: 'CLIENT_MANAGER' }); expect(executivePdf.fileName).toContain('Relatorio_Executivo');
    expect(logs.find((log) => log.reportType === 'ACTION_PLAN')).toMatchObject({ format: 'XLSX', generatedByUserId: id.admin });
    expect(logs.find((log) => log.reportType === 'HOURS' && (log.parameters as any)?.organization === 'CLIENT')).toBeTruthy();
    const before = await prisma.reportGenerationLog.count({ where: { projectId: id.PA } }); await get(`/api/projects/${id.PA}/reports/executive`, 'admin').expect(200); await get(`/api/projects/${id.PA}/reports/hours`, 'admin').expect(200);
    expect(await prisma.reportGenerationLog.count({ where: { projectId: id.PA } })).toBe(before); // prévias não geram registro
    const history = (await get(`/api/projects/${id.PA}/reports/history`, 'consIn').expect(200)).body; expect(history[0]).toMatchObject({ by: expect.any(String), format: expect.stringMatching(/PDF|XLSX/), reportType: expect.any(String) });
    await get(`/api/projects/${id.PA}/reports/history`, 'managerB').expect(403);
    await expect(prisma.reportGenerationLog.deleteMany({ where: { projectId: id.PA } })).rejects.toThrow();
  });
  it('plano de sustentação: só JGM4 cadastra, cliente lê, itens são desativados (não apagados) e auditados', async () => {
    const body = { routine: 'Auditoria mensal de POPs', frequency: 'Mensal', responsible: 'Gestor', indicator: 'Aderência', criterion: '95%', nextReviewDate: day(40).toISOString().slice(0, 10) };
    await call('post', `/api/projects/${id.PA}/sustainment`, 'managerA', body).expect(403);
    const created = await call('post', `/api/projects/${id.PA}/sustainment`, 'consIn', body).expect(201);
    await call('post', `/api/projects/${id.PA}/sustainment`, 'consIn', { routine: 'x' }).expect(400);
    expect((await get(`/api/projects/${id.PA}/sustainment`, 'managerA').expect(200)).body).toHaveLength(1);
    await call('patch', `/api/projects/${id.PA}/sustainment/${created.body.id}`, 'consIn', { active: false }).expect(200);
    expect(await prisma.sustainmentItem.count({ where: { projectId: id.PA } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { projectId: id.PA, entityType: 'SustainmentItem' } })).toBe(2);
    await call('patch', `/api/projects/${id.PB}/sustainment/${created.body.id}`, 'consIn', { active: true }).expect(403);
  });
});
