import type { Prisma } from '../src/generated/prisma/client';
import { ensureApproval } from '../src/approvals/approval-sync';

// Cenário de demonstração do dashboard (Etapa 6): projeto "Simulação — Painel executivo" com Fase 0 concluída,
// Fase 1 em execução (horas JGM4 em atenção, uma atividade e uma solicitação atrasadas), Fases 2–4 bloqueadas,
// solicitações em vários estados, horas JGM4 e do cliente, aprovações pendentes e histórico recente.
// Fica em projeto próprio para não alterar o projeto Ollem real validado nas Etapas 1–5.1. Idempotente.
export const dashboardDemoCompanyId = '9f1ead00-1c44-4000-8000-0000000000d1';
export const dashboardDemoProjectId = '9f1ead00-1c44-4000-8000-0000000000d4';
const DAY = 86400000;
const today = () => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); };
const inDays = (n: number) => new Date(today().getTime() + n * DAY);
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
const iso = (date: Date) => date.toISOString().slice(0, 10);

type Def = [code: string, title: string, jgm4: number, client: number];
const phase0: Def[] = [['C00', 'Kick-off e alinhamento', 6, 2], ['C01', 'Croqui, planta e medidas', 8, 6], ['C02', 'Mapeamento dos fluxos', 4, 4], ['C03', 'Linha de base', 6, 6], ['C04', '5S e saneamento piloto', 5, 12], ['C05', 'Zoneamento', 4, 8], ['C06', 'DDS e gestão visual inicial', 1, 2], ['G0', 'Preparação e análise do Gate 0', 2, 1]];
const later: Def[][] = [
  [],
  [['C10', 'Definir padrão de endereçamento', 7, 5], ['C11', 'Implantar área piloto', 8, 10], ['C12', 'Classificar criticidade', 6, 5], ['C13', 'Realizar inventário inicial', 8, 12], ['C14', 'Treinar equipe no padrão', 7, 6], ['G1', 'Preparação e análise do Gate 1', 3, 1]],
  [['C20', 'Desenhar POPs prioritários', 9, 7], ['C21', 'Implantar pré-separação', 8, 8], ['C22', 'Padronizar rotina de veículos', 7, 6], ['C23', 'Definir quarentena e devolução', 7, 7], ['C24', 'Organizar descarte e gestão visual', 8, 10], ['C25', 'Estabelecer rotina de DDS', 5, 4], ['G2', 'Preparação e análise do Gate 2', 3, 1]],
  [['C30', 'Definir responsabilidades operacionais', 7, 5], ['C31', 'Estabelecer fonte oficial de dados', 7, 5], ['C32', 'Revisar cadastros e controles', 8, 8], ['C33', 'Definir indicadores de operação', 8, 6], ['C34', 'Validar governança e rotina', 6, 4], ['G3', 'Preparação e análise do Gate 3', 3, 1]],
  [['C40', 'Executar inventário de validação', 8, 12], ['C41', 'Revisar divergências e endereçamento', 7, 8], ['C42', 'Auditar aderência aos POPs', 6, 6], ['C43', 'Consolidar indicadores finais', 6, 5], ['C44', 'Preparar plano de sustentação', 7, 8], ['G4', 'Preparação e análise do Gate 4', 3, 1]],
];
const phases = [
  { name: 'Organizar a base', weeks: 3, hours: 36, gate: ['Base organizada', 'A base física e operacional está suficientemente organizada para iniciar o controle estruturado?'] },
  { name: 'Controlar', weeks: 3, hours: 39, gate: ['Controle funcionando', 'O padrão de localização e inventário funciona na prática e é compreendido pela equipe?'] },
  { name: 'Padronizar', weeks: 4, hours: 47, gate: ['Processos padronizados', 'As rotinas são executadas de forma estável e sem depender exclusivamente da memória das pessoas?'] },
  { name: 'Governar', weeks: 3, hours: 39, gate: ['Governança consolidada', 'Os dados, controles e responsabilidades estão claros e suficientemente estáveis?'] },
  { name: 'Estabilizar e validar', weeks: 3, hours: 37, gate: ['Operação estabilizada', 'A Ollem consegue sustentar o modelo implantado com autonomia operacional?'] },
];

