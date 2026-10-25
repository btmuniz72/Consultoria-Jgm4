import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { ensurePlanCRequests } from '../src/requests/plan-c-requests';
import { seedApprovalsDemo } from './seed-approvals-demo';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: new URL(connectionString).searchParams.get('schema') || 'public' }) });
const companyId = '9f1ead00-1c44-4000-8000-000000000001';
const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const phases = [
  { name: 'Organizar a base', weeks: 3, hours: 36,
    description: 'Kick-off, responsáveis, levantamento físico, linha de base, 5S, saneamento, zoneamento, DDS e gestão visual inicial.',
    title: 'Base organizada', question: 'A base física e operacional está suficientemente organizada para iniciar o controle estruturado?' },
  { name: 'Controlar', weeks: 3, hours: 39,
    description: 'Endereçamento, área-piloto, criticidade, inventário e treinamento.',
    title: 'Controle funcionando', question: 'O padrão de localização e inventário funciona na prática e é compreendido pela equipe?' },
  { name: 'Padronizar', weeks: 4, hours: 47,
    description: 'POPs, pré-separação, veículos, quarentena, devolução, descarte, DDS, gestão visual e rotina operacional.',
    title: 'Processos padronizados', question: 'As rotinas são executadas de forma estável e sem depender exclusivamente da memória das pessoas?' },
  { name: 'Governar', weeks: 3, hours: 39,
    description: 'Responsabilidades, fonte oficial de informação, cadastro, indicadores, controles e governança operacional e sistêmica.',
    title: 'Governança consolidada', question: 'Os dados, controles e responsabilidades estão claros e suficientemente estáveis?' },
  { name: 'Estabilizar e validar', weeks: 3, hours: 37,
    description: 'Inventário de validação, revisão de divergências, auditoria de POPs, validação de endereçamento, indicadores, plano de sustentação e fechamento.',
    title: 'Operação estabilizada', question: 'A Ollem consegue sustentar o modelo implantado com autonomia operacional?' },
];

