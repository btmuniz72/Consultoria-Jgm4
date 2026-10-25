import { assertTaskExecution } from '../commercial/commercial-guard';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPlanDto, TaskRequirementDto, TaskTransitionDto, TimeEntryDto } from './tasks.dto';
import { GatesService } from '../gates/gates.service';
import { assertProjectOpen } from '../projects/project-guard';
import { ensureApproval, resolveApprovals } from '../approvals/approval-sync';
import { assertCan, currentRole, currentUserId, isJgm4Role } from '../approvals/authority';

type Actor = 'JGM4' | 'CLIENT';
type Tx = Prisma.TransactionClient;
const statuses: Record<TaskStatus, string> = {
  NOT_STARTED: 'Não iniciada', BLOCKED: 'Bloqueada', RELEASED: 'Liberada', IN_PROGRESS: 'Em andamento',
  WAITING_EVIDENCE: 'Aguardando evidências', WAITING_JGM4_VALIDATION: 'Aguardando validação JGM4',
  ADJUSTMENT_REQUESTED: 'Ajuste solicitado', VALIDATED: 'Validada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
const actor = (): Actor => isJgm4Role(currentRole()) ? 'JGM4' : 'CLIENT';
const amount = (value: Prisma.Decimal | null | undefined) => value?.toNumber() ?? 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const actionFor = (status: TaskStatus, owner: string) => ({
  RELEASED: 'Iniciar a atividade liberada.', IN_PROGRESS: 'Executar a atividade, completar o checklist e registrar evidências.',
  WAITING_EVIDENCE: 'Anexar evidências da atividade e enviar para validação JGM4.',
  WAITING_JGM4_VALIDATION: 'Validar as evidências ou solicitar ajuste.',
  ADJUSTMENT_REQUESTED: 'Corrigir a atividade conforme a orientação JGM4 e reenviar.',
  VALIDATED: 'Concluir a atividade validada.', COMPLETED: 'Atividade concluída.', BLOCKED: 'Aguardar o atendimento das dependências.',
  NOT_STARTED: 'Aguardar liberação das dependências.', CANCELLED: 'Atividade cancelada.',
}[status] ?? `Próxima ação de ${owner}.`);

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService, private readonly gates: GatesService) {}
  private currentActor() { return actor(); }
  private async assertProject(db: Tx | PrismaService, projectId: string) {
    if (!await db.project.findFirst({ where: { id: projectId, company: { active: true } }, select: { id: true } })) throw new NotFoundException('Projeto não encontrado.');
  }
  private async load(db: Tx | PrismaService, projectId: string, taskId: string) {
    await this.assertProject(db, projectId);
    const task = await db.task.findFirst({ where: { id: taskId, projectId }, include: {
      phase: { select: { id: true, order: true, name: true, plannedWeeks: true, plannedJgm4Hours: true, status: true, archived: true } },
      predecessor: { select: { id: true, code: true, title: true, status: true } },
      gate: { select: { id: true, code: true, title: true, status: true } },
      requirements: { orderBy: { label: 'asc' } },
      requests: { where: { mandatory: true, blocking: true }, select: { id: true, code: true, title: true, status: true } },
      evidence: { orderBy: { createdAt: 'asc' } },
      clientResponsible: { select: { id: true, name: true } }, jgm4Responsible: { select: { id: true, name: true } },
      timeEntries: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
    } });
    if (!task) throw new NotFoundException('Atividade não encontrada neste projeto.');
    return task;
  }
  private async totals(db: Tx | PrismaService, taskId: string, plannedJgm4Hours: number, plannedClientHours: number) {
    const entries = await db.timeEntry.groupBy({ by: ['organizationType'], where: { taskId }, _sum: { hours: true } });
    const actualJgm4Hours = round(entries.find((entry) => entry.organizationType === 'JGM4')?._sum.hours?.toNumber() ?? 0);
    const actualClientHours = round(entries.find((entry) => entry.organizationType === 'CLIENT')?._sum.hours?.toNumber() ?? 0);
    const ratio = plannedJgm4Hours > 0 ? actualJgm4Hours / plannedJgm4Hours : 0;
    return {
      plannedJgm4Hours, actualJgm4Hours, remainingJgm4Hours: round(plannedJgm4Hours - actualJgm4Hours),
      plannedClientHours, actualClientHours, remainingClientHours: round(plannedClientHours - actualClientHours),
      jgm4ConsumptionPercent: plannedJgm4Hours > 0 ? round(ratio * 100) : null,
      jgm4Alert: plannedJgm4Hours > 0 && actualJgm4Hours > plannedJgm4Hours ? 'HORAS PLANEJADAS EXCEDIDAS.'
        : plannedJgm4Hours > 0 && ratio >= 0.8 ? 'ATENÇÃO — 80% das horas planejadas consumidas.' : null,
    };
  }
  private blockers(task: { requests: Array<{ status: string; code: string }>; predecessor: { id: string; code: string; title: string; status: TaskStatus } | null; gate: { code: string; status: string } | null }) {
    const requests = task.requests.filter((request) => request.status !== 'ACCEPTED');
    const predecessor = task.predecessor?.status !== undefined && task.predecessor.status !== 'COMPLETED' ? task.predecessor : null;
    const gate = task.gate?.status !== undefined && task.gate.status !== 'APPROVED' ? task.gate : null;
    return { requests, predecessor, gate, labels: [
      ...requests.map((request) => `Bloqueada por ${request.code}.`),
      ...(predecessor ? [`Aguardando atividade anterior ${predecessor.code} — ${predecessor.title}.`] : []),
      ...(gate ? [`Aguardando aprovação do ${gate.code}.`] : []),
    ] };
  }
  private async detailFrom(db: Tx | PrismaService, taskId: string, projectId: string) {
    const task = await this.load(db, projectId, taskId);
    const blocking = this.blockers(task);
    const missingRequirements = task.requirements.filter((requirement) => requirement.required && !requirement.completed);
    const time = await this.totals(db, task.id, amount(task.plannedJgm4Hours), amount(task.plannedClientHours));
    const history = await db.auditLog.findMany({ where: { projectId, entityType: 'Task', entityId: task.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const localActor = this.currentActor();
    return {
      ...task, ...time, canApproveMovement: ['CLIENT_SPONSOR', 'CLIENT_MANAGER'].includes(currentRole()), blockedByRequests: blocking.requests.length > 0, blockingRequests: blocking.requests,
      statusLabel: statuses[task.status], currentOwnerType: task.currentOwnerType,
      nextAction: task.nextAction ?? actionFor(task.status, task.currentOwnerType),
      dependencies: { ...blocking, previousGate: blocking.gate }, missingRequirements,
      allowedActions: this.allowedActions(task.status, localActor, blocking.labels.length === 0, missingRequirements.length === 0, task.responsibilityType),
      localActor, history,
    };
  }
  private allowedActions(status: TaskStatus, localActor: Actor, unblocked: boolean, checklistComplete: boolean, responsibility: string) {
    const actions: string[] = [];
    if (status === 'RELEASED' && unblocked && (responsibility === 'JOINT' || responsibility === localActor)) actions.push('start');
    if (status === 'IN_PROGRESS' && localActor === 'CLIENT' && checklistComplete) actions.push('send-validation');
    if (status === 'WAITING_EVIDENCE' && localActor === 'CLIENT') actions.push('submit-evidence');
    if (status === 'WAITING_JGM4_VALIDATION' && localActor === 'JGM4') actions.push('validate', 'request-adjustment');
    if (status === 'ADJUSTMENT_REQUESTED' && localActor === 'CLIENT') actions.push('resume');
    if (status === 'VALIDATED' && localActor === 'JGM4') actions.push('complete');
    if (['IN_PROGRESS', 'WAITING_EVIDENCE', 'ADJUSTMENT_REQUESTED'].includes(status)) actions.push('register-time');
    if (localActor === 'JGM4') actions.push('update-plan');
    return actions;
  }
  async detail(projectId: string, taskId: string) { return this.detailFrom(this.prisma, taskId, projectId); }
  async detailById(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException('Atividade não encontrada.');
    return this.detail(task.projectId, taskId);
  }
  private async projectOfTask(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException('Atividade não encontrada.');
    return task.projectId;
  }
  async transitionById(taskId: string, action: string, dto: TaskTransitionDto) { return this.transition(await this.projectOfTask(taskId), taskId, action, dto); }
  async requirementById(taskId: string, requirementId: string, dto: TaskRequirementDto) { return this.requirement(await this.projectOfTask(taskId), taskId, requirementId, dto); }
  async addEvidenceById(taskId: string, dto: { description: string; referenceUrl?: string }) { return this.addEvidence(await this.projectOfTask(taskId), taskId, dto); }
  async addTimeEntryById(taskId: string, dto: TimeEntryDto) { return this.addTimeEntry(await this.projectOfTask(taskId), taskId, dto); }
  async updatePlanById(taskId: string, dto: TaskPlanDto) { return this.updatePlan(await this.projectOfTask(taskId), taskId, dto); }
  async list(projectId: string) {
    await this.assertProject(this.prisma, projectId);
    const tasks = await this.prisma.task.findMany({ where: { projectId, phase: { archived: false } }, select: { id: true, code: true }, orderBy: [{ phase: { order: 'asc' } }, { code: 'asc' }] });
    return Promise.all(tasks.map((task) => this.detailFrom(this.prisma, task.id, projectId)));
  }
  async transition(projectId: string, taskId: string, action: string, dto: TaskTransitionDto = {}) {
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const task = await this.load(tx, projectId, taskId);
      if (task.phase.status === 'LOCKED' && ['start', 'send-validation'].includes(action)) throw new ConflictException('Esta atividade pertence a uma fase ainda não liberada. Gate anterior pendente.');
      if (task.phase.archived) throw new ConflictException('Fase histórica: somente consulta.');
      const role = this.currentActor();
      if (role === 'CLIENT' && ['start', 'send-validation', 'submit-evidence', 'resume'].includes(action)) assertCan(currentRole(), 'TASK_EXECUTE', 'O perfil não pode executar atividades.');
      const blocking = this.blockers(task);
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== task.version) throw new ConflictException('A atividade foi atualizada. Recarregue antes de continuar.');
      let to: TaskStatus; let owner: string = task.currentOwnerType; let logAction = action.toUpperCase().replaceAll('-', '_');
      const missing = task.requirements.filter((r) => r.required && !r.completed);
      const allowed = (state: TaskStatus, localRole: Actor, organization?: string) => task.status === state && (organization === undefined || task.responsibilityType === 'JOINT' || task.responsibilityType === organization) && localRole === (organization === 'CLIENT' ? 'CLIENT' : localRole);
      switch (action) {
        case 'start':
          await assertTaskExecution(tx, projectId, taskId, task.phaseId, task.phase.order);
          if (!allowed('RELEASED', role) || blocking.labels.length) throw new ConflictException(blocking.labels[0] ?? `Somente uma atividade liberada pode iniciar (status ${task.status}).`);
          if (task.responsibilityType !== 'JOINT' && task.responsibilityType !== role) throw new ForbiddenException('O perfil local não corresponde à responsabilidade desta atividade.');
          to = 'IN_PROGRESS'; owner = role; break;
        case 'send-validation':
          if (role !== 'CLIENT') throw new ForbiddenException('Somente o perfil Ollem pode enviar a atividade para validação.');
          if (task.status !== 'IN_PROGRESS') throw new ConflictException('A atividade precisa estar em andamento para iniciar a validação.');
          if (missing.length) throw new BadRequestException(`Não é possível enviar ${task.code}. Existem ${missing.length} critérios obrigatórios pendentes.`);
          to = 'WAITING_EVIDENCE'; owner = 'CLIENT'; break;
        case 'submit-evidence':
          if (role !== 'CLIENT' || task.status !== 'WAITING_EVIDENCE') throw new ConflictException('Somente Ollem pode enviar evidências nesta etapa.');
          if (task.evidence.length === 0) throw new BadRequestException('Registre pelo menos uma evidência antes de enviar para validação JGM4.');
          to = 'WAITING_JGM4_VALIDATION'; owner = 'JGM4'; break;
        case 'validate':
          if (role !== 'JGM4') throw new ForbiddenException('Somente o perfil JGM4 pode validar atividades.');
          if (task.status !== 'WAITING_JGM4_VALIDATION') throw new ConflictException('A atividade precisa aguardar validação JGM4.');
          to = 'VALIDATED'; owner = 'JGM4'; break;
        case 'request-adjustment':
          if (role !== 'JGM4') throw new ForbiddenException('Somente o perfil JGM4 pode solicitar ajustes.');
          if (task.status !== 'WAITING_JGM4_VALIDATION') throw new ConflictException('A atividade precisa aguardar validação JGM4.');
          if (!dto.comment?.trim() || !dto.guidance?.trim()) throw new BadRequestException('Informe o motivo e a orientação de correção.');
          to = 'ADJUSTMENT_REQUESTED'; owner = 'CLIENT'; break;
        case 'resume':
          if (role !== 'CLIENT' || task.status !== 'ADJUSTMENT_REQUESTED') throw new ConflictException('Somente Ollem pode retomar uma atividade com ajuste solicitado.');
          to = 'IN_PROGRESS'; owner = 'CLIENT'; break;
        case 'complete':
          if (role !== 'JGM4' || task.status !== 'VALIDATED') throw new ConflictException('Somente JGM4 pode concluir uma atividade validada.');
          to = 'COMPLETED'; owner = 'NONE'; break;
        default: throw new BadRequestException('Transição de atividade não reconhecida.');
      }
      const now = new Date();
      const data: Prisma.TaskUpdateManyMutationInput = { status: to, currentOwnerType: owner, version: { increment: 1 } };
      if (action === 'start' && !task.actualStartDate) data.actualStartDate = now;
      if (action === 'complete') data.actualEndDate = now;
      data.nextAction = action === 'request-adjustment' ? dto.guidance!.trim() : actionFor(to, owner);
      const changed = await tx.task.updateMany({ where: { id: taskId, projectId, version: task.version }, data });
      if (changed.count !== 1) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Task', entityId: taskId, action: logAction,
        actorType: currentRole(), oldValue: { status: task.status, version: task.version, currentOwnerType: task.currentOwnerType },
        newValue: { status: to, version: task.version + 1, currentOwnerType: owner, comment: dto.comment?.trim() || null, guidance: dto.guidance?.trim() || null } } });
      if (action === 'start' && task.phase.status === 'AVAILABLE') {
        await tx.phase.update({ where: { id: task.phaseId }, data: { status: 'IN_PROGRESS', actualStartDate: now } });
        await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Phase', entityId: task.phaseId, action: 'PHASE_STARTED', actorType: currentRole(), oldValue: { status: 'AVAILABLE' }, newValue: { status: 'IN_PROGRESS', actualStartDate: now.toISOString() } } });
      }
      await this.syncApproval(tx, task, to, dto);
      if (to === 'COMPLETED') { await this.releaseEligible(tx, projectId); await this.gates.syncProject(tx, projectId); }
      return this.detailFrom(tx, taskId, projectId);
    });
  }
  // Central de Aprovações: atividade enviada à JGM4 abre a validação; validar/ajustar a encerra.
  private async syncApproval(tx: Tx, task: { id: string; projectId: string; code: string; title: string; objective: string; plannedEndDate: Date | null; nextActionDueDate: Date | null }, to: TaskStatus, dto: TaskTransitionDto) {
    const key = { entityType: 'Task', entityId: task.id, type: 'TASK_VALIDATION' as const };
    if (to === 'WAITING_JGM4_VALIDATION') {
      await ensureApproval(tx, { ...key, projectId: task.projectId, entityCode: task.code, title: `${task.code} — ${task.title}`, description: task.objective,
        assignedRole: 'JGM4_CONSULTANT', dueAt: task.nextActionDueDate ?? task.plannedEndDate, requestedByRole: currentRole(), actorType: currentRole() });
    } else if (to === 'VALIDATED') await resolveApprovals(tx, { ...key, status: 'APPROVED', comment: dto.comment?.trim() || null });
    else if (to === 'ADJUSTMENT_REQUESTED') await resolveApprovals(tx, { ...key, status: 'ADJUSTMENT_REQUESTED', comment: [dto.comment?.trim(), dto.guidance?.trim()].filter(Boolean).join(' — ') || null });
  }
  async requirement(projectId: string, taskId: string, requirementId: string, dto: TaskRequirementDto) {
    if (this.currentActor() !== 'CLIENT') throw new ForbiddenException('Somente o perfil Ollem pode atualizar o checklist da atividade.');
    assertCan(currentRole(), 'TASK_EXECUTE', 'O perfil não pode executar atividades.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const task = await this.load(tx, projectId, taskId);
      if (task.phase.status === 'LOCKED') throw new ConflictException('Esta atividade pertence a uma fase ainda não liberada. Gate anterior pendente.');
      if (!['IN_PROGRESS', 'ADJUSTMENT_REQUESTED'].includes(task.status)) throw new ConflictException('Checklist só pode ser atualizado durante a execução da atividade.');
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== task.version) throw new ConflictException('A atividade foi atualizada. Recarregue antes de continuar.');
      const requirement = task.requirements.find((item) => item.id === requirementId);
      if (!requirement) throw new NotFoundException('Critério não encontrado nesta atividade.');
      if (requirement.completed === dto.completed) return this.detailFrom(tx, taskId, projectId);
      const result = await tx.task.updateMany({ where: { id: taskId, projectId, version: task.version }, data: { version: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
      await tx.taskRequirement.update({ where: { id: requirementId }, data: { completed: dto.completed, completedAt: dto.completed ? new Date() : null, completedByUserId: currentUserId() } });
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Task', entityId: taskId, action: 'CHECKLIST_CHANGED', actorType: currentRole(),
        oldValue: { requirementId, completed: requirement.completed }, newValue: { requirementId, label: requirement.label, completed: dto.completed } } });
      return this.detailFrom(tx, taskId, projectId);
    });
  }
  async addEvidence(projectId: string, taskId: string, input: { description: string; referenceUrl?: string }) {
    if (this.currentActor() !== 'CLIENT') throw new ForbiddenException('Somente o perfil Ollem pode registrar evidências.');
    assertCan(currentRole(), 'TASK_EXECUTE', 'O perfil não pode executar atividades.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const task = await this.load(tx, projectId, taskId);
      if (task.phase.status === 'LOCKED') throw new ConflictException('Esta atividade pertence a uma fase ainda não liberada. Gate anterior pendente.');
      if (task.status !== 'WAITING_EVIDENCE') throw new ConflictException('Evidências só podem ser registradas na etapa de envio para validação.');
      const evidence = await tx.taskEvidence.create({ data: { createdByUserId: currentUserId(), projectId, phaseId: task.phaseId, taskId, description: input.description.trim(), referenceUrl: input.referenceUrl?.trim() || null } });
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Task', entityId: taskId, action: 'EVIDENCE_ADDED', actorType: currentRole(), newValue: { evidenceId: evidence.id, description: evidence.description, referenceUrl: evidence.referenceUrl } } });
      return this.detailFrom(tx, taskId, projectId);
    });
  }
  async addTimeEntry(projectId: string, taskId: string, input: TimeEntryDto) {
    const role = this.currentActor();
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const task = await this.load(tx, projectId, taskId);
      if (task.phase.status === 'LOCKED') throw new ConflictException('Esta atividade pertence a uma fase ainda não liberada. Gate anterior pendente.');
      if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Não é possível apontar horas em atividade encerrada.');
      const phaseDate = new Date(`${input.date.slice(0, 10)}T00:00:00.000Z`);
      const entry = await tx.timeEntry.create({ data: { projectId, phaseId: task.phaseId, taskId, userId: currentUserId(),
        organizationType: role, date: phaseDate, hours: new Prisma.Decimal(input.hours), description: input.description.trim() } });
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'TimeEntry', entityId: entry.id, action: 'TIME_ENTRY_CREATED', actorType: currentRole(),
        newValue: { taskId, code: task.code, organizationType: role, date: phaseDate.toISOString().slice(0, 10), hours: input.hours, description: input.description.trim() } } });
      return { entry, task: await this.detailFrom(tx, taskId, projectId) };
    });
  }
  async updatePlan(projectId: string, taskId: string, dto: TaskPlanDto) {
    if (this.currentActor() !== 'JGM4') throw new ForbiddenException('Somente o perfil JGM4 pode alterar o planejamento da atividade.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const task = await this.load(tx, projectId, taskId);
      // Atividade ativa não tem o prazo alterado diretamente: exige aprovação (DUE_DATE_CHANGE).
      if (dto.plannedEndDate !== undefined && !['NOT_STARTED', 'BLOCKED', 'COMPLETED', 'CANCELLED'].includes(task.status)) {
        throw new ConflictException('Atividade ativa: solicite a alteração de prazo pela Central de Aprovações (DUE_DATE_CHANGE).');
      }
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== task.version) throw new ConflictException('A atividade foi atualizada. Recarregue antes de continuar.');
      const patch: Prisma.TaskUpdateInput = {};
      const oldValue: Record<string, unknown> = {}; const newValue: Record<string, unknown> = {};
      for (const key of ['responsibilityType', 'plannedStartDate', 'plannedEndDate', 'plannedJgm4Hours', 'plannedClientHours', 'nextActionDueDate', 'nextAction'] as const) {
        const value = dto[key]; if (value === undefined) continue;
        const before = task[key] instanceof Date ? task[key]!.toISOString().slice(0, 10) : task[key] instanceof Prisma.Decimal ? task[key]!.toNumber() : task[key];
        const after = typeof value === 'string' && key.toLowerCase().includes('date') ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
        if (key.endsWith('Hours')) patch[key] = after as number;
        else patch[key] = after as never;
        oldValue[key] = before; newValue[key] = value;
      }
      if (!Object.keys(newValue).length) throw new BadRequestException('Informe pelo menos um campo de planejamento.');
      if (dto.plannedStartDate && dto.plannedEndDate && dto.plannedStartDate > dto.plannedEndDate) throw new BadRequestException('O término planejado deve ser posterior ao início.');
      if (dto.plannedJgm4Hours !== undefined) {
        const totals = await tx.task.aggregate({ where: { projectId, phaseId: task.phaseId }, _sum: { plannedJgm4Hours: true } });
        const after = amount(totals._sum.plannedJgm4Hours) - amount(task.plannedJgm4Hours) + (dto.plannedJgm4Hours ?? 0);
        if (round(after) !== task.phase.plannedJgm4Hours) throw new BadRequestException(`A soma planejada da fase deve permanecer em ${task.phase.plannedJgm4Hours} h JGM4.`);
      }
      const updatedCount = await tx.task.updateMany({ where: { id: taskId, projectId, version: task.version }, data: { ...patch, version: { increment: 1 } } });
      if (!updatedCount.count) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
      const updated = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Task', entityId: taskId, action: 'PLAN_UPDATED', actorType: currentRole(), oldValue: oldValue as Prisma.InputJsonObject, newValue: newValue as Prisma.InputJsonObject } });
      return this.detailFrom(tx, updated.id, projectId);
    });
  }
  private async releaseEligible(tx: Tx, projectId: string) {
    let changed = true;
    while (changed) {
      changed = false;
      const blocked = await tx.task.findMany({ where: { projectId, status: { in: ['BLOCKED', 'NOT_STARTED'] } }, include: {
        phase: { select: { status: true } }, predecessor: { select: { status: true } }, gate: { select: { status: true } },
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { id: true } },
      } });
      for (const task of blocked) {
        if (task.phase.status === 'LOCKED' || task.requests.length || (task.predecessor && task.predecessor.status !== 'COMPLETED') || (task.gate && task.gate.status !== 'APPROVED')) continue;
        const result = await tx.task.updateMany({ where: { id: task.id, projectId, status: task.status, version: task.version }, data: {
          status: 'RELEASED', currentOwnerType: task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT',
          nextAction: 'Iniciar a atividade liberada.', version: { increment: 1 },
        } });
        if (!result.count) continue;
        await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: task.id, action: 'RELEASED', actorType: 'SYSTEM',
          oldValue: { status: task.status, version: task.version }, newValue: { status: 'RELEASED', version: task.version + 1 } } });
        changed = true;
      }
    }
  }
  async releaseAfterRequestChange(tx: Tx, projectId: string) { return this.releaseEligible(tx, projectId); }
  async seedAndRelease(projectId: string) { return this.prisma.$transaction(async (tx) => { await this.releaseEligible(tx, projectId); }); }
  async reconcile(projectId: string) { return this.prisma.$transaction(async (tx) => { await this.assertProject(tx, projectId); await this.releaseEligible(tx, projectId); return this.list(projectId); }); }
  async phaseSummary(projectId: string) {
    await this.assertProject(this.prisma, projectId);
    const phases = await this.prisma.phase.findMany({ where: { projectId, archived: false }, orderBy: { order: 'asc' }, include: { tasks: { select: { id: true, status: true, plannedClientHours: true, plannedJgm4Hours: true, timeEntries: { select: { organizationType: true, hours: true } } } } } });
    return phases.map((phase) => {
      const actual = phase.tasks.flatMap((task) => task.timeEntries);
      const plannedJgm4Hours = phase.tasks.reduce((sum, task) => sum + amount(task.plannedJgm4Hours), 0);
      const plannedClientHours = phase.tasks.reduce((sum, task) => sum + amount(task.plannedClientHours), 0);
      const actualJgm4Hours = actual.filter((entry) => entry.organizationType === 'JGM4').reduce((sum, entry) => sum + entry.hours.toNumber(), 0);
      const actualClientHours = actual.filter((entry) => entry.organizationType === 'CLIENT').reduce((sum, entry) => sum + entry.hours.toNumber(), 0);
      return { id: phase.id, projectId, order: phase.order, name: phase.name, plannedWeeks: phase.plannedWeeks,
        plannedJgm4Hours: round(plannedJgm4Hours), actualJgm4Hours: round(actualJgm4Hours), remainingJgm4Hours: round(plannedJgm4Hours - actualJgm4Hours),
        plannedClientHours: round(plannedClientHours), actualClientHours: round(actualClientHours), remainingClientHours: round(plannedClientHours - actualClientHours),
        completedTasks: phase.tasks.filter((task) => task.status === 'COMPLETED').length,
        inProgressTasks: phase.tasks.filter((task) => ['IN_PROGRESS', 'WAITING_EVIDENCE', 'WAITING_JGM4_VALIDATION', 'ADJUSTMENT_REQUESTED', 'VALIDATED'].includes(task.status)).length,
        blockedTasks: phase.tasks.filter((task) => ['BLOCKED', 'NOT_STARTED'].includes(task.status)).length, taskCount: phase.tasks.length };
    });
  }
  async projectSummary(projectId: string) {
    const phases = await this.phaseSummary(projectId);
    const sum = (key: keyof typeof phases[number]) => phases.reduce((total, phase) => total + (typeof phase[key] === 'number' ? phase[key] as number : 0), 0);
    return { projectId, plannedJgm4Hours: round(sum('plannedJgm4Hours')), actualJgm4Hours: round(sum('actualJgm4Hours')),
      remainingJgm4Hours: round(sum('remainingJgm4Hours')), plannedClientHours: round(sum('plannedClientHours')),
      actualClientHours: round(sum('actualClientHours')), remainingClientHours: round(sum('remainingClientHours')) };
  }
}
