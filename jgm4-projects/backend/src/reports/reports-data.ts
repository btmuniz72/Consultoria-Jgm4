import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { daysLate, startOfDay } from '../dashboard/dashboard.calc';
import { fmtDate, label, statusLabels } from './report-doc';

export class HoursQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @IsIn(['JGM4', 'CLIENT']) organization?: 'JGM4' | 'CLIENT';
  @IsOptional() @IsUUID() userId?: string;
}
export class AuditQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
export class DetailQuery { @IsOptional() @IsIn(['true', 'false']) detail?: string }

const day = (value: string, end = false) => new Date(`${value.slice(0, 10)}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
const num = (value: { toNumber(): number } | null | undefined) => value?.toNumber() ?? 0;
const orgLabel = (org: string) => (org === 'JGM4' ? 'JGM4' : 'Cliente');
const MAX_EXPORT_ROWS = 20000;

@Injectable()
export class ReportsData {
  constructor(private readonly prisma: PrismaService) {}

  async names(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const users = unique.length ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, role: true } }) : [];
    return new Map(users.map((user) => [user.id, user]));
  }

  // ---------------------------------------------------------------- plano de ação (atividades)
  async actionPlan(projectId: string) {
    const [tasks, hours] = await Promise.all([
      this.prisma.task.findMany({ where: { projectId, phase: { archived: false } }, orderBy: [{ phase: { order: 'asc' } }, { code: 'asc' }], include: {
        phase: { select: { order: true, name: true, status: true } }, predecessor: { select: { code: true } }, gate: { select: { code: true, status: true } },
        clientResponsible: { select: { name: true } }, jgm4Responsible: { select: { name: true } },
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { code: true } } } }),
      this.prisma.timeEntry.groupBy({ by: ['taskId', 'organizationType'], where: { projectId }, _sum: { hours: true } }),
    ]);
    const actual = new Map(hours.map((row) => [`${row.taskId}:${row.organizationType}`, num(row._sum.hours)]));
    const today = startOfDay(new Date());
    const active = ['RELEASED', 'IN_PROGRESS', 'WAITING_EVIDENCE', 'WAITING_JGM4_VALIDATION', 'ADJUSTMENT_REQUESTED', 'VALIDATED'];
    return tasks.map((task) => {
      const due = task.nextActionDueDate ?? task.plannedEndDate;
      const late = active.includes(task.status) && !['LOCKED', 'BLOCKED'].includes(task.phase.status) ? daysLate(due, today) : 0;
      const deps = [task.predecessor ? `Atividade ${task.predecessor.code}` : null, ...task.requests.map((request) => `Solicitação ${request.code}`), task.gate && task.gate.status !== 'APPROVED' ? `Aprovação do ${task.gate.code}` : null].filter(Boolean) as string[];
      const owner = task.currentOwnerType === 'JGM4' ? 'JGM4' : task.currentOwnerType === 'CLIENT' ? 'Cliente' : task.currentOwnerType === 'SYSTEM' ? 'Sistema' : '—';
      return {
        code: task.code, phase: `Fase ${task.phase.order} — ${task.phase.name}`, title: task.title, description: task.description ?? task.objective,
        responsible: task.responsibilityType === 'JGM4' ? task.jgm4Responsible?.name ?? 'A definir' : task.clientResponsible?.name ?? task.jgm4Responsible?.name ?? 'A definir',
        organization: task.responsibilityType === 'JGM4' ? 'JGM4' : task.responsibilityType === 'CLIENT' ? 'Cliente' : 'Conjunta',
        status: label(statusLabels.task, task.status), priority: late > 0 ? 'Alta' : 'Normal',
        plannedStart: task.plannedStartDate, plannedEnd: task.plannedEndDate, actualStart: task.actualStartDate, actualEnd: task.actualEndDate,
        nextAction: task.nextAction ?? '', nextOwner: owner, nextDue: task.nextActionDueDate,
        jgm4Planned: num(task.plannedJgm4Hours), jgm4Actual: actual.get(`${task.id}:JGM4`) ?? 0, clientPlanned: num(task.plannedClientHours), clientActual: actual.get(`${task.id}:CLIENT`) ?? 0,
        dependencies: deps.join('; '), notes: late > 0 ? `Atrasada ${late} dia(s).` : task.status === 'BLOCKED' ? `Aguardando: ${deps.join('; ') || 'liberação da fase'}.` : '',
      };
    });
  }

  // ---------------------------------------------------------------- horas
  async hours(projectId: string, filters: HoursQuery) {
    const where: Prisma.TimeEntryWhereInput = { projectId, ...(filters.phaseId ? { phaseId: filters.phaseId } : {}), ...(filters.organization ? { organizationType: filters.organization } : {}), ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to ? { date: { ...(filters.from ? { gte: day(filters.from) } : {}), ...(filters.to ? { lte: day(filters.to) } : {}) } } : {}) };
    const entries = await this.prisma.timeEntry.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], take: MAX_EXPORT_ROWS, include: {
      phase: { select: { order: true, name: true } }, task: { select: { code: true, title: true } }, user: { select: { name: true } }, project: { select: { name: true, company: { select: { name: true } } } } } });
    return entries.map((entry) => ({ date: entry.date, company: entry.project.company.name, project: entry.project.name, phase: `Fase ${entry.phase.order} — ${entry.phase.name}`, task: `${entry.task.code} — ${entry.task.title}`,
      user: entry.user?.name ?? '—', organization: orgLabel(entry.organizationType), hours: num(entry.hours), description: entry.description }));
  }

  // ---------------------------------------------------------------- histórico de solicitações
  async requestsHistory(projectId: string) {
    const [requests, logs] = await Promise.all([
      this.prisma.projectRequest.findMany({ where: { projectId }, orderBy: [{ phase: { order: 'asc' } }, { code: 'asc' }], include: { phase: { select: { order: true, name: true } }, clientResponsible: { select: { name: true } } } }),
      this.prisma.auditLog.findMany({ where: { projectId, entityType: 'ProjectRequest', action: { in: ['STATUS_CHANGED', 'ACCEPTED', 'CANCELLED'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { entityId: true, action: true, createdAt: true, newValue: true } }),
    ]);
    const first = new Map<string, Date>(); const accepted = new Map<string, Date>(); const sent = new Map<string, Date>();
    for (const log of logs) {
      const status = log.action === 'ACCEPTED' ? 'ACCEPTED' : (log.newValue as { status?: string } | null)?.status;
      const key = log.entityId;
      if (status === 'REQUESTED' && !first.has(key)) first.set(key, log.createdAt);
      if (status === 'SENT_TO_JGM4') sent.set(key, log.createdAt); // último envio
      if (status === 'ACCEPTED') accepted.set(key, log.createdAt);
    }
    const today = startOfDay(new Date());
    return requests.map((request) => {
      const open = !['ACCEPTED', 'CANCELLED', 'BLOCKED', 'PLANNED'].includes(request.status);
      const late = open ? daysLate(request.dueDate, today) : 0;
      const result = request.status === 'ACCEPTED' ? 'Aceita' : request.status === 'CANCELLED' ? 'Cancelada' : request.status === 'ADJUSTMENT_REQUESTED' ? 'Ajuste solicitado' : request.status === 'BLOCKED' || request.status === 'PLANNED' ? 'Ainda não iniciada' : 'Em andamento';
      return { code: request.code, title: request.title, phase: `Fase ${request.phase.order} — ${request.phase.name}`, status: label(statusLabels.request, request.status), responsible: request.clientResponsible?.name ?? 'A definir',
        createdAt: request.createdAt, requestedAt: first.get(request.id) ?? null, sentAt: sent.get(request.id) ?? null, acceptedAt: accepted.get(request.id) ?? null, dueDate: request.dueDate, lateDays: late, result };
    });
  }

  // ---------------------------------------------------------------- auditoria
  async audit(projectId: string, filters: AuditQuery, all = false) {
    const where: Prisma.AuditLogWhereInput = { projectId, ...(filters.userId ? { userId: filters.userId } : {}), ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.action ? { action: { contains: filters.action.toUpperCase().replaceAll(' ', '_'), mode: 'insensitive' } } : {}),
      ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: day(filters.from) } : {}), ...(filters.to ? { lte: day(filters.to, true) } : {}) } } : {}) };
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: all ? 0 : filters.offset ?? 0, take: all ? MAX_EXPORT_ROWS : filters.limit ?? 100 }),
    ]);
    const ids = (type: string) => [...new Set(logs.filter((log) => log.entityType === type).map((log) => log.entityId))];
    const [tasks, requests, gates, phases, approvals, users] = await Promise.all([
      this.prisma.task.findMany({ where: { id: { in: ids('Task') } }, select: { id: true, code: true } }),
      this.prisma.projectRequest.findMany({ where: { id: { in: ids('ProjectRequest') } }, select: { id: true, code: true } }),
      this.prisma.gate.findMany({ where: { id: { in: ids('Gate') } }, select: { id: true, code: true } }),
      this.prisma.phase.findMany({ where: { id: { in: ids('Phase') } }, select: { id: true, order: true } }),
      this.prisma.approval.findMany({ where: { id: { in: ids('Approval') } }, select: { id: true, entityCode: true, type: true } }),
      this.names(logs.map((log) => log.userId)),
    ]);
    const codes = new Map<string, string>();
    for (const row of tasks) codes.set(`Task:${row.id}`, row.code); for (const row of requests) codes.set(`ProjectRequest:${row.id}`, row.code); for (const row of gates) codes.set(`Gate:${row.id}`, row.code);
    for (const row of phases) codes.set(`Phase:${row.id}`, `Fase ${row.order}`); for (const row of approvals) codes.set(`Approval:${row.id}`, `${row.entityCode ?? ''} (${row.type})`.trim());
    const text = (value: unknown) => (value === null || value === undefined ? '' : JSON.stringify(value));
    const items = logs.map((log) => {
      const after = (log.newValue ?? {}) as Record<string, unknown>;
      const code = log.entityType === 'TimeEntry' ? String(after['code'] ?? '') : codes.get(`${log.entityType}:${log.entityId}`) ?? (log.entityType === 'Project' ? 'Projeto' : '');
      const context = [after['comment'], after['reason'], after['note'], after['justification']].find((value) => typeof value === 'string' && value) as string | undefined;
      return { id: log.id, at: log.createdAt, userId: log.userId, user: log.userId ? users.get(log.userId)?.name ?? '—' : log.actorType === 'SYSTEM' ? 'Sistema' : '—', role: log.actorType, action: log.action,
        entityType: log.entityType, entity: code ? `${log.entityType} ${code}` : log.entityType, before: text(log.oldValue), after: text(log.newValue), context: context ?? '' };
    });
    return { total, items };
  }

  async history(projectId: string) {
    const rows = await this.prisma.reportGenerationLog.findMany({ where: { projectId }, orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }], take: 100, include: { generatedBy: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, reportType: row.reportType, format: row.format, fileName: row.fileName, generatedAt: row.generatedAt, by: row.generatedBy?.name ?? row.generatedByRole ?? '—', role: row.generatedByRole, parameters: row.parameters }));
  }
  async project(projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, company: { active: true } }, include: { company: { select: { name: true } } } });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return project;
  }
  fmt = fmtDate;
}