export async function seedDashboardDemo(tx: Prisma.TransactionClient) {
  if (await tx.project.findUnique({ where: { id: dashboardDemoProjectId } })) return false;
  if (!await tx.company.findUnique({ where: { id: dashboardDemoCompanyId } })) return false;
  const projectId = dashboardDemoProjectId;
  await tx.project.create({ data: { id: projectId, companyId: dashboardDemoCompanyId, name: 'Simulação — Painel executivo', methodology: 'PLANO_C', status: 'IN_PROGRESS',
    description: 'Projeto de simulação para o dashboard: Fase 0 concluída, Fase 1 em execução com horas em atenção, itens atrasados, aprovações pendentes e histórico recente.',
    plannedStartDate: inDays(-35), plannedEndDate: inDays(77) } });
  const phaseIds: string[] = []; const gateIds: string[] = [];
  for (const [order, item] of phases.entries()) {
    const phase = await tx.phase.create({ data: { projectId, order, name: item.name, description: `Fase ${order} da simulação.`, plannedWeeks: item.weeks, plannedJgm4Hours: item.hours,
      status: order === 0 ? 'COMPLETED' : order === 1 ? 'IN_PROGRESS' : 'LOCKED', actualStartDate: order <= 1 ? inDays(order === 0 ? -35 : -14) : null, actualEndDate: order === 0 ? inDays(-15) : null } });
    phaseIds.push(phase.id);
    const approved = order === 0;
    const gate = await tx.gate.create({ data: { projectId, phaseId: phase.id, code: `GATE-${order}`, title: item.gate[0], question: item.gate[1], status: approved ? 'APPROVED' : 'BLOCKED',
      currentOwnerType: approved ? 'SYSTEM' : 'SYSTEM', nextAction: approved ? 'Gate aprovado; fase seguinte liberada.' : 'Concluir as atividades e solicitações bloqueantes da fase.',
      technicalRecommendation: approved ? 'ADVANCE' : null, technicalOpinion: approved ? 'Critérios e evidências atendidos.' : null, clientDecision: approved ? 'APPROVE' : null, clientDecisionAt: approved ? inDays(-15) : null } });
    gateIds.push(gate.id);
  }
  // Critérios: Gate 0 completo; Gate 1 com parte dos critérios técnicos já atendidos (andamento visível).
  const criteria = (gateId: string, order: number, satisfied: number) => tx.gateCriterion.createMany({ data: [
    'Piloto de endereçamento concluído', 'Posições identificadas', 'Teste de localização realizado', 'CR1/CR2/CR3 definidos', 'Inventário cíclico executado', 'Divergências analisadas', 'Equipe treinada',
  ].map((description, index) => ({ gateId, code: `G${order}-C0${index + 1}`, description, sourceType: 'MANUAL' as const, order: index + 1, evidenceRequired: true, satisfied: index < satisfied, satisfiedAt: index < satisfied ? ago(30) : null,
    evidenceReference: index < satisfied ? `Evidência ${index + 1}` : null })).concat([
    { gateId, code: `G${order}-C08`, description: 'Todas as atividades obrigatórias da fase concluídas', sourceType: 'TASK' as const, order: 8, evidenceRequired: false, satisfied: order === 0, satisfiedAt: order === 0 ? ago(30) : null, evidenceReference: null },
    { gateId, code: `G${order}-C09`, description: 'Todas as solicitações bloqueantes da fase aceitas', sourceType: 'REQUEST' as const, order: 9, evidenceRequired: false, satisfied: order === 0, satisfiedAt: order === 0 ? ago(30) : null, evidenceReference: null },
  ]) });
  await criteria(gateIds[0], 0, 7); await criteria(gateIds[1], 1, 4);

  const ids = new Map<string, string>();
  const task = async (order: number, [code, title, jgm4, client]: Def, data: Record<string, unknown>) => {
    const created = await tx.task.create({ data: { projectId, phaseId: phaseIds[order], code, title, description: `Atividade ${code} da simulação.`, objective: title, instructions: `Executar ${title.toLocaleLowerCase('pt-BR')} e registrar evidências.`,
      acceptanceCriteria: `${title} concluído e evidências aceitas pela JGM4.`, plannedJgm4Hours: jgm4, plannedClientHours: client, responsibilityType: 'JOINT', ...data } as Prisma.TaskUncheckedCreateInput });
    ids.set(code, created.id); return created;
  };
  for (const def of phase0) await task(0, def, { status: 'COMPLETED', currentOwnerType: 'NONE', nextAction: 'Atividade concluída.', actualStartDate: inDays(-33), actualEndDate: inDays(-16), plannedEndDate: inDays(-15) });
  const [c10, c11, c12, c13, c14, g1] = later[1];
  await task(1, c10, { status: 'COMPLETED', currentOwnerType: 'NONE', nextAction: 'Atividade concluída.', actualStartDate: inDays(-13), actualEndDate: inDays(-9), plannedEndDate: inDays(-8) });
  await task(1, c11, { status: 'COMPLETED', currentOwnerType: 'NONE', nextAction: 'Atividade concluída.', actualStartDate: inDays(-9), actualEndDate: inDays(-4), plannedEndDate: inDays(-3) });
  await task(1, c12, { status: 'IN_PROGRESS', currentOwnerType: 'CLIENT', nextAction: 'Concluir a classificação de criticidade e enviar para validação.', nextActionDueDate: inDays(-2), plannedStartDate: inDays(-4), plannedEndDate: inDays(2), actualStartDate: inDays(-4) });
  const t13 = await task(1, c13, { status: 'WAITING_JGM4_VALIDATION', currentOwnerType: 'JGM4', nextAction: 'Validar as evidências do inventário inicial.', nextActionDueDate: inDays(1), plannedEndDate: inDays(3), actualStartDate: inDays(-6) });
  await task(1, c14, { status: 'BLOCKED', currentOwnerType: 'SYSTEM', nextAction: 'Aguardar o atendimento das dependências.', predecessorTaskId: t13.id });
  await task(1, g1, { status: 'BLOCKED', currentOwnerType: 'SYSTEM', nextAction: 'Aguardar o atendimento das dependências.' });
  for (let order = 2; order <= 4; order++) for (const def of later[order]) await task(order, def, { status: 'BLOCKED', currentOwnerType: 'SYSTEM', nextAction: 'Aguardar liberação das dependências.', blockedByGateId: gateIds[order - 1] });
  await task(2, ['C26', 'Atividade cancelada (fora do escopo)', 0, 0], { status: 'CANCELLED', currentOwnerType: 'NONE', nextAction: 'Atividade cancelada.' });
  await tx.taskRequirement.createMany({ data: ['Executar as atividades previstas.', 'Registrar evidências do resultado.'].map((label) => ({ taskId: t13.id, label, completed: true, completedAt: ago(30) })) });
  await tx.taskEvidence.create({ data: { projectId, phaseId: phaseIds[1], taskId: t13.id, description: 'Planilha de contagem do inventário inicial com divergências analisadas.', referenceUrl: 'https://exemplo.local/evidencias/inventario' } });

  // Horas lançadas (única fonte do realizado): Fase 1 JGM4 = 32 h de 39 h (82% → atenção).
  const entries: [string, 'JGM4' | 'CLIENT', number, number, string][] = [
    ['C00', 'JGM4', 6, -34, 'Kick-off'], ['C01', 'JGM4', 8, -30, 'Medições'], ['C02', 'JGM4', 4, -28, 'Fluxos'], ['C03', 'JGM4', 6, -25, 'Linha de base'], ['C04', 'JGM4', 5, -22, '5S piloto'], ['C05', 'JGM4', 4, -19, 'Zoneamento'], ['C06', 'JGM4', 1, -17, 'DDS'],
    ['C00', 'CLIENT', 2, -34, 'Kick-off'], ['C01', 'CLIENT', 6, -30, 'Medições'], ['C03', 'CLIENT', 6, -25, 'Linha de base'], ['C04', 'CLIENT', 14, -22, '5S piloto'], ['C05', 'CLIENT', 9, -19, 'Zoneamento'],
    ['C10', 'JGM4', 7, -12, 'Padrão de endereçamento'], ['C11', 'JGM4', 8, -8, 'Área piloto'], ['C12', 'JGM4', 8, -3, 'Criticidade'], ['C13', 'JGM4', 9, -2, 'Inventário inicial'],
    ['C10', 'CLIENT', 4, -12, 'Padrão de endereçamento'], ['C11', 'CLIENT', 11, -8, 'Área piloto'], ['C12', 'CLIENT', 3, -3, 'Criticidade'], ['C13', 'CLIENT', 8, -2, 'Inventário inicial'],
  ];
  const timeLogs: Prisma.AuditLogUncheckedCreateInput[] = [];
  for (const [code, org, hours, offset, description] of entries) {
    const order = code.startsWith('C1') ? 1 : 0;
    const entry = await tx.timeEntry.create({ data: { projectId, phaseId: phaseIds[order], taskId: ids.get(code)!, organizationType: org, date: inDays(offset), hours, description } });
    if (offset >= -3) timeLogs.push({ projectId, entityType: 'TimeEntry', entityId: entry.id, action: 'TIME_ENTRY_CREATED', actorType: org === 'JGM4' ? 'JGM4_CONSULTANT' : 'CLIENT_MANAGER', createdAt: new Date(Date.now() + (offset + 1) * DAY - 4 * 3600000), newValue: { code, hours, organizationType: org, demo: true } });
  }

  // Solicitações em vários estados.
  const request = async (order: number, code: string, title: string, status: string, extra: Record<string, unknown> = {}, done = true) => {
    const created = await tx.projectRequest.create({ data: { projectId, phaseId: phaseIds[order], code, title, description: `${title} (simulação).`, instructions: 'Preencher os requisitos e enviar à JGM4.', acceptanceCriteria: 'Requisitos completos e aceitos pela JGM4.',
      mandatory: true, blocking: false, status, ...extra } as Prisma.ProjectRequestUncheckedCreateInput });
    await tx.requestRequirement.createMany({ data: ['Informações principais', 'Evidência de apoio'].map((label, index) => ({ requestId: created.id, label, order: index, completed: done, completedAt: done ? ago(40) : null })) });
    ids.set(code, created.id); return created;
  };
  await request(0, 'SOL-001', 'Informar responsáveis internos', 'ACCEPTED'); await request(0, 'SOL-002', 'Disponibilizar planta do almoxarifado', 'ACCEPTED');
  await request(0, 'SOL-006', 'Levantamento dimensional do Depósito 01', 'ACCEPTED', { blocking: true });
  await request(1, 'SOL-007', 'Resultados do inventário cíclico piloto', 'CLIENT_PREPARING', { dueDate: inDays(-3), clientResponsibleId: null }, false);
  const sol011 = await request(1, 'SOL-011', 'Cadastro de endereços da área piloto', 'SENT_TO_JGM4', { dueDate: inDays(1), blocking: true });
  await request(1, 'SOL-012', 'Lista de criticidade dos itens', 'ADJUSTMENT_REQUESTED', { dueDate: inDays(4) }, false);
  await request(1, 'SOL-013', 'Regras de acesso às áreas restritas', 'AVAILABLE', { dueDate: inDays(6) }, false);
  await request(1, 'SOL-014', 'Relação de equipe para treinamento', 'REQUESTED', { dueDate: inDays(5) }, false);
  await request(2, 'SOL-008', 'Registros de aplicação dos POPs', 'BLOCKED', {}, false);

  // Aprovações pendentes (alinhadas ao estado real das entidades).
  await ensureApproval(tx, { projectId, type: 'REQUEST_REVIEW', entityType: 'ProjectRequest', entityId: sol011.id, entityCode: 'SOL-011', title: 'SOL-011 — Cadastro de endereços da área piloto', description: sol011.description,
    assignedRole: 'JGM4_CONSULTANT', requestedByRole: 'CLIENT_MANAGER', priority: 'HIGH', dueAt: inDays(1), requestedAt: ago(26) });
  await ensureApproval(tx, { projectId, type: 'TASK_VALIDATION', entityType: 'Task', entityId: t13.id, entityCode: 'C13', title: 'C13 — Realizar inventário inicial', description: 'Realizar inventário inicial', assignedRole: 'JGM4_CONSULTANT',
    requestedByRole: 'CLIENT_MANAGER', dueAt: inDays(1), requestedAt: ago(5) });
  const c12Id = ids.get('C12')!;
  await ensureApproval(tx, { projectId, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: c12Id, entityCode: 'C12', title: 'C12 — Alteração de prazo', description: 'Auditoria de criticidade depende de dados do fornecedor.',
    assignedRole: 'JGM4_ADMIN', requestedByRole: 'CLIENT_MANAGER', priority: 'HIGH', dueAt: inDays(2), requestedAt: ago(8),
    payload: { currentDate: iso(inDays(2)), newDate: iso(inDays(9)), deltaDays: 7, justification: 'Auditoria de criticidade depende de dados do fornecedor.', expectedImpact: 'Gate 1 atrasa uma semana.' } });

  // Histórico recente (mais recente primeiro): alimenta o feed "Últimas movimentações".
  const log = (hoursAgo: number, entityType: string, entityId: string, action: string, actorType: string, newValue: object = {}) => ({ projectId, entityType, entityId, action, actorType, createdAt: ago(hoursAgo), newValue: { ...newValue, demo: true } });
  await tx.auditLog.createMany({ data: [
    ...timeLogs,
    log(1, 'Task', c12Id, 'START', 'CLIENT_MANAGER'), log(3, 'ProjectRequest', sol011.id, 'STATUS_CHANGED', 'CLIENT_MANAGER', { status: 'SENT_TO_JGM4' }), log(5, 'Task', t13.id, 'SUBMIT_EVIDENCE', 'CLIENT_MANAGER'),
    log(9, 'ProjectRequest', ids.get('SOL-006')!, 'ACCEPTED', 'JGM4_CONSULTANT'), log(22, 'Task', ids.get('C11')!, 'COMPLETE', 'JGM4_CONSULTANT'),
    log(30, 'Gate', gateIds[0], 'CLIENT_DECISION', 'CLIENT_SPONSOR', { clientDecision: 'APPROVE' }), log(30, 'Phase', phaseIds[0], 'PHASE_COMPLETED', 'CLIENT_SPONSOR'), log(30, 'Phase', phaseIds[1], 'PHASE_RELEASED', 'CLIENT_SPONSOR'),
    log(52, 'Gate', gateIds[0], 'START_REVIEW', 'JGM4_CONSULTANT'),
  ] as Prisma.AuditLogCreateManyInput[] });
  return true;
}
