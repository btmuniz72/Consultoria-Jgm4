import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RequestStatus } from '../generated/prisma/client';
import { RequestFilter, RequirementDto, TransitionDto } from './requests.dto';
import { TasksService } from '../tasks/tasks.service';
import { GatesService } from '../gates/gates.service';
import { ensureApproval, markInReview, resolveApprovals } from '../approvals/approval-sync';
import { assertCan, currentRole } from '../approvals/authority';

const include = {
  phase: { select: { id: true, order: true, name: true } },
  task: { select: { id: true, code: true, title: true, status: true } },
  clientResponsible: { select: { id: true, name: true } },
  requirements: { orderBy: { order: 'asc' as const } },
} satisfies Prisma.ProjectRequestInclude;
type LoadedRequest = Prisma.ProjectRequestGetPayload<{ include: typeof include }>;
type Db = Prisma.TransactionClient;
export const requestActions = ['request', 'start', 'send', 'start-review', 'request-adjustment', 'accept'] as const;
export type RequestAction = typeof requestActions[number];
const transitions: Record<RequestAction, { from: RequestStatus[]; to: RequestStatus; actor: string }> = {
  request: { from: ['AVAILABLE'], to: 'REQUESTED', actor: 'JGM4_LOCAL' },
  start: { from: ['REQUESTED', 'ADJUSTMENT_REQUESTED'], to: 'CLIENT_PREPARING', actor: 'CLIENT_LOCAL' },
  send: { from: ['CLIENT_PREPARING'], to: 'SENT_TO_JGM4', actor: 'CLIENT_LOCAL' },
  'start-review': { from: ['SENT_TO_JGM4'], to: 'JGM4_REVIEW', actor: 'JGM4_LOCAL' },
  'request-adjustment': { from: ['JGM4_REVIEW'], to: 'ADJUSTMENT_REQUESTED', actor: 'JGM4_LOCAL' },
  accept: { from: ['JGM4_REVIEW'], to: 'ACCEPTED', actor: 'JGM4_LOCAL' },
};
const nextActions: Record<RequestStatus, { currentOwnerType: string; nextAction: string }> = {
  PLANNED: { currentOwnerType: 'JGM4', nextAction: 'Aguardar disponibilização da solicitação.' },
  BLOCKED: { currentOwnerType: 'SYSTEM', nextAction: 'Aguardar liberação das dependências.' },
  AVAILABLE: { currentOwnerType: 'JGM4', nextAction: 'Enviar solicitação ao cliente.' },
  REQUESTED: { currentOwnerType: 'CLIENT', nextAction: 'Iniciar preparação da resposta.' },
  CLIENT_PREPARING: { currentOwnerType: 'CLIENT', nextAction: 'Completar requisitos e enviar resposta para JGM4.' },
  SENT_TO_JGM4: { currentOwnerType: 'JGM4', nextAction: 'Iniciar análise da resposta recebida.' },
  JGM4_REVIEW: { currentOwnerType: 'JGM4', nextAction: 'Analisar a resposta e aceitar ou solicitar ajuste.' },
  ADJUSTMENT_REQUESTED: { currentOwnerType: 'CLIENT', nextAction: 'Retomar preparação e corrigir os pontos solicitados.' },
  ACCEPTED: { currentOwnerType: 'NONE', nextAction: 'Solicitação aceita e mantida no histórico.' },
  CANCELLED: { currentOwnerType: 'NONE', nextAction: 'Solicitação cancelada. Consultar histórico.' },
};

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService, private readonly tasks: TasksService, private readonly gates: GatesService) {}
  private async assertProject(db: Db, projectId: string) {
    if (!await db.project.findFirst({ where: { id: projectId, company: { active: true } } })) {
      throw new NotFoundException('Projeto não encontrado.');
    }
  }
  private async load(db: Db, projectId: string, id: string) {
    await this.assertProject(db, projectId);
    const item = await db.projectRequest.findFirst({ where: { id, projectId }, include });
    if (!item) throw new NotFoundException('Solicitação não encontrada neste projeto.');
    return item;
  }
  private async decorate(db: Db, item: LoadedRequest) {
    const previousGate = item.phase.order > 0 ? await db.gate.findFirst({
      where: { projectId: item.projectId, phase: { order: item.phase.order - 1 } },
      select: { id: true, code: true, title: true, status: true },
    }) : null;
    const gateBlocked = item.phase.order > 0 && previousGate?.status !== 'APPROVED';
    const blockedReason = gateBlocked ? `Gate anterior não aprovado: ${previousGate?.code ?? 'Gate não cadastrado'}.`
      : item.status === 'BLOCKED' ? 'Solicitação bloqueada; aguarda liberação pelo sistema.' : null;
    const missingRequirements = item.requirements.filter((req) => req.required && !req.completed);
    return {
      ...item, estimatedClientHours: item.estimatedClientHours?.toNumber() ?? null,
      ...nextActions[gateBlocked ? 'BLOCKED' : item.status], currentOwnerUserId: nextActions[item.status].currentOwnerType === 'CLIENT' ? item.clientResponsibleId : null,
      nextActionDueDate: item.dueDate, blockedReason, previousGate, missingRequirements,
      allowedActions: gateBlocked ? [] : requestActions.filter((action) => transitions[action].from.includes(item.status)),
      canEditRequirements: !gateBlocked && item.status === 'CLIENT_PREPARING',
      canSend: !gateBlocked && item.status === 'CLIENT_PREPARING' && missingRequirements.length === 0,
    };
  }
  async list(projectId: string, filter = RequestFilter.ALL) {
    await this.assertProject(this.prisma, projectId);
    const statusFilters: Record<RequestFilter, RequestStatus[] | undefined> = {
      all: undefined, available: ['AVAILABLE'], client: ['REQUESTED', 'CLIENT_PREPARING', 'ADJUSTMENT_REQUESTED'],
      jgm4: ['SENT_TO_JGM4', 'JGM4_REVIEW'], blocked: ['BLOCKED'], accepted: ['ACCEPTED'],
    };
    const items = await this.prisma.projectRequest.findMany({
      where: { projectId, status: statusFilters[filter] ? { in: statusFilters[filter] } : undefined },
      include, orderBy: [{ phase: { order: 'asc' } }, { code: 'asc' }],
    });
    return Promise.all(items.map((item) => this.decorate(this.prisma, item)));
  }
  async detail(projectId: string, id: string) {
    const item = await this.load(this.prisma, projectId, id);
    const history = await this.prisma.auditLog.findMany({
      where: { projectId, entityType: 'ProjectRequest', entityId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, action: true, oldValue: true, newValue: true, actorType: true, userId: true, createdAt: true },
    });
    return { ...await this.decorate(this.prisma, item), history };
  }
  private assertVersion(actual: number, expected?: number) {
    if (expected !== undefined && expected !== actual) throw new ConflictException('A solicitação foi atualizada. Recarregue antes de continuar.');
  }
  async transition(projectId: string, id: string, action: RequestAction, dto: TransitionDto = {}) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.load(tx, projectId, id);
      const view = await this.decorate(tx, item);
      const rule = transitions[action];
      this.assertVersion(item.version, dto.expectedVersion);
      if (view.blockedReason || !rule.from.includes(item.status)) {
        throw new ConflictException(view.blockedReason || `Transição ${action} não permitida no status ${item.status}.`);
      }
      if (action === 'send' && view.missingRequirements.length) {
        throw new BadRequestException({ message: 'Complete todos os requisitos obrigatórios antes de enviar.', missingRequirements: view.missingRequirements.map((req) => req.label) });
      }
      if (action === 'request-adjustment' && !dto.note?.trim()) throw new BadRequestException('Informe o motivo do ajuste.');
      if (['start-review', 'request-adjustment', 'accept'].includes(action)) assertCan(currentRole(), 'REQUEST_VALIDATE', 'Somente a JGM4 pode analisar e decidir respostas de solicitações.');
      const result = await tx.projectRequest.updateMany({ where: { id, projectId, version: item.version }, data: { status: rule.to, version: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException('Solicitação alterada simultaneamente. Recarregue.');
      await tx.auditLog.create({ data: {
        projectId, entityType: 'ProjectRequest', entityId: id,
        action: action === 'accept' ? 'ACCEPTED' : action === 'request-adjustment' ? 'ADJUSTMENT_REQUESTED' : 'STATUS_CHANGED',
        actorType: rule.actor, oldValue: { status: item.status, version: item.version },
        newValue: { status: rule.to, version: item.version + 1, note: dto.note?.trim() || null },
      } });
      await this.syncApproval(tx, item, action, dto.note?.trim() || null);
      if (action === 'accept') { await this.tasks.releaseAfterRequestChange(tx, projectId); await this.gates.syncProject(tx, projectId); }
      return this.decorate(tx, await this.load(tx, projectId, id));
    });
  }
  // Central de Aprovações: o envio ao JGM4 abre a aprovação; a análise e a decisão a acompanham.
  private async syncApproval(tx: Db, item: LoadedRequest, action: RequestAction, note: string | null) {
    const key = { entityType: 'ProjectRequest', entityId: item.id, type: 'REQUEST_REVIEW' as const };
    if (action === 'send') {
      await ensureApproval(tx, { ...key, projectId: item.projectId, entityCode: item.code, title: `${item.code} — ${item.title}`,
        description: item.description, assignedRole: 'JGM4_CONSULTANT', dueAt: item.dueDate, requestedByRole: currentRole(),
        priority: item.mandatory && item.blocking ? 'HIGH' : 'NORMAL', actorType: currentRole() });
    } else if (action === 'start-review') await markInReview(tx, key.entityType, key.entityId, key.type);
    else if (action === 'accept') await resolveApprovals(tx, { ...key, status: 'APPROVED', comment: note });
    else if (action === 'request-adjustment') await resolveApprovals(tx, { ...key, status: 'ADJUSTMENT_REQUESTED', comment: note });
  }
  async requirement(projectId: string, id: string, requirementId: string, dto: RequirementDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.load(tx, projectId, id);
      this.assertVersion(item.version, dto.expectedVersion);
      if (!(await this.decorate(tx, item)).canEditRequirements) throw new ConflictException('Requisitos só podem ser alterados durante a preparação da resposta.');
      const requirement = item.requirements.find((req) => req.id === requirementId);
      if (!requirement) throw new NotFoundException('Requisito não encontrado nesta solicitação.');
      if (requirement.completed === dto.completed) return this.decorate(tx, item);
      const updated = await tx.projectRequest.updateMany({ where: { id, projectId, version: item.version }, data: { version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('Solicitação alterada simultaneamente. Recarregue.');
      await tx.requestRequirement.update({ where: { id: requirementId }, data: { completed: dto.completed, completedAt: dto.completed ? new Date() : null, completedByUserId: null } });
      await tx.auditLog.create({ data: {
        projectId, entityType: 'ProjectRequest', entityId: id, action: 'REQUIREMENT_CHANGED', actorType: 'CLIENT_LOCAL',
        oldValue: { requirementId, completed: requirement.completed }, newValue: { requirementId, label: requirement.label, completed: dto.completed },
      } });
      return this.decorate(tx, await this.load(tx, projectId, id));
    });
  }
}
