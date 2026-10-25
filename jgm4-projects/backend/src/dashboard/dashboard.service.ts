import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../auth/access.service';
import { currentUser } from '../approvals/authority';
import { OPEN_STATUSES } from '../approvals/approval-sync';
import { RECENT_ACTIONS, RawLog, RawProject, buildProject, describeActivity, startOfDay } from './dashboard.calc';

const num = (value: { toNumber(): number } | null | undefined) => value?.toNumber() ?? 0;

// Todas as consultas são feitas uma única vez para o conjunto de projetos (sem consulta por atividade).
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  private async load(projectIds: string[]): Promise<RawProject[]> {
    if (!projectIds.length) return [];
    const where = { projectId: { in: projectIds } };
    const [projects, phases, gates, tasks, requests, approvals, hours, memberships] = await Promise.all([
      this.prisma.project.findMany({ where: { id: { in: projectIds }, company: { active: true } }, select: { id: true, name: true, description: true, status: true, commercialControlEnabled: true, plannedStartDate: true, plannedEndDate: true,
        company: { select: { id: true, name: true } }, sponsor: { select: { name: true } } } }),
      this.prisma.phase.findMany({ where: { ...where, archived: false }, select: { id: true, projectId: true, order: true, name: true, status: true, plannedWeeks: true, plannedJgm4Hours: true } }),
      this.prisma.gate.findMany({ where: { ...where, phase: { archived: false } }, select: { id: true, projectId: true, phaseId: true, code: true, title: true, status: true, currentOwnerType: true, nextAction: true, nextActionDueDate: true,
        criteria: { where: { archived: false }, select: { sourceType: true, satisfied: true, mandatory: true } } } }),
      this.prisma.task.findMany({ where: { ...where, phase: { archived: false } }, select: { id: true, projectId: true, phaseId: true, code: true, title: true, status: true, requiredForGate: true, currentOwnerType: true, nextAction: true, nextActionDueDate: true,
        plannedStartDate: true, plannedEndDate: true, actualStartDate: true, plannedJgm4Hours: true, plannedClientHours: true, responsibilityType: true, clientResponsibleUserId: true, jgm4ResponsibleUserId: true } }),
      this.prisma.projectRequest.findMany({ where: { ...where, phase: { archived: false } }, select: { id: true, projectId: true, phaseId: true, code: true, title: true, status: true, dueDate: true, mandatory: true, blocking: true, clientResponsibleId: true } }),
      this.prisma.approval.findMany({ where: { ...where, status: { in: OPEN_STATUSES } }, select: { id: true, projectId: true, type: true, entityType: true, entityId: true, entityCode: true, title: true, priority: true, dueAt: true, assignedRole: true, requestedAt: true } }),
      // Horas realizadas: única fonte é TimeEntry (agregado no banco).
      this.prisma.timeEntry.groupBy({ by: ['projectId', 'phaseId', 'organizationType'], where, _sum: { hours: true } }),
      this.prisma.projectMembership.findMany({ where: { ...where, active: true, user: { active: true } }, select: { projectId: true, user: { select: { id: true, name: true, role: true } } } }),
    ]);
    const group = <T extends { projectId: string }>(rows: T[]) => { const map = new Map<string, T[]>(); for (const row of rows) { (map.get(row.projectId) ?? map.set(row.projectId, []).get(row.projectId)!).push(row); } return map; };
    const byPhases = group(phases); const byGates = group(gates); const byTasks = group(tasks); const byRequests = group(requests);
    const byApprovals = group(approvals); const byHours = group(hours); const byMembers = group(memberships);
    return projects.map((project) => ({
      project: { commercialControlEnabled: project.commercialControlEnabled, id: project.id, name: project.name, description: project.description, status: project.status, plannedStartDate: project.plannedStartDate, plannedEndDate: project.plannedEndDate, company: project.company, sponsorName: project.sponsor?.name ?? null },
      phases: (byPhases.get(project.id) ?? []).map((phase) => ({ id: phase.id, order: phase.order, name: phase.name, status: phase.status, plannedWeeks: phase.plannedWeeks, plannedJgm4Hours: phase.plannedJgm4Hours })),
      gates: (byGates.get(project.id) ?? []).map(({ projectId: _p, ...gate }) => gate),
      tasks: (byTasks.get(project.id) ?? []).map(({ projectId: _p, plannedJgm4Hours, plannedClientHours, ...task }) => ({ ...task, plannedJgm4Hours: num(plannedJgm4Hours), plannedClientHours: num(plannedClientHours) })),
      requests: (byRequests.get(project.id) ?? []).map(({ projectId: _p, ...request }) => request),
      approvals: (byApprovals.get(project.id) ?? []).map(({ projectId: _p, ...approval }) => approval),
      hours: (byHours.get(project.id) ?? []).map((row) => ({ phaseId: row.phaseId, org: row.organizationType, hours: num(row._sum.hours) })),
      members: (byMembers.get(project.id) ?? []).map((row) => ({ userId: row.user.id, name: row.user.name, role: row.user.role })),
    }));
  }

  private viewer() { const user = currentUser()!; return { id: user.id, role: user.role }; }

  /** Dado bruto do projeto (para relatórios) e cálculo do dashboard sobre ele (mesmas regras de progresso, horas, atraso e saúde). */
  async raw(projectId: string) {
    const [raw] = await this.load([projectId]);
    if (!raw) throw new NotFoundException('Projeto não encontrado.');
    return raw;
  }
  build(raw: RawProject) { return buildProject(raw, startOfDay(new Date()), this.viewer()); }

  async project(projectId: string) {
    const [raw] = await this.load([projectId]);
    if (!raw) throw new NotFoundException('Projeto não encontrado.');
    const dashboard = buildProject(raw, startOfDay(new Date()), this.viewer());
    const externalDependencies = await this.prisma.externalDependency.findMany({ where: { projectId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, description: true, responsible: true, dueDate: true, status: true, blocksProject: true, blocksTask: true, taskId: true } });
    return { ...dashboard, externalDependencies, recentActivity: await this.recentActivity(projectId, raw) };
  }

  /** Últimas movimentações a partir do AuditLog (ordenadas da mais recente para a mais antiga). */
  private async recentActivity(projectId: string, raw: RawProject, limit = 10) {
    const logs = await this.prisma.auditLog.findMany({ where: { projectId, action: { in: RECENT_ACTIONS } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit * 4,
      select: { id: true, entityType: true, entityId: true, action: true, actorType: true, userId: true, createdAt: true, newValue: true } });
    const codes = new Map<string, string>();
    for (const task of raw.tasks) codes.set(`Task:${task.id}`, task.code);
    for (const request of raw.requests) codes.set(`ProjectRequest:${request.id}`, request.code);
    for (const gate of raw.gates) codes.set(`Gate:${gate.id}`, gate.code);
    for (const phase of raw.phases) codes.set(`Phase:${phase.id}`, `Fase ${phase.order}`);
    const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => !!id))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(users.map((user) => [user.id, user.name]));
    return logs.map((log) => describeActivity(log as RawLog, codes, names)).filter((item): item is NonNullable<typeof item> => !!item).slice(0, limit);
  }

  /** Visão multi-projeto da JGM4: somente projetos autorizados ao usuário (admin = todos; consultor = vínculos ativos). */
  async overview() {
    const user = currentUser()!;
    const scope = await this.access.accessibleProjectIds(user);
    const ids = scope ?? (await this.prisma.project.findMany({ where: { company: { active: true } }, select: { id: true } })).map((project) => project.id);
    const today = startOfDay(new Date());
    const built = (await this.load(ids)).map((raw) => buildProject(raw, today, this.viewer()));
    const weight = { CRITICO: 0, ATENCAO: 1, NORMAL: 2 } as const;
    const projects = built.map((item) => ({
      id: item.project.id, name: item.project.name, company: item.project.company, status: item.project.status, currentPhase: item.currentPhase, progress: item.progress.percent,
      health: item.health, gate: item.gate ? { id: item.gate.id, code: item.gate.code, title: item.gate.title, status: item.gate.status, percent: item.gate.percent } : null,
      nextAction: item.topAction, forecastEnd: item.schedule.forecastEnd, consultants: item.project.consultants,
      overdue: item.delays.count, approvalsPending: item.approvals.pending, jgm4Hours: item.hours.jgm4, myQueue: item.myQueue.count,
    })).sort((a, b) => weight[a.health.level] - weight[b.health.level] || a.name.localeCompare(b.name, 'pt-BR'));
    const sum = (pick: (item: typeof built[number]) => number) => built.reduce((total, item) => total + pick(item), 0);
    return {
      role: user.role,
      cards: {
        activeProjects: built.filter((item) => !['CANCELLED', 'IMPLEMENTATION_COMPLETED'].includes(item.project.status)).length,
        attention: built.filter((item) => item.health.level === 'ATENCAO').length,
        critical: built.filter((item) => item.health.level === 'CRITICO').length,
        approvalsPending: sum((item) => item.approvals.pending),
        jgm4Hours: Math.round(sum((item) => item.hours.jgm4.actual) * 100) / 100,
        clientHours: Math.round(sum((item) => item.hours.client.actual) * 100) / 100,
        overdue: sum((item) => item.delays.count),
      },
      projects,
    };
  }
}
