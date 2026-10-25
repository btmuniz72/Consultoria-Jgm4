import type { Prisma } from '../src/generated/prisma/client';
import { ensureApproval } from '../src/approvals/approval-sync';

// Cenário de demonstração da Central de Aprovações (Etapa 5).
// Fica em projetos de simulação próprios para não alterar o projeto Ollem real validado nas Etapas 1–4.
// Idempotente: se o projeto de simulação já existe, nada é recriado.
const companyId = '9f1ead00-1c44-4000-8000-0000000000d1';
const mainId = '9f1ead00-1c44-4000-8000-0000000000d2';
const gateProjectId = '9f1ead00-1c44-4000-8000-0000000000d3';
const day = 86400000;
const startOfToday = () => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); };
const inDays = (n: number) => new Date(startOfToday().getTime() + n * day);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedApprovalsDemo(tx: Prisma.TransactionClient) {
  if (await tx.project.findUnique({ where: { id: mainId } })) return false;
  await tx.company.upsert({ where: { id: companyId }, update: {}, create: { id: companyId, name: 'Ollem do Brasil — Demonstração' } });
  const phase = async (projectId: string, order: number, status: 'AVAILABLE' | 'LOCKED' | 'WAITING_GATE', name: string) => tx.phase.create({
    data: { projectId, order, name, description: `Fase de simulação: ${name}.`, plannedWeeks: 3, plannedJgm4Hours: 36, status } });
  const gate = async (projectId: string, phaseId: string, order: number, title: string, question: string, extra: Prisma.GateUncheckedCreateInput | object = {}) => tx.gate.create({
    data: { projectId, phaseId, code: `GATE-${order}`, title, question, ...extra } as Prisma.GateUncheckedCreateInput });
  const task = (projectId: string, phaseId: string, code: string, title: string, data: object = {}) => tx.task.create({
    data: { projectId, phaseId, code, title, description: `Atividade ${code} da simulação.`, objective: title, instructions: `Executar ${title.toLocaleLowerCase('pt-BR')} e registrar evidências.`,
      acceptanceCriteria: `${title} concluído e evidências aceitas pela JGM4.`, plannedJgm4Hours: 4, plannedClientHours: 6, ...data } as Prisma.TaskUncheckedCreateInput });

  // --- Simulação 1: solicitação aguardando JGM4, atividade aguardando validação, alteração de prazo pendente.
  await tx.project.create({ data: { id: mainId, companyId, name: 'Simulação — Solicitações e atividades', methodology: 'PLANO_C',
    description: 'Projeto de simulação da Central de Aprovações: uma solicitação aguardando JGM4, uma atividade aguardando validação e uma alteração de prazo pendente.' } });
  const p0 = await phase(mainId, 0, 'AVAILABLE', 'Organizar a base');
  const p1 = await phase(mainId, 1, 'LOCKED', 'Controlar');
  await gate(mainId, p0.id, 0, 'Base organizada', 'A base física e operacional está suficientemente organizada para iniciar o controle estruturado?');
  await gate(mainId, p1.id, 1, 'Controle funcionando', 'O padrão de localização e inventário funciona na prática e é compreendido pela equipe?');

  const c05 = await task(mainId, p0.id, 'C05', 'Zoneamento', { status: 'WAITING_JGM4_VALIDATION', currentOwnerType: 'JGM4', nextAction: 'Validar evidências de zoneamento.',
    nextActionDueDate: inDays(2), plannedStartDate: inDays(-14), plannedEndDate: inDays(3), actualStartDate: inDays(-10) });
  for (const label of ['Executar as atividades previstas.', 'Registrar evidências do resultado.']) await tx.taskRequirement.create({ data: { taskId: c05.id, label, completed: true, completedAt: new Date() } });
  await tx.taskEvidence.create({ data: { projectId: mainId, phaseId: p0.id, taskId: c05.id, description: 'Planta com zoneamento implantado e fotos dos corredores demarcados.', referenceUrl: 'https://exemplo.local/evidencias/zoneamento' } });
  const c04 = await task(mainId, p0.id, 'C04', '5S e saneamento piloto', { status: 'IN_PROGRESS', currentOwnerType: 'CLIENT', nextAction: 'Executar a atividade, completar o checklist e registrar evidências.',
    plannedStartDate: inDays(-12), plannedEndDate: inDays(5), actualStartDate: inDays(-9) });
  const c06 = await task(mainId, p0.id, 'C06', 'DDS e gestão visual inicial', { status: 'BLOCKED', currentOwnerType: 'SYSTEM', predecessorTaskId: c04.id, nextAction: 'Aguardar o atendimento das dependências.' });

  const sol = await tx.projectRequest.create({ data: { projectId: mainId, phaseId: p0.id, taskId: c06.id, code: 'SOL-006', title: 'Levantamento dimensional do Depósito 01', status: 'SENT_TO_JGM4',
    description: 'Consolidar as dimensões do Depósito 01 necessárias à definição do zoneamento operacional.', instructions: 'Medir comprimento e largura; identificar corredores, pilares, acessos e estruturas existentes; consolidar o croqui.',
    acceptanceCriteria: 'Os seis requisitos estão completos e as informações são suficientes para validar o zoneamento.', mandatory: true, blocking: true, dueDate: inDays(1), estimatedClientHours: 6 } });
  for (const [order, label] of ['Comprimento e largura', 'Corredores', 'Pilares', 'Acessos', 'Estruturas existentes', 'Croqui consolidado'].entries()) {
    await tx.requestRequirement.create({ data: { requestId: sol.id, label, order, completed: true, completedAt: new Date() } });
  }
  const log = (projectId: string, entityType: string, entityId: string, action: string, newValue: object) => tx.auditLog.create({ data: { projectId, entityType, entityId, action, actorType: 'SYSTEM', newValue: { ...newValue, demo: true } } });
  await log(mainId, 'ProjectRequest', sol.id, 'STATUS_CHANGED', { status: 'SENT_TO_JGM4' });
  await log(mainId, 'Task', c05.id, 'SUBMIT_EVIDENCE', { status: 'WAITING_JGM4_VALIDATION' });

  await ensureApproval(tx, { projectId: mainId, type: 'REQUEST_REVIEW', entityType: 'ProjectRequest', entityId: sol.id, entityCode: sol.code, title: `${sol.code} — ${sol.title}`, description: sol.description,
    assignedRole: 'JGM4_CONSULTANT', requestedByRole: 'CLIENT_MANAGER', priority: 'HIGH', dueAt: inDays(1), requestedAt: new Date(Date.now() - 2 * day) });
  await ensureApproval(tx, { projectId: mainId, type: 'TASK_VALIDATION', entityType: 'Task', entityId: c05.id, entityCode: 'C05', title: 'C05 — Zoneamento', description: c05.objective,
    assignedRole: 'JGM4_CONSULTANT', requestedByRole: 'CLIENT_MANAGER', dueAt: inDays(2), requestedAt: new Date(Date.now() - day) });
  const newEnd = inDays(19);
  await ensureApproval(tx, { projectId: mainId, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: c04.id, entityCode: 'C04', title: 'C04 — Alteração de prazo',
    description: 'Fornecedor de sinalização atrasou a entrega do material de demarcação.', assignedRole: 'JGM4_ADMIN', requestedByRole: 'CLIENT_MANAGER', priority: 'HIGH', dueAt: inDays(5),
    payload: { currentDate: iso(inDays(5)), newDate: iso(newEnd), deltaDays: 14, justification: 'Fornecedor de sinalização atrasou a entrega do material de demarcação.', expectedImpact: 'Gate 0 atrasa duas semanas.' } });
  await log(mainId, 'Task', c04.id, 'DUE_DATE_CHANGE_REQUESTED', { currentDate: iso(inDays(5)), newDate: iso(newEnd) });

  // --- Simulação 2: Gate disponível aguardando parecer técnico JGM4 (todas as atividades concluídas).
  await tx.project.create({ data: { id: gateProjectId, companyId, name: 'Simulação — Parecer de Gate', methodology: 'PLANO_C',
    description: 'Projeto de simulação com o Gate 0 disponível e aguardando o parecer técnico da JGM4. Ao emitir parecer favorável, a decisão passa ao patrocinador.' } });
  const q0 = await phase(gateProjectId, 0, 'WAITING_GATE', 'Organizar a base');
  const q1 = await phase(gateProjectId, 1, 'LOCKED', 'Controlar');
  const qg0 = await gate(gateProjectId, q0.id, 0, 'Base organizada', 'A base física e operacional está suficientemente organizada para iniciar o controle estruturado?',
    { status: 'AVAILABLE', currentOwnerType: 'JGM4', nextAction: 'Iniciar análise do Gate.', nextActionDueDate: inDays(2) });
  await gate(gateProjectId, q1.id, 1, 'Controle funcionando', 'O padrão de localização e inventário funciona na prática e é compreendido pela equipe?');
  for (const code of ['C00', 'C01', 'C02']) await task(gateProjectId, q0.id, code, `Atividade ${code}`, { status: 'COMPLETED', actualEndDate: inDays(-3), currentOwnerType: 'NONE', nextAction: 'Atividade concluída.' });
  await task(gateProjectId, q1.id, 'C10', 'Definir padrão de endereçamento', { status: 'BLOCKED', blockedByGateId: qg0.id, nextAction: 'Aguardar o atendimento das dependências.' });
  await tx.gateCriterion.createMany({ data: [
    { gateId: qg0.id, code: 'G0-C01', description: 'Responsáveis internos definidos', sourceType: 'MANUAL', order: 1, evidenceRequired: true, satisfied: true, satisfiedAt: new Date(), evidenceReference: 'Ata de kick-off' },
    { gateId: qg0.id, code: 'G0-C02', description: 'Todas as atividades obrigatórias da fase concluídas', sourceType: 'TASK', order: 2, satisfied: true, satisfiedAt: new Date() },
    { gateId: qg0.id, code: 'G0-C03', description: 'Todas as solicitações bloqueantes da fase aceitas', sourceType: 'REQUEST', order: 3, satisfied: true, satisfiedAt: new Date() },
  ] });
  await log(gateProjectId, 'Gate', qg0.id, 'GATE_AVAILABLE', { status: 'AVAILABLE' });
  await ensureApproval(tx, { projectId: gateProjectId, type: 'GATE_TECHNICAL_OPINION', entityType: 'Gate', entityId: qg0.id, entityCode: 'GATE-0', title: 'GATE-0 — Base organizada',
    description: qg0.question, assignedRole: 'JGM4_CONSULTANT', priority: 'HIGH', dueAt: inDays(2), requestedAt: new Date(Date.now() - day) });
  return true;
}
