import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { GateClientDecision, GateRecommendation, GateStatus, Prisma } from '../generated/prisma/client';
import { assertCan, currentRole, currentUserId, isJgm4Role } from '../approvals/authority';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectOpen } from '../projects/project-guard';
import { averageProgress } from '../tasks/progress';

export class MilestonePlanDto {
  @IsOptional() @IsDateString() plannedDate?: string | null;
  @IsOptional() @IsDateString() actualDate?: string | null;
  @IsOptional() @IsUUID() jgm4ResponsibleUserId?: string | null;
  @IsOptional() @IsUUID() clientResponsibleUserId?: string | null;
}
export class CriterionDto { @IsBoolean() satisfied!: boolean; @IsOptional() @IsString() @MaxLength(2000) evidenceReference?: string }
export class ReasonDto { @IsString() @MinLength(3) @MaxLength(5000) reason!: string }
export class OpinionDto { @IsEnum(GateRecommendation) recommendation!: GateRecommendation; @IsString() @MinLength(3) @MaxLength(5000) opinion!: string }
export class ClientDecisionDto { @IsEnum(GateClientDecision) decision!: GateClientDecision; @IsOptional() @IsString() @MaxLength(5000) comment?: string }

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const REVIEWABLE: GateStatus[] = ['BLOCKED', 'AVAILABLE', 'CORRECTION_REQUIRED', 'REJECTED'];

/**
 * Marcos internos de uma fase (M1..M4). Totalmente separados dos Gates contratuais: este serviço nunca lê nem altera
 * Gate, Phase.status ou tarefas — não libera fase, não afeta pagamento nem o GATE-1.
 */
