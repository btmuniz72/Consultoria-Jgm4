import type { PrismaClient, Prisma } from '../src/generated/prisma/client';

// Cenário de demonstração dos relatórios (Etapa 7): projeto "Simulação — Implantação concluída" com as 5 fases
// encerradas, todos os Gates aprovados, horas, plano de sustentação e uma pendência residual. Habilita o
// Relatório Final e os relatórios de encerramento de fase. Idempotente; não toca o projeto Ollem real.
export const reportsDemoCompanyId = '9f1ead00-1c44-4000-8000-0000000000d1';
export const reportsDemoProjectId = '9f1ead00-1c44-4000-8000-0000000000d5';
const DAY = 86400000;
const today = () => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); };
const inDays = (n: number) => new Date(today().getTime() + n * DAY);
const phases = [
  { name: 'Organizar a base', weeks: 3, hours: 36, gate: ['Base organizada', 'A base física e operacional está suficientemente organizada para iniciar o controle estruturado?'] },
  { name: 'Controlar', weeks: 3, hours: 39, gate: ['Controle funcionando', 'O padrão de localização e inventário funciona na prática e é compreendido pela equipe?'] },
  { name: 'Padronizar', weeks: 4, hours: 47, gate: ['Processos padronizados', 'As rotinas são executadas de forma estável e sem depender exclusivamente da memória das pessoas?'] },
  { name: 'Governar', weeks: 3, hours: 39, gate: ['Governança consolidada', 'Os dados, controles e responsabilidades estão claros e suficientemente estáveis?'] },
  { name: 'Estabilizar e validar', weeks: 3, hours: 37, gate: ['Operação estabilizada', 'A Ollem consegue sustentar o modelo implantado com autonomia operacional?'] },
];
const taskTitles = [
  ['Kick-off e alinhamento', 'Croqui, planta e medidas', 'Zoneamento'], ['Padrão de endereçamento', 'Área piloto implantada', 'Inventário inicial'], ['POPs prioritários', 'Pré-separação', 'Rotina de DDS'],
  ['Responsabilidades operacionais', 'Fonte oficial de dados', 'Indicadores de operação'], ['Inventário de validação', 'Auditoria dos POPs', 'Plano de sustentação'],
];