async function seed() {
  await prisma.$transaction(async (tx) => {
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
      const criteria: string[][] = [
        ['Responsáveis internos definidos', 'Kick-off concluído', 'Levantamento físico suficiente para a próxima etapa', 'Área-piloto saneada', 'Zoneamento inicial definido', 'Linha de base registrada', 'DDS/rotina de acompanhamento iniciada', 'Todas as atividades obrigatórias da fase concluídas', 'Todas as solicitações bloqueantes da fase aceitas'],
        ['Piloto de endereçamento concluído', 'Posições identificadas', 'Teste de localização realizado', 'CR1/CR2/CR3 definidos', 'Inventário cíclico executado', 'Divergências analisadas', 'Equipe treinada', 'Atividades obrigatórias concluídas', 'Solicitações bloqueantes aceitas'],
        ['POPs prioritários disponíveis', 'Equipe treinada', 'Pré-separação funcionando', 'Regra de veículos implementada', 'Quarentena funcionando', 'Devolução controlada', 'Descarte controlado', 'Gestão visual ativa', 'Desvios registrados e tratados', 'Atividades obrigatórias concluídas'],
        ['Responsáveis definidos', 'Fontes oficiais definidas', 'Padrão cadastral aplicado', 'Indicadores ativos', 'Pendências com responsáveis e prazos', 'Governança documentada', 'Atividades obrigatórias concluídas'],
        ['Inventário de validação concluído', 'Divergências relevantes analisadas', 'POPs auditados', 'Endereçamento preservado', 'Zonas mantidas', 'Indicadores utilizados', 'Plano de sustentação criado', 'Pendências residuais registradas', 'Atividades obrigatórias concluídas'],
      ][order];
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
    const plannedTasks = [
      // Fase 0: distribuição informada na Etapa 3; soma = 36 h.
      { phase: 0, code: 'C00', title: 'Kick-off e alinhamento', jgm4: 6, client: 2, predecessor: null, request: null },
      { phase: 0, code: 'C01', title: 'Croqui, planta e medidas', jgm4: 8, client: 6, predecessor: 'C00', request: null },
      { phase: 0, code: 'C02', title: 'Mapeamento dos fluxos', jgm4: 4, client: 4, predecessor: 'C01', request: null },
      { phase: 0, code: 'C03', title: 'Linha de base', jgm4: 6, client: 6, predecessor: 'C02', request: null },
      { phase: 0, code: 'C04', title: '5S e saneamento piloto', jgm4: 5, client: 12, predecessor: 'C03', request: null },
      { phase: 0, code: 'C05', title: 'Zoneamento', jgm4: 4, client: 8, predecessor: null, request: 'SOL-006' },
      { phase: 0, code: 'C06', title: 'DDS e gestão visual inicial', jgm4: 1, client: 2, predecessor: 'C04', request: null },
      { phase: 0, code: 'G0', title: 'Preparação e análise do Gate 0', jgm4: 2, client: 1, predecessor: 'C06', request: null },
      // Distribuição inicial de referência, preservável como estimativa operacional.
      { phase: 1, code: 'C10', title: 'Definir padrão de endereçamento', jgm4: 7, client: 5, predecessor: null, request: null },
      { phase: 1, code: 'C11', title: 'Implantar área piloto', jgm4: 8, client: 10, predecessor: 'C10', request: null },
      { phase: 1, code: 'C12', title: 'Classificar criticidade', jgm4: 6, client: 5, predecessor: 'C11', request: null },
      { phase: 1, code: 'C13', title: 'Realizar inventário inicial', jgm4: 8, client: 12, predecessor: 'C12', request: null },
      { phase: 1, code: 'C14', title: 'Treinar equipe no padrão', jgm4: 7, client: 6, predecessor: 'C13', request: null },
      { phase: 1, code: 'G1', title: 'Preparação e análise do Gate 1', jgm4: 3, client: 1, predecessor: 'C14', request: null },
      { phase: 2, code: 'C20', title: 'Desenhar POPs prioritários', jgm4: 9, client: 7, predecessor: null, request: null },
      { phase: 2, code: 'C21', title: 'Implantar pré-separação', jgm4: 8, client: 8, predecessor: 'C20', request: null },
      { phase: 2, code: 'C22', title: 'Padronizar rotina de veículos', jgm4: 7, client: 6, predecessor: 'C21', request: null },
      { phase: 2, code: 'C23', title: 'Definir quarentena e devolução', jgm4: 7, client: 7, predecessor: 'C22', request: null },
      { phase: 2, code: 'C24', title: 'Organizar descarte e gestão visual', jgm4: 8, client: 10, predecessor: 'C23', request: null },
      { phase: 2, code: 'C25', title: 'Estabelecer rotina de DDS', jgm4: 5, client: 4, predecessor: 'C24', request: null },
      { phase: 2, code: 'G2', title: 'Preparação e análise do Gate 2', jgm4: 3, client: 1, predecessor: 'C25', request: null },
      { phase: 3, code: 'C30', title: 'Definir responsabilidades operacionais', jgm4: 7, client: 5, predecessor: null, request: null },
      { phase: 3, code: 'C31', title: 'Estabelecer fonte oficial de dados', jgm4: 7, client: 5, predecessor: 'C30', request: null },
      { phase: 3, code: 'C32', title: 'Revisar cadastros e controles', jgm4: 8, client: 8, predecessor: 'C31', request: null },
      { phase: 3, code: 'C33', title: 'Definir indicadores de operação', jgm4: 8, client: 6, predecessor: 'C32', request: null },
      { phase: 3, code: 'C34', title: 'Validar governança e rotina', jgm4: 6, client: 4, predecessor: 'C33', request: null },
      { phase: 3, code: 'G3', title: 'Preparação e análise do Gate 3', jgm4: 3, client: 1, predecessor: 'C34', request: null },
      { phase: 4, code: 'C40', title: 'Executar inventário de validação', jgm4: 8, client: 12, predecessor: null, request: null },
      { phase: 4, code: 'C41', title: 'Revisar divergências e endereçamento', jgm4: 7, client: 8, predecessor: 'C40', request: null },
      { phase: 4, code: 'C42', title: 'Auditar aderência aos POPs', jgm4: 6, client: 6, predecessor: 'C41', request: null },
      { phase: 4, code: 'C43', title: 'Consolidar indicadores finais', jgm4: 6, client: 5, predecessor: 'C42', request: null },
      { phase: 4, code: 'C44', title: 'Preparar plano de sustentação', jgm4: 7, client: 8, predecessor: 'C43', request: null },
      { phase: 4, code: 'G4', title: 'Preparação e análise do Gate 4', jgm4: 3, client: 1, predecessor: 'C44', request: null },
    ];
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
  const demo = await prisma.$transaction((tx) => seedApprovalsDemo(tx), { timeout: 30000 });
  if (demo) console.log('Cenário de demonstração da Etapa 5 criado: projetos "Simulação — ..." com 1 solicitação, 1 atividade, 1 Gate e 1 alteração de prazo pendentes.');
  console.log('Seed Ollem pronto: empresa/projeto, 5 fases, 5 Gates, atividades C00 a C44 e G0 a G4, 10 solicitações e checklists. Fase 0 soma 36 h JGM4. Registros existentes preservados.');
}
seed().catch(() => { console.error('Falha no seed. Verifique a conexão e as migrations.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