@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(db: Prisma.TransactionClient | PrismaService, projectId: string, id: string) {
    const row = await db.phaseMilestone.findFirst({ where: { id, projectId }, include: {
      criteria: { orderBy: { order: 'asc' } },
      tasks: { orderBy: { code: 'asc' }, select: { id: true, code: true, title: true, status: true, category: true, classification: true, priority: true, requirements: { select: { required: true, completed: true } } } },
      phase: { select: { id: true, name: true, order: true } },
      jgm4Responsible: { select: { id: true, name: true } }, clientResponsible: { select: { id: true, name: true } },
    } });
    if (!row) throw new NotFoundException('Marco não encontrado neste projeto.');
    return row;
  }

  private present(row: Awaited<ReturnType<MilestonesService['load']>>) {
    const mandatory = row.criteria.filter((c) => c.mandatory);
    const pendingCriteria = mandatory.filter((c) => !c.satisfied).length;
    const tasks = row.tasks.map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, category: t.category, classification: t.classification, priority: t.priority, progressPercent: averageProgress([t]) }));
    const counted = row.tasks.filter((t) => t.status !== 'CANCELLED');
    // Percentual CALCULADO: aprovado = 100; com atividades vinculadas = média delas; sem atividades = critérios atendidos.
    const progressPercent = row.status === 'APPROVED' ? 100 : counted.length ? averageProgress(counted) : mandatory.length ? Math.round(((mandatory.length - pendingCriteria) / mandatory.length) * 100) : 0;
    const jgm4 = isJgm4Role(currentRole()); const client = currentRole() === 'CLIENT_SPONSOR' || currentRole() === 'CLIENT_MANAGER';
    const allowedActions: string[] = [];
    if (jgm4 && row.status !== 'APPROVED') allowedActions.push('update-plan', 'set-criterion');
    if (jgm4 && REVIEWABLE.includes(row.status) && pendingCriteria === 0) allowedActions.push('start-review');
    if (jgm4 && ['UNDER_REVIEW', 'TECHNICALLY_APPROVED'].includes(row.status)) allowedActions.push('request-correction');
    if (jgm4 && row.status === 'UNDER_REVIEW') allowedActions.push('technical-opinion');
    if (client && row.status === 'TECHNICALLY_APPROVED') allowedActions.push('client-decision');
    return { id: row.id, projectId: row.projectId, phase: row.phase, code: row.code, title: row.title, question: row.question, order: row.order, status: row.status,
      plannedDate: row.plannedDate, actualDate: row.actualDate, jgm4Responsible: row.jgm4Responsible, clientResponsible: row.clientResponsible,
      technicalOpinion: row.technicalOpinion, technicalRecommendation: row.technicalRecommendation, technicalApprovedAt: row.technicalApprovedAt,
      clientDecision: row.clientDecision, clientDecisionComment: row.clientDecisionComment, clientDecisionAt: row.clientDecisionAt, correctionReason: row.correctionReason,
      criteria: row.criteria.map((c) => ({ id: c.id, code: c.code, description: c.description, mandatory: c.mandatory, satisfied: c.satisfied, satisfiedAt: c.satisfiedAt, evidenceReference: c.evidenceReference, order: c.order })),
      pendingCriteria, tasks, progressPercent, allowedActions };
  }

  async list(projectId: string) {
    const ids = await this.prisma.phaseMilestone.findMany({ where: { projectId, phase: { archived: false } }, select: { id: true }, orderBy: [{ phase: { order: 'asc' } }, { order: 'asc' }] });
    return Promise.all(ids.map(async ({ id }) => this.present(await this.load(this.prisma, projectId, id))));
  }

  async detail(projectId: string, id: string) {
    const history = await this.prisma.auditLog.findMany({ where: { projectId, entityType: 'PhaseMilestone', entityId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { user: { select: { name: true } } } });
    return { ...this.present(await this.load(this.prisma, projectId, id)), history: history.map((h) => ({ id: h.id, action: h.action, actorType: h.actorType, userName: h.user?.name ?? null, createdAt: h.createdAt, oldValue: h.oldValue, newValue: h.newValue })) };
  }

  private log(tx: Prisma.TransactionClient, projectId: string, id: string, action: string, oldValue: unknown, newValue: unknown) {
    return tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'PhaseMilestone', entityId: id, action, actorType: currentRole(), oldValue: JSON.parse(JSON.stringify(oldValue ?? null)) ?? Prisma.JsonNull, newValue: JSON.parse(JSON.stringify(newValue ?? null)) ?? Prisma.JsonNull } });
  }

  /** Executa uma mudança de estado com condição de status (evita decisões concorrentes) e devolve o marco atualizado. */
  private async transition(projectId: string, id: string, from: GateStatus[], data: Prisma.PhaseMilestoneUncheckedUpdateManyInput, action: string, extra: unknown, guard?: (row: Awaited<ReturnType<MilestonesService['load']>>) => void) {
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const before = await this.load(tx, projectId, id);
      if (!from.includes(before.status)) throw new ConflictException(`Ação indisponível para o marco no status ${before.status}.`);
      guard?.(before);
      const result = await tx.phaseMilestone.updateMany({ where: { id, projectId, status: before.status }, data });
      if (!result.count) throw new ConflictException('Marco alterado simultaneamente. Recarregue.');
      await this.log(tx, projectId, id, action, { status: before.status }, { ...(extra as object), status: data.status });
      return this.present(await this.load(tx, projectId, id));
    });
  }

  async updatePlan(projectId: string, id: string, dto: MilestonePlanDto) {
    assertCan(currentRole(), 'MILESTONE_MANAGE', 'Somente a JGM4 altera o planejamento do marco.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const before = await this.load(tx, projectId, id);
      if (before.status === 'APPROVED') throw new ConflictException('Marco aprovado: somente consulta.');
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } });
      const data: Prisma.PhaseMilestoneUncheckedUpdateInput = {}; const changes: Record<string, unknown> = {};
      for (const key of ['plannedDate', 'actualDate'] as const) if (dto[key] !== undefined) { data[key] = dto[key] ? toDate(dto[key]!) : null; changes[key] = dto[key]; }
      if (dto.jgm4ResponsibleUserId !== undefined) {
        if (dto.jgm4ResponsibleUserId && !await tx.user.findFirst({ where: { id: dto.jgm4ResponsibleUserId, active: true, role: { in: ['JGM4_ADMIN', 'JGM4_CONSULTANT'] } }, select: { id: true } })) throw new BadRequestException('Responsável JGM4 inválido.');
        data.jgm4ResponsibleUserId = dto.jgm4ResponsibleUserId; changes['jgm4ResponsibleUserId'] = dto.jgm4ResponsibleUserId;
      }
      if (dto.clientResponsibleUserId !== undefined) {
        if (dto.clientResponsibleUserId && !await tx.user.findFirst({ where: { id: dto.clientResponsibleUserId, active: true, companyId: project.companyId, role: { in: ['CLIENT_SPONSOR', 'CLIENT_MANAGER', 'CLIENT_USER', 'CLIENT_EXECUTIVE'] } }, select: { id: true } })) throw new BadRequestException('Responsável do cliente inválido para este projeto.');
        data.clientResponsibleUserId = dto.clientResponsibleUserId; changes['clientResponsibleUserId'] = dto.clientResponsibleUserId;
      }
      if (!Object.keys(changes).length) throw new BadRequestException('Informe pelo menos um campo.');
      await tx.phaseMilestone.update({ where: { id }, data });
      await this.log(tx, projectId, id, 'MILESTONE_PLAN_UPDATED', {}, changes);
      return this.present(await this.load(tx, projectId, id));
    });
  }

  async setCriterion(projectId: string, id: string, criterionId: string, dto: CriterionDto) {
    assertCan(currentRole(), 'MILESTONE_MANAGE', 'Somente a JGM4 atualiza critérios do marco.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      const before = await this.load(tx, projectId, id);
      if (!['BLOCKED', 'AVAILABLE', 'CORRECTION_REQUIRED', 'REJECTED'].includes(before.status)) throw new ConflictException('Os critérios só mudam antes da análise ou durante a correção.');
      const criterion = before.criteria.find((c) => c.id === criterionId); if (!criterion) throw new NotFoundException('Critério não encontrado neste marco.');
      await tx.milestoneCriterion.update({ where: { id: criterionId }, data: { satisfied: dto.satisfied, satisfiedAt: dto.satisfied ? new Date() : null, satisfiedByUserId: dto.satisfied ? currentUserId() : null, ...(dto.evidenceReference !== undefined ? { evidenceReference: dto.evidenceReference } : {}) } });
      const after = (await tx.milestoneCriterion.findMany({ where: { milestoneId: id, mandatory: true } })).every((c) => c.satisfied);
      // Pronto para análise quando todos os critérios obrigatórios estão atendidos; volta a "em preparação" se algum for reaberto.
      const status: GateStatus = before.status === 'BLOCKED' && after ? 'AVAILABLE' : before.status === 'AVAILABLE' && !after ? 'BLOCKED' : before.status;
      if (status !== before.status) await tx.phaseMilestone.update({ where: { id }, data: { status } });
      await this.log(tx, projectId, id, 'MILESTONE_CRITERION_SET', { code: criterion.code, satisfied: criterion.satisfied }, { code: criterion.code, satisfied: dto.satisfied, status });
      return this.present(await this.load(tx, projectId, id));
    });
  }

  startReview(projectId: string, id: string) {
    assertCan(currentRole(), 'MILESTONE_MANAGE', 'Somente a JGM4 inicia a análise do marco.');
    return this.transition(projectId, id, REVIEWABLE, { status: 'UNDER_REVIEW', correctionReason: null }, 'MILESTONE_REVIEW_STARTED', {}, (row) => {
      if (row.criteria.some((c) => c.mandatory && !c.satisfied)) throw new ConflictException('Há critérios obrigatórios pendentes.');
    });
  }

  requestCorrection(projectId: string, id: string, dto: ReasonDto) {
    assertCan(currentRole(), 'MILESTONE_MANAGE', 'Somente a JGM4 solicita correção do marco.');
    return this.transition(projectId, id, ['UNDER_REVIEW', 'TECHNICALLY_APPROVED'], { status: 'CORRECTION_REQUIRED', correctionReason: dto.reason, technicalRecommendation: null, technicalApprovedAt: null, technicalApprovedByUserId: null, clientDecision: null, clientDecisionAt: null, clientDecisionByUserId: null }, 'MILESTONE_CORRECTION_REQUESTED', { reason: dto.reason });
  }

  technicalOpinion(projectId: string, id: string, dto: OpinionDto) {
    assertCan(currentRole(), 'MILESTONE_MANAGE', 'Somente a JGM4 emite o parecer técnico do marco.');
    const advance = dto.recommendation === 'ADVANCE';
    return this.transition(projectId, id, ['UNDER_REVIEW'], advance
      ? { status: 'TECHNICALLY_APPROVED', technicalOpinion: dto.opinion, technicalRecommendation: dto.recommendation, technicalApprovedAt: new Date(), technicalApprovedByUserId: currentUserId() }
      : { status: 'CORRECTION_REQUIRED', technicalOpinion: dto.opinion, technicalRecommendation: dto.recommendation, correctionReason: dto.opinion }, 'MILESTONE_TECHNICAL_OPINION', { recommendation: dto.recommendation, opinion: dto.opinion });
  }

  clientDecision(projectId: string, id: string, dto: ClientDecisionDto) {
    assertCan(currentRole(), 'MILESTONE_CLIENT_DECISION', 'Somente patrocinador ou gestor da Ollem decide o marco.');
    if (dto.decision !== 'APPROVE' && !dto.comment?.trim()) throw new BadRequestException('Informe o motivo ao manter ou rejeitar o marco.');
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const status: GateStatus = dto.decision === 'APPROVE' ? 'APPROVED' : dto.decision === 'REJECT' ? 'REJECTED' : 'TECHNICALLY_APPROVED';
    return this.transition(projectId, id, ['TECHNICALLY_APPROVED'], { status, clientDecision: dto.decision, clientDecisionComment: dto.comment?.trim() ?? null, clientDecisionByUserId: currentUserId(), clientDecisionAt: new Date(), ...(dto.decision === 'APPROVE' ? { actualDate: today } : {}) },
      'MILESTONE_CLIENT_DECISION', { decision: dto.decision, comment: dto.comment ?? null });
  }
}