export async function seedReportsDemo(tx: Prisma.TransactionClient) {
  if (await tx.project.findUnique({ where: { id: reportsDemoProjectId } })) return false;
  if (!await tx.company.findUnique({ where: { id: reportsDemoCompanyId } })) return false;
  const projectId = reportsDemoProjectId;
  await tx.project.create({ data: { id: projectId, companyId: reportsDemoCompanyId, name: 'Simulação — Implantação concluída', methodology: 'PLANO_C', status: 'IMPLEMENTATION_COMPLETED',
    description: 'Implantação de melhorias no almoxarifado, da organização da base à estabilização operacional e sustentação do modelo implantado (projeto de simulação concluído).',
    plannedStartDate: inDays(-130), plannedEndDate: inDays(-12), actualStartDate: inDays(-130), actualEndDate: inDays(-10) } });
  const phaseIds: string[] = []; const gateIds: string[] = [];
  for (const [order, item] of phases.entries()) {
    const start = -130 + order * 24; const end = start + 22; const decided = new Date(Date.now() + (end + 1) * DAY);
    const phase = await tx.phase.create({ data: { projectId, order, name: item.name, description: `Fase ${order} — ${item.name} (simulação concluída).`, plannedWeeks: item.weeks, plannedJgm4Hours: item.hours, status: 'COMPLETED', actualStartDate: inDays(start), actualEndDate: inDays(end) } });
    phaseIds.push(phase.id);
    const gate = await tx.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: item.gate[0], question: item.gate[1], status: 'APPROVED', currentOwnerType: 'SYSTEM', nextAction: 'Gate aprovado; fase seguinte liberada.',
      technicalRecommendation: 'ADVANCE', technicalOpinion: 'Critérios obrigatórios atendidos e evidências verificadas pela JGM4.', technicalApprovedAt: new Date(decided.getTime() - 3600000), clientDecision: 'APPROVE', clientDecisionComment: 'Avanço autorizado.', clientDecisionAt: decided } });
    gateIds.push(gate.id);
    await tx.gateCriterion.createMany({ data: [
      { gateId: gate.id, code: `G${order}-C01`, description: 'Responsáveis internos definidos', sourceType: 'MANUAL', order: 1, evidenceRequired: true, satisfied: true, satisfiedAt: decided, evidenceReference: `Ata da fase ${order}` },
      { gateId: gate.id, code: `G${order}-C02`, description: 'Todas as atividades obrigatórias da fase concluídas', sourceType: 'TASK', order: 2, satisfied: true, satisfiedAt: decided },
      { gateId: gate.id, code: `G${order}-C03`, description: 'Todas as solicitações bloqueantes da fase aceitas', sourceType: 'REQUEST', order: 3, satisfied: true, satisfiedAt: decided },
    ] });
    await tx.auditLog.createMany({ data: [
      { projectId, entityType: 'Gate', entityId: gate.id, action: 'START_REVIEW', actorType: 'JGM4_CONSULTANT', createdAt: new Date(decided.getTime() - 7200000), newValue: { status: 'UNDER_REVIEW', demo: true } },
      { projectId, entityType: 'Gate', entityId: gate.id, action: 'TECHNICAL_OPINION', actorType: 'JGM4_CONSULTANT', createdAt: new Date(decided.getTime() - 3600000), newValue: { status: 'TECHNICALLY_APPROVED', technicalRecommendation: 'ADVANCE', demo: true } },
      { projectId, entityType: 'Gate', entityId: gate.id, action: 'CLIENT_DECISION', actorType: 'CLIENT_SPONSOR', createdAt: decided, newValue: { status: 'APPROVED', clientDecision: 'APPROVE', comment: 'Avanço autorizado.', demo: true } },
    ] as Prisma.AuditLogCreateManyInput[] });
    for (const [index, title] of taskTitles[order].entries()) {
      const code = `C${order}${index}`; const done = inDays(start + 6 + index * 5);
      const task = await tx.task.create({ data: { projectId, phaseId: phase.id, code, title, description: `${title} (simulação concluída).`, objective: title, instructions: `Executar ${title.toLocaleLowerCase('pt-BR')}.`, acceptanceCriteria: `${title} concluído.`,
        status: 'COMPLETED', currentOwnerType: 'NONE', nextAction: 'Atividade concluída.', plannedJgm4Hours: item.hours / 3, plannedClientHours: 8, plannedStartDate: inDays(start + index * 5), plannedEndDate: inDays(start + 5 + index * 5), actualStartDate: inDays(start + index * 5), actualEndDate: done } });
      await tx.timeEntry.createMany({ data: [
        { projectId, phaseId: phase.id, taskId: task.id, organizationType: 'JGM4', date: done, hours: Math.round((item.hours / 3) * 100) / 100, description: `Execução de ${title}` },
        { projectId, phaseId: phase.id, taskId: task.id, organizationType: 'CLIENT', date: done, hours: 7.5, description: `Apoio do cliente em ${title}` },
      ] });
    }
    await tx.projectRequest.create({ data: { projectId, phaseId: phase.id, code: `SOL-0${order + 1}`, title: `Informações da fase ${order}`, description: 'Informações solicitadas ao cliente (simulação).', instructions: 'Preencher e enviar.', acceptanceCriteria: 'Aceita pela JGM4.',
      status: 'ACCEPTED', mandatory: true, blocking: order === 0, dueDate: inDays(start + 4) } });
  }
  // Atividades fora do prazo e desvio de horas na Fase 2 (para o relatório de encerramento mostrar desvios).
  await tx.task.update({ where: { projectId_code: { projectId, code: 'C20' } }, data: { actualEndDate: inDays(-130 + 48 + 9), plannedEndDate: inDays(-130 + 48 + 5) } });
  await tx.sustainmentItem.createMany({ data: [
    { projectId, routine: 'Inventário cíclico semanal por curva ABC', frequency: 'Semanal', responsible: 'Supervisor do almoxarifado', indicator: 'Acuracidade de estoque', criterion: '≥ 98% de acuracidade', nextReviewDate: inDays(30) },
    { projectId, routine: 'Auditoria de aderência aos POPs', frequency: 'Mensal', responsible: 'Gestor do almoxarifado', indicator: 'Aderência aos POPs', criterion: '≥ 95% de conformidade', nextReviewDate: inDays(45) },
    { projectId, routine: 'Revisão do plano de sustentação', frequency: 'Trimestral', responsible: 'Patrocinador', indicator: 'Itens do plano em dia', criterion: 'Nenhum item vencido', nextReviewDate: inDays(90) },
  ] });
  await tx.carriedOverItem.create({ data: { projectId, fromPhaseId: phaseIds[3], toPhaseId: phaseIds[4], description: 'Revisar cadastro de itens de baixa rotatividade', responsible: 'Analista de cadastro', dueDate: inDays(20) } });
  await tx.approval.create({ data: { projectId, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: (await tx.task.findUniqueOrThrow({ where: { projectId_code: { projectId, code: 'C20' } } })).id, entityCode: 'C20', title: 'C20 — Alteração de prazo',
    description: 'Dependência de fornecedor.', status: 'APPROVED', decision: 'APPROVED', decisionComment: 'Prazo ajustado.', decidedAt: inDays(-80), decidedByRole: 'JGM4_ADMIN', requestedByRole: 'CLIENT_MANAGER', priority: 'NORMAL' } });
  return true;
}

// Depois que os usuários de desenvolvimento existem, associa os pareceres/decisões do cenário aos usuários demo.
export async function linkReportsDemoUsers(prisma: PrismaClient) {
  const [consultant, sponsor] = await Promise.all([prisma.user.findUnique({ where: { email: 'consultor@jgm4.local' } }), prisma.user.findUnique({ where: { email: 'sponsor@demo.ollem.local' } })]);
  if (!consultant || !sponsor) return;
  await prisma.gate.updateMany({ where: { projectId: reportsDemoProjectId, technicalApprovedByUserId: null }, data: { technicalApprovedByUserId: consultant.id, clientDecisionByUserId: sponsor.id } });
}
