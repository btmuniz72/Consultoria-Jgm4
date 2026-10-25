import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { currentRole, currentUserId } from '../approvals/authority';
import { assertProjectOpen } from './project-guard';
import { AuthService } from '../auth/auth.service';

export class HoldDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsDateString() effectiveDate!: string;
  @IsString() @MinLength(3) @MaxLength(5000) note!: string;
  @IsOptional() @IsDateString() expectedResumeDate?: string;
}
export class CancelDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsDateString() effectiveDate!: string;
  @IsString() @MinLength(3) @MaxLength(5000) note!: string;
  // Ação crítica e irreversível: exige a senha de quem cancela (e o código MFA, quando ativo).
  @IsOptional() @IsString() @MaxLength(200) confirmPassword?: string;
  @IsOptional() @IsString() @MaxLength(8) mfaCode?: string;
}
export class ResumeDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
}
export class SustainmentDto {
  @IsString() @MinLength(2) @MaxLength(500) routine!: string;
  @IsString() @MinLength(2) @MaxLength(200) frequency!: string;
  @IsString() @MinLength(2) @MaxLength(200) responsible!: string;
  @IsOptional() @IsString() @MaxLength(500) indicator?: string;
  @IsOptional() @IsString() @MaxLength(1000) criterion?: string;
  @IsOptional() @IsDateString() nextReviewDate?: string;
}
export class SustainmentPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) routine?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) frequency?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) responsible?: string;
  @IsOptional() @IsString() @MaxLength(500) indicator?: string;
  @IsOptional() @IsString() @MaxLength(1000) criterion?: string;
  @IsOptional() @IsDateString() nextReviewDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class CarriedOverDto {
  @IsUUID() fromPhaseId!: string;
  @IsUUID() toPhaseId!: string;
  @IsString() @MinLength(3) @MaxLength(2000) description!: string;
  @IsString() @MinLength(2) @MaxLength(200) responsible!: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const iso = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;

@Injectable()
export class LifecycleService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  private async load(projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, company: { active: true } }, select: { id: true, status: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return project;
  }

  /** Muda o estado, registra o evento (histórico imutável) e a auditoria na mesma transação. */
  private async change(projectId: string, allowedFrom: string[], to: 'ON_HOLD' | 'CANCELLED' | 'IN_PROGRESS', input: { reason: string; note?: string; effectiveDate: Date; expectedResumeDate?: Date }, action: string) {
    await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
      if (!project) throw new NotFoundException('Projeto não encontrado.');
      if (!allowedFrom.includes(project.status)) throw new ConflictException(`Transição não permitida a partir do estado ${project.status}.`);
      await tx.project.update({ where: { id: projectId }, data: { status: to } });
      await tx.projectStatusEvent.create({ data: { projectId, fromStatus: project.status, toStatus: to, reason: input.reason.trim(), note: input.note?.trim() || null,
        effectiveDate: input.effectiveDate, expectedResumeDate: input.expectedResumeDate ?? null, createdByUserId: currentUserId(), createdByRole: currentRole() } });
      await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Project', entityId: projectId, action, actorType: currentRole(),
        oldValue: { status: project.status }, newValue: { status: to, reason: input.reason.trim(), note: input.note?.trim() || null, effectiveDate: iso(input.effectiveDate), expectedResumeDate: iso(input.expectedResumeDate ?? null) } } });
    });
    return this.status(projectId);
  }
  hold(projectId: string, dto: HoldDto) {
    return this.change(projectId, ['PLANNING', 'PLANNED', 'IN_PROGRESS'], 'ON_HOLD', { reason: dto.reason, note: dto.note, effectiveDate: toDate(dto.effectiveDate), expectedResumeDate: dto.expectedResumeDate ? toDate(dto.expectedResumeDate) : undefined }, 'PROJECT_ON_HOLD');
  }
  async cancel(projectId: string, dto: CancelDto) {
    const userId = currentUserId(); if (userId) await this.auth.reauthenticate(userId, { password: dto.confirmPassword, mfaCode: dto.mfaCode });
    return this.change(projectId, ['PLANNING', 'PLANNED', 'IN_PROGRESS', 'ON_HOLD'], 'CANCELLED', { reason: dto.reason, note: dto.note, effectiveDate: toDate(dto.effectiveDate) }, 'PROJECT_CANCELLED');
  }
  resume(projectId: string, dto: ResumeDto) {
    return this.change(projectId, ['ON_HOLD'], 'IN_PROGRESS', { reason: dto.reason, note: dto.note, effectiveDate: toDate(new Date().toISOString()) }, 'PROJECT_RESUMED');
  }
  async status(projectId: string) {
    const project = await this.load(projectId);
    const events = await this.prisma.projectStatusEvent.findMany({ where: { projectId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { createdBy: { select: { name: true } } } });
    return { status: project.status, events: events.map((event) => ({ id: event.id, from: event.fromStatus, to: event.toStatus, reason: event.reason, note: event.note, effectiveDate: iso(event.effectiveDate),
      expectedResumeDate: iso(event.expectedResumeDate), by: event.createdBy?.name ?? event.createdByRole, role: event.createdByRole, at: event.createdAt })) };
  }

  // ---------------------------------------------------------------- plano de sustentação
  async sustainment(projectId: string) {
    await this.load(projectId);
    return (await this.prisma.sustainmentItem.findMany({ where: { projectId }, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] })).map((item) => ({ ...item, nextReviewDate: iso(item.nextReviewDate) }));
  }
  async addSustainment(projectId: string, dto: SustainmentDto) {
    await this.load(projectId); await assertProjectOpen(this.prisma, projectId);
    const item = await this.prisma.sustainmentItem.create({ data: { projectId, routine: dto.routine.trim(), frequency: dto.frequency.trim(), responsible: dto.responsible.trim(), indicator: dto.indicator?.trim() || null,
      criterion: dto.criterion?.trim() || null, nextReviewDate: dto.nextReviewDate ? toDate(dto.nextReviewDate) : null, createdByUserId: currentUserId() } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'SustainmentItem', entityId: item.id, action: 'SUSTAINMENT_ITEM_CREATED', actorType: currentRole(), newValue: { routine: item.routine, frequency: item.frequency, responsible: item.responsible } } });
    return { ...item, nextReviewDate: iso(item.nextReviewDate) };
  }
  async updateSustainment(projectId: string, itemId: string, dto: SustainmentPatchDto) {
    await assertProjectOpen(this.prisma, projectId);
    const existing = await this.prisma.sustainmentItem.findFirst({ where: { id: itemId, projectId } });
    if (!existing) throw new NotFoundException('Item de sustentação não encontrado neste projeto.');
    const { nextReviewDate, ...rest } = dto;
    if (!Object.keys(dto).length) throw new BadRequestException('Informe ao menos um campo.');
    const item = await this.prisma.sustainmentItem.update({ where: { id: itemId }, data: { ...rest, ...(nextReviewDate ? { nextReviewDate: toDate(nextReviewDate) } : {}) } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'SustainmentItem', entityId: itemId, action: dto.active === false ? 'SUSTAINMENT_ITEM_DEACTIVATED' : 'SUSTAINMENT_ITEM_UPDATED', actorType: currentRole(),
      oldValue: { routine: existing.routine, frequency: existing.frequency, responsible: existing.responsible, active: existing.active }, newValue: dto as object } });
    return { ...item, nextReviewDate: iso(item.nextReviewDate) };
  }

  // ---------------------------------------------------------------- pendências transferidas
  async carried(projectId: string) {
    await this.load(projectId);
    const items = await this.prisma.carriedOverItem.findMany({ where: { projectId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], include: { fromPhase: { select: { order: true, name: true } }, toPhase: { select: { order: true, name: true } } } });
    return items.map((item) => ({ id: item.id, description: item.description, responsible: item.responsible, dueDate: iso(item.dueDate), status: item.status, resolvedAt: item.resolvedAt,
      fromPhase: item.fromPhase, toPhase: item.toPhase, fromPhaseId: item.fromPhaseId, toPhaseId: item.toPhaseId, createdAt: item.createdAt }));
  }
  async addCarried(projectId: string, dto: CarriedOverDto) {
    await this.load(projectId); await assertProjectOpen(this.prisma, projectId);
    const phases = await this.prisma.phase.findMany({ where: { projectId, id: { in: [dto.fromPhaseId, dto.toPhaseId] } }, include: { gate: { select: { status: true } } } });
    const from = phases.find((phase) => phase.id === dto.fromPhaseId); const to = phases.find((phase) => phase.id === dto.toPhaseId);
    if (!from || !to) throw new BadRequestException('Fase de origem ou destino não pertence ao projeto.');
    if (to.order <= from.order) throw new BadRequestException('A fase de destino deve ser posterior à fase de origem.');
    if (from.status !== 'COMPLETED' && !['TECHNICALLY_APPROVED', 'APPROVED'].includes(from.gate?.status ?? '')) throw new ConflictException('Só é possível transferir pendências de uma fase em encerramento (Gate com parecer favorável ou aprovado).');
    const item = await this.prisma.carriedOverItem.create({ data: { projectId, fromPhaseId: from.id, toPhaseId: to.id, description: dto.description.trim(), responsible: dto.responsible.trim(), dueDate: dto.dueDate ? toDate(dto.dueDate) : null, createdByUserId: currentUserId() } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'CarriedOverItem', entityId: item.id, action: 'ITEM_CARRIED_OVER', actorType: currentRole(),
      newValue: { fromPhase: from.order, toPhase: to.order, description: item.description, responsible: item.responsible, dueDate: iso(item.dueDate) } } });
    return { ...item, dueDate: iso(item.dueDate) };
  }
  async resolveCarried(projectId: string, itemId: string) {
    await assertProjectOpen(this.prisma, projectId);
    const item = await this.prisma.carriedOverItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new NotFoundException('Pendência não encontrada neste projeto.');
    if (item.status === 'RESOLVED') throw new ConflictException('Pendência já resolvida.');
    const updated = await this.prisma.carriedOverItem.update({ where: { id: itemId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'CarriedOverItem', entityId: itemId, action: 'CARRIED_ITEM_RESOLVED', actorType: currentRole(), oldValue: { status: 'OPEN' }, newValue: { status: 'RESOLVED' } } });
    return { ...updated, dueDate: iso(updated.dueDate) };
  }
}
