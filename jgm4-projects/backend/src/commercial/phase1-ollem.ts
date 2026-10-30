import { Prisma, PrismaClient } from '../generated/prisma/client';
import { lockCommercialProject } from './commercial-guard';
import { ollemPhases } from './ollem-plan';
import { absorbed, existingMeta, milestones, newTasks, predecessors } from './phase1-ollem.data';

const date = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

export interface Phase1Result {
  phasesUpdated: string[]; datesFixed: boolean; tasksEnriched: string[]; tasksCreated: string[];
  milestonesCreated: string[]; milestoneLinks: number; requirementsAdded: number; phase1ActiveTasks: number;
}

/**
 * 10B.1 — Detalha a Fase 1 (Estruturação do CD) do projeto Ollem EXISTENTE, sem criar outro projeto e sem tocar nos Gates
 * contratuais. Idempotente: cada passo confere o estado antes de gravar, preserva IDs/histórico e nunca sobrescreve campo já
 * preenchido manualmente. Tudo em uma transação, com AuditLog (actor SYSTEM).
 */
export async function applyPhase1(prisma: PrismaClient, projectId: string): Promise<Phase1Result> {
  return prisma.$transaction(async (tx) => {
    await lockCommercialProject(tx, projectId);
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.ollemRevision < 1) throw new Error('Aplique a revisão da Ollem (ollem:revise) antes da Fase 1.');
    const result: Phase1Result = { phasesUpdated: [], datesFixed: false, tasksEnriched: [], tasksCreated: [], milestonesCreated: [], milestoneLinks: 0, requirementsAdded: 0, phase1ActiveTasks: 0 };
    const log = (entityType: string, entityId: string, action: string, oldValue: unknown, newValue: unknown) =>
      tx.auditLog.create({ data: { projectId, entityType, entityId, action, actorType: 'SYSTEM', oldValue: json(oldValue) ?? Prisma.JsonNull, newValue: json(newValue) ?? Prisma.JsonNull } });

    // 1) Fases: nomes, descrições e datas conforme o cronograma aprovado.
    const phases = await tx.phase.findMany({ where: { projectId, archived: false }, include: { gate: true }, orderBy: { order: 'asc' } });
    if (phases.length < 4) throw new Error('Projeto sem as 4 fases contratuais.');
    const oldDefaults: Record<number, [string, string]> = { 1: ['2026-11-01', '2026-12-31'], 2: ['2027-01-01', '2027-01-31'] };
    for (const [order, spec] of ollemPhases.entries()) {
      const phase = phases.find((p) => p.order === order)!;
      const data = { name: spec.name, description: spec.description, plannedWeeks: spec.weeks, plannedStartDate: date(spec.start), plannedEndDate: date(spec.end) };
      const changed = phase.name !== data.name || phase.description !== data.description || phase.plannedWeeks !== data.plannedWeeks
        || iso(phase.plannedStartDate) !== spec.start || iso(phase.plannedEndDate) !== spec.end;
      if (changed) {
        await tx.phase.update({ where: { id: phase.id }, data });
        await log('Phase', phase.id, 'OLLEM_PHASE1_PHASE_UPDATED', { name: phase.name, plannedStartDate: iso(phase.plannedStartDate), plannedEndDate: iso(phase.plannedEndDate), plannedWeeks: phase.plannedWeeks }, { name: data.name, plannedStartDate: spec.start, plannedEndDate: spec.end, plannedWeeks: spec.weeks });
        result.phasesUpdated.push(`${order} — ${spec.name}`);
        if (order === 1 || order === 2) result.datesFixed = true;
      }
      // Título do Gate acompanha o nome da fase (o Gate final mantém o título próprio).
      if (phase.gate && order !== 3 && phase.gate.title !== spec.name) {
        await tx.gate.update({ where: { id: phase.gate.id }, data: { title: spec.name } });
        await log('Gate', phase.gate.id, 'OLLEM_PHASE1_GATE_TITLE_UPDATED', { title: phase.gate.title }, { title: spec.name });
      }
    }
    // Atividades que ainda carregam as datas padrão antigas da fase seguem o novo período (datas editadas à mão são preservadas).
    for (const order of [1, 2] as const) {
      const spec = ollemPhases[order]; const phase = phases.find((p) => p.order === order)!;
      const stale = await tx.task.findMany({ where: { projectId, phaseId: phase.id, plannedStartDate: date(oldDefaults[order][0]), plannedEndDate: date(oldDefaults[order][1]) } });
      for (const task of stale) {
        await tx.task.update({ where: { id: task.id }, data: { plannedStartDate: date(spec.start), plannedEndDate: date(spec.end) } });
        await log('Task', task.id, 'OLLEM_PHASE1_TASK_DATES_UPDATED', { plannedStartDate: oldDefaults[order][0], plannedEndDate: oldDefaults[order][1] }, { plannedStartDate: spec.start, plannedEndDate: spec.end });
      }
    }
    if (iso(project.plannedStartDate) === '2026-11-01') {
      await tx.project.update({ where: { id: projectId }, data: { plannedStartDate: date('2026-11-04') } });
      await log('Project', projectId, 'OLLEM_PHASE1_PROJECT_START_UPDATED', { plannedStartDate: '2026-11-01' }, { plannedStartDate: '2026-11-04' });
    }
    // Textos da Fase 2 que citavam janeiro.
    const retitle: Record<string, [RegExp, string]> = { C14: [/janeiro de 2027/, 'fevereiro e março de 2027'] };
    for (const [code, [pattern, replacement]] of Object.entries(retitle)) {
      const task = await tx.task.findUnique({ where: { projectId_code: { projectId, code } } });
      if (task && pattern.test(task.title)) { const title = task.title.replace(pattern, replacement); await tx.task.update({ where: { id: task.id }, data: { title } }); await log('Task', task.id, 'OLLEM_PHASE1_TASK_RETITLED', { title: task.title }, { title }); }
    }

    const phase1 = phases.find((p) => p.order === 1)!; const spec1 = ollemPhases[1];

    // 2) Marcos M1..M4 (antes das atividades, para vincular).
    const milestoneIds: Record<string, string> = {};
    for (const [index, spec] of milestones.entries()) {
      let milestone = await tx.phaseMilestone.findUnique({ where: { projectId_code: { projectId, code: spec.code } } });
      if (!milestone) {
        milestone = await tx.phaseMilestone.create({ data: { projectId, phaseId: phase1.id, code: spec.code, title: spec.title, question: spec.question, order: index + 1,
          criteria: { create: spec.criteria.map((description, i) => ({ code: `${spec.code}-${i + 1}`, description, order: i + 1, mandatory: true })) } } });
        await log('PhaseMilestone', milestone.id, 'OLLEM_PHASE1_MILESTONE_CREATED', null, { code: spec.code, title: spec.title, criteria: spec.criteria });
        result.milestonesCreated.push(`${spec.code} — ${spec.title}`);
      }
      milestoneIds[spec.code] = milestone.id;
    }

    // 3) Atividades existentes: metadados (só campos vazios), absorção dos exercícios, predecessoras.
    const gateForPhase1 = (await tx.task.findUnique({ where: { projectId_code: { projectId, code: 'C01' } } }))?.blockedByGateId ?? null;
    for (const [code, meta] of Object.entries(existingMeta)) {
      const task = await tx.task.findUnique({ where: { projectId_code: { projectId, code } } });
      if (!task) continue;
      const data: Prisma.TaskUncheckedUpdateInput = {};
      if (meta.category && !task.category) data.category = meta.category;
      if (meta.classification && !task.classification) data.classification = meta.classification;
      if (meta.priority && !task.priority) data.priority = meta.priority;
      if (meta.milestone && !task.milestoneId) { data.milestoneId = milestoneIds[meta.milestone]; result.milestoneLinks++; }
      if (Object.keys(data).length) { await tx.task.update({ where: { id: task.id }, data }); await log('Task', task.id, 'OLLEM_PHASE1_TASK_ENRICHED', { category: task.category, classification: task.classification, priority: task.priority, milestoneId: task.milestoneId }, json(data)); result.tasksEnriched.push(code); }
    }
    for (const item of absorbed) {
      const task = await tx.task.findUnique({ where: { projectId_code: { projectId, code: item.code } }, include: { requirements: true } });
      if (!task) continue;
      const data: Prisma.TaskUncheckedUpdateInput = {};
      if (!task.title.includes(item.titleSuffix.trim())) data.title = task.title + item.titleSuffix;
      if (!task.instructions.includes(item.marker)) data.instructions = `${task.instructions}\n\n${item.instructions}`;
      if (Object.keys(data).length) { await tx.task.update({ where: { id: task.id }, data }); await log('Task', task.id, 'OLLEM_PHASE1_TASK_ABSORBED_EXERCISE', { title: task.title }, { ...data, exercise: item.marker }); if (!result.tasksEnriched.includes(item.code)) result.tasksEnriched.push(item.code); }
      const existing = new Set(task.requirements.map((r) => r.label));
      for (const label of item.checklist.filter((l) => !existing.has(l))) { await tx.taskRequirement.create({ data: { taskId: task.id, label, required: true } }); result.requirementsAdded++; }
    }

    // 4) As 12 atividades novas.
    for (const spec of newTasks) {
      let task = await tx.task.findUnique({ where: { projectId_code: { projectId, code: spec.code } } });
      if (!task) {
        task = await tx.task.create({ data: { projectId, phaseId: phase1.id, code: spec.code, title: spec.title, objective: spec.objective, instructions: spec.instructions,
          acceptanceCriteria: 'Evidências anexadas, checklist completo e validação da JGM4.', status: 'BLOCKED', responsibilityType: 'JOINT', blockedByGateId: gateForPhase1,
          requiredForGate: false, plannedStartDate: date(spec1.start), plannedEndDate: date(spec1.end), category: spec.meta.category, classification: spec.meta.classification,
          priority: spec.meta.priority, milestoneId: milestoneIds[spec.meta.milestone] } });
        await log('Task', task.id, 'OLLEM_PHASE1_TASK_CREATED', null, { code: spec.code, title: spec.title, category: spec.meta.category, classification: spec.meta.classification, milestone: spec.meta.milestone, requiredForGate: false });
        result.tasksCreated.push(spec.code); result.milestoneLinks++;
      }
      const existing = new Set((await tx.taskRequirement.findMany({ where: { taskId: task.id } })).map((r) => r.label));
      for (const label of spec.checklist.filter((l) => !existing.has(l))) { await tx.taskRequirement.create({ data: { taskId: task.id, label, required: true } }); result.requirementsAdded++; }
    }
    for (const [code, predecessorCode] of Object.entries(predecessors)) {
      const [task, predecessor] = await Promise.all([tx.task.findUnique({ where: { projectId_code: { projectId, code } } }), tx.task.findUnique({ where: { projectId_code: { projectId, code: predecessorCode } } })]);
      if (task && predecessor && !task.predecessorTaskId) { await tx.task.update({ where: { id: task.id }, data: { predecessorTaskId: predecessor.id } }); await log('Task', task.id, 'OLLEM_PHASE1_PREDECESSOR_SET', { predecessorTaskId: null }, { predecessor: predecessorCode }); }
    }
    result.phase1ActiveTasks = await tx.task.count({ where: { projectId, phaseId: phase1.id } });
    return result;
  }, { timeout: 60000 });
}
