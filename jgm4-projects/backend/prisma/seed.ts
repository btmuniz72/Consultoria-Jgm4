import { reviseOllem } from '../src/commercial/revise-ollem';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { planCCriteria, planCPhases, planCTasks } from '../src/plans/plano-c.data';
import { ensurePlanCRequests } from '../src/requests/plan-c-requests';
import { seedApprovalsDemo } from './seed-approvals-demo';
import { seedUsers } from './seed-users';
import { seedDashboardDemo } from './seed-dashboard-demo';
import { linkReportsDemoUsers, seedReportsDemo } from './seed-reports-demo';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: new URL(connectionString).searchParams.get('schema') || 'public' }) });
const companyId = '9f1ead00-1c44-4000-8000-000000000001';
const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const phases = planCPhases;

// Produção: o seed NUNCA cria usuários nem projetos de demonstração. O seed base (estrutura do Plano C) só roda com ALLOW_PRODUCTION_SEED=true.
// O primeiro administrador é criado explicitamente por `npm run admin:bootstrap`.
const production = process.env.NODE_ENV === 'production';
async function seed() {
  if (production && process.env.ALLOW_PRODUCTION_SEED !== 'true') { console.log('Seed bloqueado em produção (defina ALLOW_PRODUCTION_SEED=true para o seed base; usuários e demonstrações nunca são criados).'); return; }
  const revised = await prisma.project.findUnique({ where: { id: projectId }, select: { ollemRevision: true } });
  if (!revised?.ollemRevision) await prisma.$transaction(async (tx) => {
    await tx.company.upsert({ where: { id: companyId }, update: {}, create: { id: companyId, name: 'Ollem do Brasil' } });
    await tx.project.upsert({ where: { id: projectId }, update: {}, create: {
      id: projectId, companyId, name: 'Estruturação do Almoxarifado', methodology: 'PLANO_C',
      description: 'Implantação de melhorias no almoxarifado da Ollem do Brasil, da organização da base à estabilização operacional e sustentação do modelo implantado.',
    } });
    for (const [order, item] of phases.entries()) {
      const phaseId = `9f1ead00-1c44-4000-8000-00000000001${order}`;
      await tx.phase.upsert({ where: { projectId_order: { projectId, order } }, update: {}, create: {
        id: phaseId, projectId, order, name: item.name, description: item.description,
        plannedWeeks: item.weeks, plannedJgm4Hours: item.hours, status: order === 0 ? 'AVAILABLE' : 'LOCKED',
      } });
      // Reconsulta para também respeitar uma fase já existente com o mesmo número.
      const phase = await tx.phase.findUniqueOrThrow({ where: { projectId_order: { projectId, order } } });
      await tx.gate.upsert({ where: { projectId_code: { projectId, code: `GATE-${order}` } }, update: {}, create: {
        projectId, phaseId: phase.id, code: `GATE-${order}`, title: item.title, question: item.question,
      } });
      const criteria = planCCriteria[order];
      const gate = await tx.gate.findUniqueOrThrow({ where: { projectId_code: { projectId, code: `GATE-${order}` } } });
      for (const [index, description] of criteria.entries()) {
        const automatic = /atividades obrigatórias.*concluídas/i.test(description) || /solicitações bloqueantes.*aceitas/i.test(description);
        const sourceType = automatic ? (/solicitações/i.test(description) ? 'REQUEST' : 'TASK') : 'MANUAL';
        await tx.gateCriterion.upsert({ where: { gateId_code: { gateId: gate.id, code: `G${order}-C${String(index + 1).padStart(2, '0')}` } }, update: { description, sourceType }, create: {
          gateId: gate.id, code: `G${order}-C${String(index + 1).padStart(2, '0')}`, description, sourceType, order: index + 1,
          mandatory: true, evidenceRequired: !automatic,
        } });
      }
    }
    const plannedTasks = planCTasks;
    for (const item of plannedTasks) {
      const phase = await tx.phase.findUniqueOrThrow({ where: { projectId_order: { projectId, order: item.phase } } });
      const previous = item.predecessor ? await tx.task.findUniqueOrThrow({ where: { projectId_code: { projectId, code: item.predecessor } } }) : null;
      const gate = item.phase > 0 ? await tx.gate.findUniqueOrThrow({ where: { projectId_code: { projectId, code: `GATE-${item.phase - 1}` } } }) : null;
      const data = {
        projectId, phaseId: phase.id, title: item.title, description: `Atividade ${item.code} do Plano C da Ollem.`,
        objective: item.title, instructions: `Executar ${item.title.toLocaleLowerCase('pt-BR')} conforme o padrão acordado com a JGM4 e registrar evidências.`,
        acceptanceCriteria: `${item.title} concluído e evidências aceitas pela JGM4.`,
        responsibilityType: 'JOINT' as const, plannedJgm4Hours: item.jgm4, plannedClientHours: item.client,
        predecessorTaskId: previous?.id ?? null, blockedByGateId: gate?.id ?? null,
        nextAction: 'Aguardar liberação das dependências.', currentOwnerType: 'SYSTEM',
      };
      if (item.code === 'C00') {
        const legacy = await tx.task.findUnique({ where: { projectId_code: { projectId, code: 'F0-001' } } });
        if (legacy) await tx.task.update({ where: { id: legacy.id }, data: { code: 'C00', ...data } });
      }
      const existingTask = await tx.task.findUnique({ where: { projectId_code: { projectId, code: item.code } } });
      const created = await tx.task.upsert({ where: { projectId_code: { projectId, code: item.code } }, update: {}, create: {
        ...data, code: item.code, status: 'BLOCKED',
      } });
      if (!existingTask) await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: created.id, action: 'PLAN_CREATED', actorType: 'SYSTEM', newValue: {
        code: item.code, plannedJgm4Hours: item.jgm4, plannedClientHours: item.client,
        predecessorTaskId: previous?.id ?? null, blockedByGateId: gate?.id ?? null,
      } } });
      const existingReq = item.request ? await tx.projectRequest.findUnique({ where: { projectId_code: { projectId, code: item.request } } }) : null;
      if (item.request && existingReq && existingReq.taskId !== created.id) {
        await tx.projectRequest.update({ where: { id: existingReq.id }, data: { taskId: created.id } });
      }
      for (const label of ['Executar as atividades previstas.', 'Registrar evidências do resultado.']) {
        await tx.taskRequirement.upsert({ where: { taskId_label: { taskId: created.id, label } }, update: {}, create: { taskId: created.id, label } });
      }
    }
    for (const phase of await tx.phase.findMany({ where: { projectId }, select: { id: true } })) {
      const estimate = await tx.task.aggregate({ where: { projectId, phaseId: phase.id }, _sum: { plannedClientHours: true } });
      await tx.phase.updateMany({ where: { id: phase.id, plannedClientHours: null }, data: { plannedClientHours: estimate._sum.plannedClientHours ?? 0 } });
    }
    await ensurePlanCRequests(tx, projectId);
    let released = true;
    while (released) {
      released = false;
      const blocked = await tx.task.findMany({ where: { projectId, status: { in: ['BLOCKED', 'NOT_STARTED'] } }, include: {
        predecessor: { select: { status: true } }, gate: { select: { status: true } },
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { id: true } },
      } });
      for (const task of blocked) {
        if (task.requests.length || (task.predecessor && task.predecessor.status !== 'COMPLETED') || (task.gate && task.gate.status !== 'APPROVED')) continue;
        const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version, status: task.status }, data: {
          status: 'RELEASED', currentOwnerType: task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT',
          nextAction: 'Iniciar a atividade liberada.', version: { increment: 1 },
        } });
        if (changed.count) {
          await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: task.id, action: 'RELEASED', actorType: 'SYSTEM',
            oldValue: { status: task.status, version: task.version }, newValue: { status: 'RELEASED', version: task.version + 1 } } });
          released = true;
        }
      }
    }
  }, { timeout: 30000 });
  if (process.env.OLLEM_LEGACY_FIXTURE !== 'true') await reviseOllem(prisma, projectId);
  if (production) { console.log('Produção: seed base concluído; demonstrações e usuários de desenvolvimento NÃO foram criados.'); return; }
  const demo = await prisma.$transaction((tx) => seedApprovalsDemo(tx), { timeout: 30000 });
  if (demo) console.log('Cenário de demonstração da Etapa 5 criado: projetos "Simulação — ..." com 1 solicitação, 1 atividade, 1 Gate e 1 alteração de prazo pendentes.');
  const dashboardDemo = await prisma.$transaction((tx) => seedDashboardDemo(tx), { timeout: 60000 });
  if (dashboardDemo) console.log('Cenário do dashboard (Etapa 6) criado: projeto "Simulação — Painel executivo".');
  const reportsDemo = await prisma.$transaction((tx) => seedReportsDemo(tx), { timeout: 60000 });
  if (reportsDemo) console.log('Cenário dos relatórios (Etapa 7) criado: projeto "Simulação — Implantação concluída".');
  const users = await seedUsers(prisma);
  await linkReportsDemoUsers(prisma);
  console.log(users.skipped ? 'Usuários não criados: em produção defina SEED_USER_PASSWORD.' : `Usuários de desenvolvimento: ${users.created} criado(s); vínculos de projeto garantidos.`);
  console.log('Seed Ollem pronto. Registros existentes preservados; revisão aplicada quando habilitada.');
}
seed().catch(() => { console.error('Falha no seed. Verifique a conexão e as migrations.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
