import type { ApprovalPriority, ApprovalStatus, ApprovalType, Prisma, UserRole } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { currentDecision, currentRole, currentUserId } from './authority';

// Funções de baixo nível chamadas pelos workflows (solicitações, atividades, Gates) dentro da própria
// transação. Não dependem de nenhum serviço, o que evita dependência circular com a Central.
type Db = Prisma.TransactionClient | PrismaService;
export const OPEN_STATUSES: ApprovalStatus[] = ['PENDING', 'IN_REVIEW'];

export interface EnsureApprovalInput {
  projectId: string; type: ApprovalType; entityType: string; entityId: string; entityCode?: string | null;
  title: string; description: string; assignedRole: UserRole; priority?: ApprovalPriority;
  dueAt?: Date | null; requestedByRole?: UserRole | null; payload?: Prisma.InputJsonObject | null;
  status?: ApprovalStatus; actorType?: string; requestedAt?: Date;
}

// Idempotente: se já existe aprovação aberta para a mesma entidade e tipo, não cria outra.
export async function ensureApproval(db: Db, input: EnsureApprovalInput) {
  const existing = await db.approval.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, type: input.type, status: { in: OPEN_STATUSES } } });
  if (existing) return { approval: existing, created: false };
  const approval = await db.approval.create({ data: {
    projectId: input.projectId, type: input.type, entityType: input.entityType, entityId: input.entityId, entityCode: input.entityCode ?? null,
    title: input.title, description: input.description, assignedRole: input.assignedRole, priority: input.priority ?? 'NORMAL',
    dueAt: input.dueAt ?? null, requestedByRole: input.requestedByRole ?? null, requestedByUserId: input.actorType ? currentUserId() : null, payload: input.payload ?? undefined, status: input.status ?? 'PENDING', requestedAt: input.requestedAt,
  } });
  await db.auditLog.create({ data: { userId: input.actorType ? currentUserId() : null, projectId: input.projectId, entityType: 'Approval', entityId: approval.id, action: 'APPROVAL_CREATED',
    actorType: input.actorType ?? 'SYSTEM', newValue: { type: input.type, entityType: input.entityType, entityId: input.entityId, code: input.entityCode ?? null, assignedRole: input.assignedRole, priority: approval.priority } } });
  return { approval, created: true };
}

export async function markInReview(db: Db, entityType: string, entityId: string, type: ApprovalType) {
  const approval = await db.approval.findFirst({ where: { entityType, entityId, type, status: 'PENDING' } });
  if (!approval) return null;
  const updated = await db.approval.update({ where: { id: approval.id }, data: { status: 'IN_REVIEW' } });
  await db.auditLog.create({ data: { userId: currentUserId(), projectId: approval.projectId, entityType: 'Approval', entityId: approval.id, action: 'APPROVAL_IN_REVIEW', actorType: currentRole(),
    oldValue: { status: 'PENDING' }, newValue: { status: 'IN_REVIEW' } } });
  return updated;
}

export interface ResolveApprovalInput {
  entityType: string; entityId: string; type: ApprovalType;
  status: 'APPROVED' | 'ADJUSTMENT_REQUESTED' | 'REJECTED' | 'CANCELLED'; comment?: string | null; payload?: Prisma.InputJsonObject;
}
const ACTIONS = { APPROVED: 'APPROVAL_APPROVED', ADJUSTMENT_REQUESTED: 'APPROVAL_ADJUSTMENT_REQUESTED', REJECTED: 'APPROVAL_REJECTED', CANCELLED: 'APPROVAL_CANCELLED' } as const;

// Encerra a aprovação aberta correspondente. Se a decisão veio pela Central, o desfecho escolhido
// ali (`withDecision`) substitui o padrão do workflow. Nunca apaga: apenas decide, preservando o histórico.
export async function resolveApprovals(db: Db, input: ResolveApprovalInput) {
  const ctx = input.status === 'CANCELLED' ? undefined : currentDecision();
  const status = ctx?.status ?? input.status;
  const comment = ctx?.comment ?? input.comment ?? null;
  const role = currentRole();
  const open = await db.approval.findMany({ where: { entityType: input.entityType, entityId: input.entityId, type: input.type, status: { in: OPEN_STATUSES } } });
  for (const approval of open) {
    await db.approval.update({ where: { id: approval.id }, data: {
      status, decision: status === 'CANCELLED' ? null : status, decisionComment: comment, decidedAt: new Date(), decidedByUserId: status === 'CANCELLED' ? null : currentUserId(),
      decidedByRole: status === 'CANCELLED' ? null : role,
      ...(ctx?.payload ? { payload: { ...((approval.payload as object | null) ?? {}), decision: ctx.payload } as Prisma.InputJsonObject } : {}),
    } });
    await db.auditLog.create({ data: { userId: status === 'CANCELLED' ? null : currentUserId(), projectId: approval.projectId, entityType: 'Approval', entityId: approval.id, action: ACTIONS[status],
      actorType: status === 'CANCELLED' ? 'SYSTEM' : role, oldValue: { status: approval.status },
      newValue: { status, type: approval.type, entityType: approval.entityType, entityId: approval.entityId, code: approval.entityCode, comment, decidedByRole: status === 'CANCELLED' ? null : role, ...(ctx?.payload ?? {}), ...(input.payload ?? {}) } } });
  }
  return open.length;
}
