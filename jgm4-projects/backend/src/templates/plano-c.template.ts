import { Prisma } from '../generated/prisma/client';
import { planCCriteria, planCPhases, planCTasks } from '../plans/plano-c.data';
import { planCRequests } from '../requests/plan-c-requests';

export const PLAN_C_CODE = 'PLAN_C';
const CHECKLIST = ['Executar as atividades previstas.', 'Registrar evidências do resultado.'];

/**
 * Registra o Plano C como template (código PLAN_C, versão 1, ACTIVE) a partir da estrutura aprovada em `plano-c.data.ts` e `plan-c-requests.ts`.
 * Idempotente: se PLAN_C v1 já existir, nada é alterado. Cria somente dados de referência (nenhum usuário ou projeto).
 */
export async function ensurePlanCTemplate(db: Prisma.TransactionClient | { $transaction: Function }, createdByUserId: string | null = null): Promise<{ created: boolean; id: string }> {
  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.projectTemplate.findUnique({ where: { code_version: { code: PLAN_C_CODE, version: 1 } }, select: { id: true } });
    if (existing) return { created: false, id: existing.id };
    const template = await tx.projectTemplate.create({ data: { code: PLAN_C_CODE, name: 'Plano C — Implantação Assistida', methodology: 'PLANO_C', version: 1, status: 'ACTIVE', createdByUserId, validatedAt: new Date(),
      description: 'Implantação assistida em 5 fases (Organizar a base, Controlar, Padronizar, Governar, Estabilizar e validar), cada uma encerrada por um Gate de decisão.' } });
    const phaseId: string[] = []; const gateCode: string[] = [];
    for (const [order, item] of planCPhases.entries()) {
      const clientHours = planCTasks.filter((task) => task.phase === order).reduce((total, task) => total + task.client, 0);
      const phase = await tx.templatePhase.create({ data: { templateId: template.id, order, name: item.name, description: item.description, plannedWeeks: item.weeks, plannedJgm4Hours: item.hours, plannedClientHours: clientHours } });
      phaseId.push(phase.id); gateCode.push(`GATE-${order}`);
      const gate = await tx.templateGate.create({ data: { templateId: template.id, phaseId: phase.id, code: `GATE-${order}`, title: item.title, question: item.question } });
      for (const [index, description] of planCCriteria[order].entries()) {
        const automatic = /atividades obrigatórias.*concluídas/i.test(description) || /solicitações bloqueantes.*aceitas/i.test(description);
        await tx.templateGateCriterion.create({ data: { gateId: gate.id, code: `G${order}-C${String(index + 1).padStart(2, '0')}`, description, sourceType: automatic ? (/solicitações/i.test(description) ? 'REQUEST' : 'TASK') : 'MANUAL', order: index + 1, mandatory: true, evidenceRequired: !automatic } });
      }
    }
    for (const [index, item] of planCTasks.entries()) {
      const task = await tx.templateTask.create({ data: { templateId: template.id, phaseId: phaseId[item.phase], code: item.code, title: item.title, description: `Atividade ${item.code} do Plano C.`, objective: item.title,
        instructions: `Executar ${item.title.toLocaleLowerCase('pt-BR')} conforme o padrão acordado com a JGM4 e registrar evidências.`, acceptanceCriteria: `${item.title} concluído e evidências aceitas pela JGM4.`,
        responsibilityType: 'JOINT', plannedJgm4Hours: item.jgm4, plannedClientHours: item.client, order: index } });
      for (const [order, label] of CHECKLIST.entries()) await tx.templateChecklistItem.create({ data: { taskId: task.id, label, order, required: true } });
      if (item.predecessor) await tx.templateDependency.create({ data: { templateId: template.id, kind: 'TASK_AFTER_TASK', fromCode: item.code, toCode: item.predecessor } });
      if (item.phase > 0) await tx.templateDependency.create({ data: { templateId: template.id, kind: 'TASK_BLOCKED_BY_GATE', fromCode: item.code, toCode: gateCode[item.phase - 1] } });
    }
    for (const [index, definition] of planCRequests.entries()) {
      const request = await tx.templateRequest.create({ data: { templateId: template.id, phaseId: phaseId[definition.phase], code: definition.code, title: definition.title, description: definition.description,
        instructions: definition.instructions, acceptanceCriteria: definition.acceptanceCriteria, blocking: definition.blocking, mandatory: true, order: index } });
      for (const [order, label] of definition.requirements.entries()) await tx.templateRequestRequirement.create({ data: { requestId: request.id, label, order, required: true } });
      if (definition.code === 'SOL-006') await tx.templateDependency.create({ data: { templateId: template.id, kind: 'REQUEST_FOR_TASK', fromCode: 'SOL-006', toCode: 'C05' } });
    }
    await tx.auditLog.create({ data: { projectId: null, entityType: 'ProjectTemplate', entityId: template.id, action: 'TEMPLATE_CREATED', userId: createdByUserId, actorType: createdByUserId ? 'USER' : 'SYSTEM', newValue: { code: PLAN_C_CODE, version: 1, status: 'ACTIVE', source: 'plano-c.data' } } });
    return { created: true, id: template.id };
  };
  const transactional = db as { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: object) => Promise<T> };
  return typeof transactional.$transaction === 'function' ? transactional.$transaction(run, { timeout: 60000 }) : run(db as Prisma.TransactionClient);
}
