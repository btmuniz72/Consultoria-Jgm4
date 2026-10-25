import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ApprovalType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GatesService } from '../gates/gates.service';
import { RequestsService } from '../requests/requests.service';
import { TasksService } from '../tasks/tasks.service';
import { ensureApproval, OPEN_STATUSES, resolveApprovals } from './approval-sync';
import { ApprovalsQuery, DecisionDto, DueDateChangeDto, ReasonDto, ResponsibleChangeDto } from './approvals.dto';
import { AUTHORITY_RULES, DECISION_PERMISSION, ROLES, Role, assertCan, can, currentRole, isJgm4Role, withDecision } from './authority';
import { CATEGORY_LABELS, CATEGORY_TYPES, Category, TYPE_LABELS, actionLabels, categoryOf, defaultNextAction, fmtDate, ownerOf, roleLabel } from './approval-labels';

type Tx = Prisma.TransactionClient;
type Outcome = 'approve' | 'adjust' | 'reject';
const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const iso = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null;
const today = () => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); };
const dayDiff = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);
const compact = (...parts: Array<string | null | undefined>) => parts.map((part) => part?.trim()).filter(Boolean).join(' — ');
const approvalInclude = { project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } } satisfies Prisma.ApprovalInclude;
type LoadedApproval = Prisma.ApprovalGetPayload<{ include: typeof approvalInclude }>;
type Entities = { tasks: Map<string, any>; requests: Map<string, any>; gates: Map<string, any> };

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService, private readonly tasks: TasksService, private readonly requests: RequestsService, private readonly gates: GatesService) {}

  // ---------------------------------------------------------------- leitura
  authority() {
    const role = currentRole();
    return { role, roles: ROLES, permissions: AUTHORITY_RULES.filter((rule) => rule.roles.includes(role)).map((rule) => rule.permission), rules: AUTHORITY_RULES };
  }
  private canDecide(role: Role, type: ApprovalType) { return can(role, DECISION_PERMISSION[type]); }

  private async loadEntities(approvals: LoadedApproval[]): Promise<Entities> {
    const ids = (entityType: string) => [...new Set(approvals.filter((item) => item.entityType === entityType).map((item) => item.entityId))];
    const [tasks, requests, gates] = await Promise.all([
      this.prisma.task.findMany({ where: { id: { in: ids('Task') } }, select: { id: true, code: true, title: true, status: true, currentOwnerType: true, nextAction: true, nextActionDueDate: true, plannedEndDate: true, phase: { select: { order: true, name: true } } } }),
      this.prisma.projectRequest.findMany({ where: { id: { in: ids('ProjectRequest') } }, select: { id: true, code: true, title: true, status: true, blocking: true, mandatory: true, dueDate: true, phase: { select: { order: true } }, task: { select: { code: true } } } }),
      this.prisma.gate.findMany({ where: { id: { in: ids('Gate') } }, select: { id: true, code: true, title: true, status: true, currentOwnerType: true, nextAction: true, nextActionDueDate: true, phase: { select: { order: true, name: true } } } }),
    ]);
    return { tasks: new Map(tasks.map((item) => [item.id, item])), requests: new Map(requests.map((item) => [item.id, item])), gates: new Map(gates.map((item) => [item.id, item])) };
  }
  private impactOf(approval: LoadedApproval, entities: Entities) {
    const payload = (approval.payload ?? {}) as Record<string, any>;
    const request = entities.requests.get(approval.entityId); const task = entities.tasks.get(approval.entityId); const gate = entities.gates.get(approval.entityId);
    switch (approval.type) {
      case 'REQUEST_REVIEW': return request?.blocking && request?.mandatory ? `Solicitação bloqueante${request.task ? `: mantém ${request.task.code} bloqueada` : ''} e impede o Gate ${request.phase.order}.` : 'Solicitação não bloqueante.';
      case 'TASK_VALIDATION': return task ? `Validada, a atividade pode ser concluída e conta para o Gate ${task.phase.order}.` : 'Conta para o Gate da fase.';
      case 'GATE_TECHNICAL_OPINION': return gate ? `Parecer favorável habilita a decisão do patrocinador sobre a Fase ${gate.phase.order + 1}.` : 'Habilita a decisão do patrocinador.';
      case 'GATE_CLIENT_DECISION': return gate ? (gate.phase.order < 4 ? `Aprovação libera a Fase ${gate.phase.order + 1} e suas atividades.` : 'Aprovação conclui a implantação.') : 'Libera a próxima fase.';
      case 'DUE_DATE_CHANGE': return `Prazo ${fmtDate(payload.currentDate)} → ${fmtDate(payload.newDate)} (${payload.deltaDays > 0 ? '+' : ''}${payload.deltaDays ?? 0} dias).${payload.expectedImpact ? ` ${payload.expectedImpact}` : ''}`;
      case 'RESPONSIBLE_CHANGE': return `Responsável ${payload.currentName ?? 'a definir'} → ${payload.newName ?? '—'}.`;
      case 'TASK_REOPEN': return 'A atividade volta à execução; o Gate da fase retorna a bloqueado se já estava em análise.';
      case 'REQUEST_CANCEL': return 'A solicitação sai da fila e permanece no histórico.';
      default: return '';
    }
  }
  private view(approval: LoadedApproval, entities: Entities, role: Role) {
    const company = approval.project.company.name;
    const task = entities.tasks.get(approval.entityId); const gate = entities.gates.get(approval.entityId);
    const open = OPEN_STATUSES.includes(approval.status);
    const dueAt = approval.dueAt ?? (approval.type === 'TASK_VALIDATION' ? task?.nextActionDueDate ?? task?.plannedEndDate : approval.type === 'GATE_CLIENT_DECISION' ? gate?.nextActionDueDate : null) ?? null;
    const overdue = open && !!dueAt && dueAt < today();
    const owner = ownerOf(approval.assignedRole, company);
    const entityNext = approval.type === 'TASK_VALIDATION' ? task?.nextAction : approval.type.startsWith('GATE_') ? gate?.nextAction : null;
    const labels = actionLabels(approval.type);
    const allowed = open && this.canDecide(role, approval.type);
    return {
      id: approval.id, projectId: approval.projectId, projectName: approval.project.name, companyName: company,
      type: approval.type, typeLabel: TYPE_LABELS[approval.type], category: categoryOf(approval.type), categoryLabel: CATEGORY_LABELS[categoryOf(approval.type)],
      entityType: approval.entityType, entityId: approval.entityId, code: approval.entityCode, title: approval.title, description: approval.description,
      status: approval.status, priority: approval.priority, requestedAt: approval.requestedAt, dueAt, overdue,
      requestedByRole: approval.requestedByRole, requestedByLabel: approval.requestedByRole ? roleLabel(approval.requestedByRole, company) : 'Sistema',
      assignedRole: approval.assignedRole, owner, nextAction: entityNext && entityNext !== 'Aguardar liberação das dependências.' ? entityNext : defaultNextAction[approval.type],
      impact: this.impactOf(approval, entities), payload: approval.payload,
      decision: approval.decision, decisionComment: approval.decisionComment, decidedAt: approval.decidedAt, decidedByRole: approval.decidedByRole,
      requiredPermission: DECISION_PERMISSION[approval.type], canDecide: allowed,
      deniedReason: open && !allowed ? `O perfil ${role} não tem alçada para decidir ${TYPE_LABELS[approval.type].toLowerCase()} (exige ${AUTHORITY_RULES.find((rule) => rule.permission === DECISION_PERMISSION[approval.type])!.roles.join(' ou ')}).` : null,
      actions: { labels, approve: allowed, adjust: allowed, reject: allowed },
    };
  }
  private async query(options: ApprovalsQuery, forRole: Role) {
    const statusFilter = options.status === 'all' ? {} : { status: { in: OPEN_STATUSES } };
    const types = options.category && options.category !== 'ALL' ? CATEGORY_TYPES[options.category] : undefined;
    const approvals = await this.prisma.approval.findMany({
      where: { ...statusFilter, projectId: options.projectId, type: types ? { in: types } : undefined, priority: options.priority === 'high' ? { in: ['HIGH', 'CRITICAL'] } : undefined, project: { company: { active: true } } },
      include: approvalInclude, orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    });
    // Aguardando minha ação: somente o que a alçada do perfil permite decidir (e que ainda está aberto).
    const scoped = options.scope === 'all' || options.status === 'all' ? approvals : approvals.filter((item) => this.canDecide(forRole, item.type));
    const entities = await this.loadEntities(scoped);
    let items = scoped.map((item) => this.view(item, entities, forRole));
    if (options.due === 'today') items = items.filter((item) => item.dueAt && iso(item.dueAt) === iso(today()));
    if (options.due === 'overdue') items = items.filter((item) => item.overdue);
    const weight = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || weight[a.priority] - weight[b.priority] || a.requestedAt.getTime() - b.requestedAt.getTime());
  }
  async list(options: ApprovalsQuery) { return this.query(options, currentRole()); }
  async summary(projectId?: string) {
    const role = currentRole();
    const items = await this.query({ projectId, status: 'open', scope: 'mine' }, role);
    const count = (category: Category) => items.filter((item) => item.category === category).length;
    return { role, total: items.length, requests: count('REQUESTS'), tasks: count('TASKS'), gates: count('GATES'), changes: count('CHANGES'),
      overdue: items.filter((item) => item.overdue).length, high: items.filter((item) => item.priority === 'HIGH' || item.priority === 'CRITICAL').length };
  }
  // Bloco "Aguardando decisão" do projeto: tudo que está aberto, independente do perfil.
  async projectPending(projectId: string) {
    if (!await this.prisma.project.findFirst({ where: { id: projectId, company: { active: true } }, select: { id: true } })) throw new NotFoundException('Projeto não encontrado.');
    const items = await this.query({ projectId, status: 'open', scope: 'all' }, currentRole());
    return { projectId, total: items.length, items: items.map((item) => ({ id: item.id, code: item.code, typeLabel: item.typeLabel, title: item.title, owner: item.owner, priority: item.priority, overdue: item.overdue, canDecide: item.canDecide })) };
  }

  async detail(id: string) {
    const role = currentRole();
    const approval = await this.prisma.approval.findUnique({ where: { id }, include: approvalInclude });
    if (!approval) throw new NotFoundException('Aprovação não encontrada.');
    const entities = await this.loadEntities([approval]);
    const base = this.view(approval, entities, role);
    const history = await this.prisma.auditLog.findMany({ where: { projectId: approval.projectId, entityType: approval.entityType, entityId: approval.entityId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 15 });
    const decisions = await this.prisma.approval.findMany({ where: { entityType: approval.entityType, entityId: approval.entityId, id: { not: id } }, orderBy: { requestedAt: 'desc' },
      select: { id: true, type: true, status: true, decision: true, decisionComment: true, decidedAt: true, decidedByRole: true, requestedAt: true } });
    return { ...base, context: await this.context(approval), history: history.reverse(), previousApprovals: decisions };
  }
  private async context(approval: LoadedApproval) {
    if (approval.entityType === 'ProjectRequest') {
      const request = await this.prisma.projectRequest.findUnique({ where: { id: approval.entityId }, include: {
        requirements: { orderBy: { order: 'asc' } }, phase: { select: { order: true, name: true } }, task: { select: { code: true, title: true, status: true } }, clientResponsible: { select: { name: true } } } });
      return request && { kind: 'REQUEST', code: request.code, title: request.title, description: request.description, instructions: request.instructions, acceptanceCriteria: request.acceptanceCriteria,
        status: request.status, mandatory: request.mandatory, blocking: request.blocking, dueDate: request.dueDate, phase: request.phase, linkedTask: request.task, responsible: request.clientResponsible?.name ?? null,
        requirements: request.requirements.map((item) => ({ label: item.label, completed: item.completed, required: item.required })), evidence: [] };
    }
    if (approval.entityType === 'Task') {
      const task = await this.prisma.task.findUnique({ where: { id: approval.entityId }, include: {
        requirements: { orderBy: { label: 'asc' } }, evidence: { orderBy: { createdAt: 'asc' } }, phase: { select: { order: true, name: true } },
        clientResponsible: { select: { name: true } }, jgm4Responsible: { select: { name: true } } } });
      return task && { kind: 'TASK', code: task.code, title: task.title, description: task.objective, instructions: task.instructions, acceptanceCriteria: task.acceptanceCriteria, status: task.status,
        responsibilityType: task.responsibilityType, plannedStartDate: task.plannedStartDate, plannedEndDate: task.plannedEndDate, phase: task.phase,
        responsible: { client: task.clientResponsible?.name ?? null, jgm4: task.jgm4Responsible?.name ?? null },
        requirements: task.requirements.map((item) => ({ label: item.label, completed: item.completed, required: item.required })),
        evidence: task.evidence.map((item) => ({ description: item.description, referenceUrl: item.referenceUrl, createdAt: item.createdAt })) };
    }
    if (approval.entityType === 'Gate') {
      const gate = await this.prisma.gate.findUnique({ where: { id: approval.entityId }, include: {
        criteria: { orderBy: { order: 'asc' } }, phase: { select: { order: true, name: true, tasks: { select: { code: true, title: true, status: true }, orderBy: { code: 'asc' } } } } } });
      return gate && { kind: 'GATE', code: gate.code, title: gate.title, description: gate.question, status: gate.status, phase: { order: gate.phase.order, name: gate.phase.name },
        technicalRecommendation: gate.technicalRecommendation, technicalOpinion: gate.technicalOpinion, clientDecision: gate.clientDecision, clientDecisionComment: gate.clientDecisionComment,
        criteria: gate.criteria.map((item) => ({ code: item.code, description: item.description, mandatory: item.mandatory, satisfied: item.satisfied, evidenceReference: item.evidenceReference })),
        activities: gate.phase.tasks };
    }
    return null;
  }

  // ---------------------------------------------------------------- decisão
  private async load(id: string) {
    const approval = await this.prisma.approval.findUnique({ where: { id }, include: approvalInclude });
    if (!approval) throw new NotFoundException('Aprovação não encontrada.');
    return approval;
  }
  async decide(id: string, outcome: Outcome, dto: DecisionDto) {
    const role = currentRole();
    const approval = await this.load(id);
    if (!OPEN_STATUSES.includes(approval.status)) throw new ConflictException('Esta aprovação já foi decidida e o histórico não pode ser alterado.');
    const permission = DECISION_PERMISSION[approval.type];
    assertCan(role, permission, `O perfil ${role} não tem alçada para decidir ${TYPE_LABELS[approval.type].toLowerCase()} (exige ${AUTHORITY_RULES.find((rule) => rule.permission === permission)!.roles.join(' ou ')}).`);
    const comment = dto.comment?.trim(); const instructions = dto.instructions?.trim();
    if (outcome === 'adjust' && (!comment || !instructions)) throw new BadRequestException('Para solicitar ajuste, informe o motivo e uma instrução clara.');
    if (outcome === 'reject' && !comment) throw new BadRequestException('Para rejeitar, informe o motivo.');
    const suggested = dto.suggestedDueDate ? fmtDate(dto.suggestedDueDate) : null;
    const guidance = compact(instructions, suggested ? `Prazo sugerido: ${suggested}` : null);
    const detailText = compact(comment, guidance);
    const payload = { instructions: instructions ?? null, suggestedDueDate: dto.suggestedDueDate?.slice(0, 10) ?? null };
    const ctx = (status: 'ADJUSTMENT_REQUESTED' | 'REJECTED') => ({ status, comment: detailText, payload });

    switch (approval.type) {
      case 'REQUEST_REVIEW': {
        const request = await this.prisma.projectRequest.findFirst({ where: { id: approval.entityId, projectId: approval.projectId }, select: { status: true } });
        if (!request || !['SENT_TO_JGM4', 'JGM4_REVIEW'].includes(request.status)) throw new ConflictException('A solicitação não está mais aguardando análise da JGM4.');
        if (request.status === 'SENT_TO_JGM4') await this.requests.transition(approval.projectId, approval.entityId, 'start-review', {});
        if (outcome === 'approve') await this.requests.transition(approval.projectId, approval.entityId, 'accept', { note: comment });
        else await withDecision(ctx(outcome === 'adjust' ? 'ADJUSTMENT_REQUESTED' : 'REJECTED'), () => this.requests.transition(approval.projectId, approval.entityId, 'request-adjustment', { note: detailText }));
        break;
      }
      case 'TASK_VALIDATION': {
        if (outcome === 'approve') await this.tasks.transition(approval.projectId, approval.entityId, 'validate', { comment });
        else await withDecision(ctx(outcome === 'adjust' ? 'ADJUSTMENT_REQUESTED' : 'REJECTED'), () => this.tasks.transition(approval.projectId, approval.entityId, 'request-adjustment', { comment, guidance: guidance || comment }));
        break;
      }
      case 'GATE_TECHNICAL_OPINION': {
        const opinion = dto.technicalOpinion?.trim() || comment;
        if (outcome === 'approve' && !opinion) throw new BadRequestException('Informe o parecer técnico que fundamenta a recomendação.');
        const gate = await this.prisma.gate.findFirst({ where: { id: approval.entityId, projectId: approval.projectId }, select: { status: true } });
        if (!gate || !['AVAILABLE', 'UNDER_REVIEW'].includes(gate.status)) throw new ConflictException('O Gate não está mais aguardando parecer técnico.');
        if (gate.status === 'AVAILABLE') await this.gates.transition(approval.projectId, approval.entityId, 'start-review', {});
        if (outcome === 'approve') await this.gates.transition(approval.projectId, approval.entityId, 'technical-opinion', { technicalRecommendation: 'ADVANCE', technicalOpinion: opinion });
        else if (outcome === 'adjust') await this.gates.transition(approval.projectId, approval.entityId, 'request-correction', { correctionReason: comment, correctionInstructions: guidance });
        else await withDecision(ctx('REJECTED'), () => this.gates.transition(approval.projectId, approval.entityId, 'technical-opinion', { technicalRecommendation: 'DO_NOT_ADVANCE', technicalOpinion: detailText }));
        break;
      }
      case 'GATE_CLIENT_DECISION': {
        const gate = await this.prisma.gate.findFirst({ where: { id: approval.entityId, projectId: approval.projectId }, select: { status: true } });
        if (!gate || gate.status !== 'TECHNICALLY_APPROVED') throw new ConflictException('O Gate não está mais aguardando a decisão do patrocinador.');
        if (outcome === 'approve') await this.gates.transition(approval.projectId, approval.entityId, 'client-decision', { clientDecision: 'APPROVE', comment });
        else if (outcome === 'reject') await withDecision(ctx('REJECTED'), () => this.gates.transition(approval.projectId, approval.entityId, 'client-decision', { clientDecision: 'REJECT', comment: detailText }));
        else {
          // "Solicitar ajuste" do patrocinador = manter em espera; a aprovação continua aberta e a pausa fica auditada.
          await this.gates.transition(approval.projectId, approval.entityId, 'client-decision', { clientDecision: 'HOLD', comment: detailText });
          await this.prisma.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Approval', entityId: approval.id, action: 'APPROVAL_ON_HOLD', actorType: role, newValue: { comment: detailText, ...payload } } });
        }
        break;
      }
      case 'DUE_DATE_CHANGE': await this.decideDueDate(approval, outcome, detailText); break;
      case 'RESPONSIBLE_CHANGE': await this.decideResponsible(approval, outcome, detailText); break;
      case 'TASK_REOPEN': await this.decideReopen(approval, outcome, detailText); break;
      case 'REQUEST_CANCEL': await this.decideCancellation(approval, outcome, detailText); break;
      default: await this.prisma.$transaction((tx) => this.closeOnly(tx, approval, outcome, detailText, payload));
    }
    return this.detail(id);
  }

  private statusOf(outcome: Outcome): 'APPROVED' | 'ADJUSTMENT_REQUESTED' | 'REJECTED' { return outcome === 'approve' ? 'APPROVED' : outcome === 'adjust' ? 'ADJUSTMENT_REQUESTED' : 'REJECTED'; }
  private async closeOnly(tx: Tx, approval: LoadedApproval, outcome: Outcome, comment: string, payload: Record<string, unknown> = {}) {
    const closed = await resolveApprovals(tx, { entityType: approval.entityType, entityId: approval.entityId, type: approval.type, status: this.statusOf(outcome), comment, payload: payload as Prisma.InputJsonObject });
    if (!closed) throw new ConflictException('Esta aprovação já foi decidida.');
  }
  private async lockOpen(tx: Tx, approval: LoadedApproval) {
    const fresh = await tx.approval.findUnique({ where: { id: approval.id } });
    if (!fresh || !OPEN_STATUSES.includes(fresh.status)) throw new ConflictException('Esta aprovação já foi decidida.');
    return fresh;
  }

  private async decideDueDate(approval: LoadedApproval, outcome: Outcome, comment: string) {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockOpen(tx, approval); const payload = fresh.payload as Record<string, any>;
      const task = await tx.task.findFirst({ where: { id: approval.entityId, projectId: approval.projectId } });
      if (!task) throw new NotFoundException('Atividade não encontrada.');
      const base = { approvalId: approval.id, requestedByRole: fresh.requestedByRole, decidedByRole: currentRole(), justification: payload.justification, comment };
      if (outcome === 'approve') {
        if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Atividade encerrada: o prazo não pode mais ser alterado.');
        if (iso(task.plannedEndDate) !== payload.currentDate) throw new ConflictException('O prazo atual da atividade mudou desde o pedido. Solicite novamente.');
        const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version }, data: { plannedEndDate: toDate(payload.newDate), version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: 'DUE_DATE_CHANGED', actorType: currentRole(),
          oldValue: { plannedEndDate: payload.currentDate }, newValue: { plannedEndDate: payload.newDate, ...base } } });
      } else {
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: outcome === 'reject' ? 'DUE_DATE_CHANGE_REJECTED' : 'DUE_DATE_CHANGE_ADJUSTMENT_REQUESTED', actorType: currentRole(),
          oldValue: { plannedEndDate: payload.currentDate }, newValue: { plannedEndDate: payload.currentDate, requestedDate: payload.newDate, ...base } } });
      }
      await this.closeOnly(tx, approval, outcome, comment);
    });
  }

  private async decideResponsible(approval: LoadedApproval, outcome: Outcome, comment: string) {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockOpen(tx, approval); const payload = fresh.payload as Record<string, any>;
      const task = await tx.task.findFirst({ where: { id: approval.entityId, projectId: approval.projectId } });
      if (!task) throw new NotFoundException('Atividade não encontrada.');
      const column = payload.field === 'JGM4' ? 'jgm4ResponsibleUserId' : 'clientResponsibleUserId';
      const base = { approvalId: approval.id, field: payload.field, requestedByRole: fresh.requestedByRole, decidedByRole: currentRole(), justification: payload.justification, comment };
      if (outcome === 'approve') {
        if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Atividade encerrada: o responsável não pode mais ser alterado.');
        if ((task[column] ?? null) !== (payload.currentUserId ?? null)) throw new ConflictException('O responsável atual mudou desde o pedido. Solicite novamente.');
        const user = await tx.user.findFirst({ where: { id: payload.newUserId, active: true } });
        if (!user) throw new ConflictException('O novo responsável não está mais ativo.');
        const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version }, data: { [column]: user.id, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: 'RESPONSIBLE_CHANGED', actorType: currentRole(),
          oldValue: { [column]: payload.currentUserId ?? null, name: payload.currentName ?? null }, newValue: { [column]: user.id, name: user.name, ...base } } });
      } else {
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: outcome === 'reject' ? 'RESPONSIBLE_CHANGE_REJECTED' : 'RESPONSIBLE_CHANGE_ADJUSTMENT_REQUESTED', actorType: currentRole(),
          oldValue: { [column]: payload.currentUserId ?? null }, newValue: { [column]: payload.currentUserId ?? null, requestedUserId: payload.newUserId, ...base } } });
      }
      await this.closeOnly(tx, approval, outcome, comment);
    });
  }

  // Gate já fechado impede a reabertura; Gate ainda em análise volta a bloqueado e perde suas aprovações abertas.
  private async decideReopen(approval: LoadedApproval, outcome: Outcome, comment: string) {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockOpen(tx, approval); const payload = fresh.payload as Record<string, any>;
      const task = await tx.task.findFirst({ where: { id: approval.entityId, projectId: approval.projectId }, include: { phase: { include: { gate: true } } } });
      if (!task) throw new NotFoundException('Atividade não encontrada.');
      const base = { approvalId: approval.id, requestedByRole: fresh.requestedByRole, decidedByRole: currentRole(), reason: payload.reason, comment };
      if (outcome === 'approve') {
        if (task.status !== 'COMPLETED') throw new ConflictException('Somente uma atividade concluída pode ser reaberta.');
        const gate = task.phase.gate;
        if (gate && ['APPROVED', 'CLOSED', 'REJECTED'].includes(gate.status)) throw new ConflictException(`O ${gate.code} já está fechado (${gate.status}); a atividade não pode ser reaberta.`);
        const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version, status: 'COMPLETED' }, data: {
          status: 'IN_PROGRESS', actualEndDate: null, currentOwnerType: task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT',
          nextAction: `Atividade reaberta: ${payload.reason}`, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException('Atividade alterada simultaneamente. Recarregue.');
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: 'REOPENED', actorType: currentRole(),
          oldValue: { status: 'COMPLETED', actualEndDate: iso(task.actualEndDate) }, newValue: { status: 'IN_PROGRESS', ...base } } });
        if (task.phase.status === 'WAITING_GATE') {
          await tx.phase.update({ where: { id: task.phaseId }, data: { status: 'IN_PROGRESS' } });
          await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Phase', entityId: task.phaseId, action: 'PHASE_REOPENED', actorType: currentRole(), oldValue: { status: 'WAITING_GATE' }, newValue: { status: 'IN_PROGRESS', taskId: task.id } } });
        }
        if (gate && ['AVAILABLE', 'UNDER_REVIEW', 'TECHNICALLY_APPROVED', 'CORRECTION_REQUIRED'].includes(gate.status)) {
          await tx.gate.update({ where: { id: gate.id }, data: { status: 'BLOCKED', currentOwnerType: 'SYSTEM', nextAction: `Aguardar a atividade ${task.code}, reaberta.` } });
          await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Gate', entityId: gate.id, action: 'GATE_RETURNED_TO_BLOCKED', actorType: currentRole(), oldValue: { status: gate.status }, newValue: { status: 'BLOCKED', reason: `Reabertura de ${task.code}` } } });
          for (const type of ['GATE_TECHNICAL_OPINION', 'GATE_CLIENT_DECISION'] as const) await resolveApprovals(tx, { entityType: 'Gate', entityId: gate.id, type, status: 'CANCELLED', comment: `Cancelada: ${task.code} foi reaberta.` });
        }
      } else {
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'Task', entityId: task.id, action: outcome === 'reject' ? 'REOPEN_REJECTED' : 'REOPEN_ADJUSTMENT_REQUESTED', actorType: currentRole(), newValue: { status: task.status, ...base } } });
      }
      await this.closeOnly(tx, approval, outcome, comment);
    });
  }

  private async decideCancellation(approval: LoadedApproval, outcome: Outcome, comment: string) {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockOpen(tx, approval); const payload = fresh.payload as Record<string, any>;
      const request = await tx.projectRequest.findFirst({ where: { id: approval.entityId, projectId: approval.projectId } });
      if (!request) throw new NotFoundException('Solicitação não encontrada.');
      const base = { approvalId: approval.id, requestedByRole: fresh.requestedByRole, decidedByRole: currentRole(), reason: payload.reason, comment };
      if (outcome === 'approve') {
        if (['ACCEPTED', 'CANCELLED'].includes(request.status)) throw new ConflictException(`Solicitação já encerrada (${request.status}).`);
        if (request.mandatory && request.blocking) throw new ConflictException('Solicitação obrigatória e bloqueante não pode ser cancelada.');
        const changed = await tx.projectRequest.updateMany({ where: { id: request.id, version: request.version }, data: { status: 'CANCELLED', version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException('Solicitação alterada simultaneamente. Recarregue.');
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'ProjectRequest', entityId: request.id, action: 'CANCELLED', actorType: currentRole(),
          oldValue: { status: request.status, version: request.version }, newValue: { status: 'CANCELLED', version: request.version + 1, ...base } } });
        await resolveApprovals(tx, { entityType: 'ProjectRequest', entityId: request.id, type: 'REQUEST_REVIEW', status: 'CANCELLED', comment: 'Cancelada: solicitação cancelada.' });
      } else {
        await tx.auditLog.create({ data: { projectId: approval.projectId, entityType: 'ProjectRequest', entityId: request.id, action: outcome === 'reject' ? 'CANCEL_REJECTED' : 'CANCEL_ADJUSTMENT_REQUESTED', actorType: currentRole(), newValue: { status: request.status, ...base } } });
      }
      await this.closeOnly(tx, approval, outcome, comment);
    });
  }

  // ---------------------------------------------------------------- pedidos de alteração
  private async taskForChange(tx: Tx, taskId: string) {
    const task = await tx.task.findFirst({ where: { id: taskId, project: { company: { active: true } } }, include: { clientResponsible: { select: { name: true } }, jgm4Responsible: { select: { name: true } }, project: { select: { companyId: true } } } });
    if (!task) throw new NotFoundException('Atividade não encontrada.');
    return task;
  }
  private async assertNoOpen(tx: Tx, entityType: string, entityId: string, type: ApprovalType) {
    if (await tx.approval.findFirst({ where: { entityType, entityId, type, status: { in: OPEN_STATUSES } }, select: { id: true } })) throw new ConflictException('Já existe uma solicitação aberta deste tipo para este item.');
  }
  private async openChange(tx: Tx, input: { projectId: string; type: ApprovalType; entityType: string; entityId: string; code: string; title: string; description: string; assignedRole: Role; priority?: 'NORMAL' | 'HIGH'; dueAt?: Date | null; payload: Prisma.InputJsonObject; auditAction: string }) {
    const role = currentRole();
    const { approval } = await ensureApproval(tx, { ...input, entityCode: input.code, requestedByRole: role, actorType: role });
    await tx.auditLog.create({ data: { projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, action: input.auditAction, actorType: role, newValue: { approvalId: approval.id, ...input.payload } } });
    return approval.id;
  }

  async requestDueDateChange(taskId: string, dto: DueDateChangeDto) {
    assertCan(currentRole(), 'DUE_DATE_REQUEST');
    const id = await this.prisma.$transaction(async (tx) => {
      const task = await this.taskForChange(tx, taskId);
      if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Atividade encerrada: não há prazo a alterar.');
      const requested = toDate(dto.requestedDate);
      if (iso(task.plannedEndDate) === iso(requested)) throw new BadRequestException('O novo prazo é igual ao prazo atual.');
      if (task.plannedStartDate && requested < task.plannedStartDate) throw new BadRequestException('O novo prazo não pode ser anterior ao início planejado.');
      await this.assertNoOpen(tx, 'Task', task.id, 'DUE_DATE_CHANGE');
      const deltaDays = task.plannedEndDate ? dayDiff(task.plannedEndDate, requested) : 0;
      return this.openChange(tx, { projectId: task.projectId, type: 'DUE_DATE_CHANGE', entityType: 'Task', entityId: task.id, code: task.code,
        title: `${task.code} — Alteração de prazo`, description: dto.justification.trim(), assignedRole: 'JGM4_ADMIN', priority: Math.abs(deltaDays) > 14 ? 'HIGH' : 'NORMAL', dueAt: task.plannedEndDate,
        payload: { currentDate: iso(task.plannedEndDate), newDate: iso(requested), deltaDays, justification: dto.justification.trim(), expectedImpact: dto.expectedImpact?.trim() || null }, auditAction: 'DUE_DATE_CHANGE_REQUESTED' });
    });
    return this.detail(id);
  }
  async requestResponsibleChange(taskId: string, dto: ResponsibleChangeDto) {
    assertCan(currentRole(), 'RESPONSIBLE_REQUEST');
    const id = await this.prisma.$transaction(async (tx) => {
      const task = await this.taskForChange(tx, taskId);
      if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Atividade encerrada: não há responsável a trocar.');
      const user = await tx.user.findFirst({ where: { id: dto.newUserId, active: true } });
      if (!user) throw new NotFoundException('Novo responsável não encontrado ou inativo.');
      const jgm4Side = dto.field === 'JGM4';
      if (jgm4Side ? !isJgm4Role(user.role) : (isJgm4Role(user.role) || user.companyId !== task.project.companyId)) throw new BadRequestException(jgm4Side ? 'O responsável JGM4 deve ser um usuário JGM4.' : 'O responsável do cliente deve pertencer à empresa do projeto.');
      const currentUserId = jgm4Side ? task.jgm4ResponsibleUserId : task.clientResponsibleUserId;
      if (currentUserId === user.id) throw new BadRequestException('O novo responsável já é o responsável atual.');
      await this.assertNoOpen(tx, 'Task', task.id, 'RESPONSIBLE_CHANGE');
      return this.openChange(tx, { projectId: task.projectId, type: 'RESPONSIBLE_CHANGE', entityType: 'Task', entityId: task.id, code: task.code,
        title: `${task.code} — Troca de responsável ${jgm4Side ? 'JGM4' : 'do cliente'}`, description: dto.justification.trim(), assignedRole: 'JGM4_ADMIN',
        payload: { field: dto.field, currentUserId, currentName: (jgm4Side ? task.jgm4Responsible : task.clientResponsible)?.name ?? null, newUserId: user.id, newName: user.name, justification: dto.justification.trim() }, auditAction: 'RESPONSIBLE_CHANGE_REQUESTED' });
    });
    return this.detail(id);
  }
  async requestReopen(taskId: string, dto: ReasonDto) {
    assertCan(currentRole(), 'TASK_REOPEN_REQUEST');
    const id = await this.prisma.$transaction(async (tx) => {
      const task = await this.taskForChange(tx, taskId);
      if (task.status !== 'COMPLETED') throw new ConflictException('Somente uma atividade concluída pode ter reabertura solicitada.');
      await this.assertNoOpen(tx, 'Task', task.id, 'TASK_REOPEN');
      return this.openChange(tx, { projectId: task.projectId, type: 'TASK_REOPEN', entityType: 'Task', entityId: task.id, code: task.code,
        title: `${task.code} — Reabertura de atividade`, description: dto.reason.trim(), assignedRole: 'JGM4_ADMIN', priority: 'HIGH',
        payload: { reason: dto.reason.trim(), previousStatus: task.status }, auditAction: 'REOPEN_REQUESTED' });
    });
    return this.detail(id);
  }
  async requestCancellation(projectId: string, requestId: string, dto: ReasonDto) {
    assertCan(currentRole(), 'REQUEST_CANCEL_REQUEST');
    const id = await this.prisma.$transaction(async (tx) => {
      const request = await tx.projectRequest.findFirst({ where: { id: requestId, projectId, project: { company: { active: true } } } });
      if (!request) throw new NotFoundException('Solicitação não encontrada neste projeto.');
      if (['ACCEPTED', 'CANCELLED'].includes(request.status)) throw new ConflictException(`Solicitação já encerrada (${request.status}).`);
      if (request.mandatory && request.blocking) throw new ConflictException('Solicitação obrigatória e bloqueante não pode ser cancelada.');
      await this.assertNoOpen(tx, 'ProjectRequest', request.id, 'REQUEST_CANCEL');
      return this.openChange(tx, { projectId, type: 'REQUEST_CANCEL', entityType: 'ProjectRequest', entityId: request.id, code: request.code,
        title: `${request.code} — Cancelamento`, description: dto.reason.trim(), assignedRole: 'JGM4_ADMIN', dueAt: request.dueDate,
        payload: { reason: dto.reason.trim(), previousStatus: request.status }, auditAction: 'CANCEL_REQUESTED' });
    });
    return this.detail(id);
  }
}
